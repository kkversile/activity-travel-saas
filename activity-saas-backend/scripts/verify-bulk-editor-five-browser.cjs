// Read-only evidence capture for the Codex browser's isolated local staging run.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
assert(url.hostname === '127.0.0.1' && url.port === '55445' && url.username === 'voya_staging' && /^\/voya_import_fixes_\d+$/.test(url.pathname));
const evidence = path.resolve(process.env.BULK_IMPORT_EVIDENCE_DIR);
const fixture = JSON.parse(fs.readFileSync(path.join(evidence, 'five-browser-fixtures.json')));
assert(/^[A-Z0-9-]+$/.test(fixture.prefix) && /^[A-Z0-9-]+$/.test(fixture.browserPrefix));
const db = new PrismaClient({ datasourceUrl: url.href });
const financeTables = ['Booking','BookingEconomicsSnapshot','FinancialEvent','Payout','SettlementBatch','SettlementLine','SettlementEventAllocation','SettlementHold','PayoutAttempt','PayoutReleaseApprovalRequest','CommissionInvoice','FinanceConfiguration'];
async function snapshot(tx) {
  const finance = {}, catalogue = {};
  for (const table of financeTables) finance[table] = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0];
  const variant = 'JOIN "ProductVariant" v ON v.id=t."variantId" JOIN "Product" p ON p.id=v."productId"';
  const plan = 'JOIN "RatePlan" r ON r.id=t."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"';
  const schedule = 'JOIN "ScheduleTemplate" s ON s.id=t."scheduleTemplateId" JOIN "ProductVariant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId"';
  for (const [table, join, product] of [
    ['Product','','t'],['ProductRevision','JOIN "Product" p ON p.id=t."productId"','p'],['ProductVariant','JOIN "Product" p ON p.id=t."productId"','p'],
    ['RatePlan',variant,'p'],['RatePlanCommercialVersion',plan,'p'],['TravellerRule',plan,'p'],['CancellationRule',plan,'p'],
    ['RatePlanTravellerPrice','JOIN "RatePlanCommercialVersion" c ON c.id=t."commercialVersionId" JOIN "RatePlan" r ON r.id=c."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
    ['ScheduleTemplate',variant,'p'],['ScheduleSlotTemplate',schedule,'p'],['ServiceSession',schedule,'p'],
    ['InventoryState','JOIN "ServiceSession" ss ON ss.id=t."sessionId" JOIN "ScheduleTemplate" s ON s.id=ss."scheduleTemplateId" JOIN "ProductVariant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
  ]) catalogue[table] = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t ${join} WHERE COALESCE(${product}."sourceImportKey",'') NOT LIKE '${fixture.prefix}%' AND COALESCE(${product}."sourceImportKey",'') NOT LIKE '${fixture.browserPrefix}%'`))[0];
  const active = await tx.ratePlanCommercialVersion.findMany({ where: { ratePlan: { variantId: { in: [fixture.personVariantId,fixture.groupVariantId] } }, status: 'ACTIVE' }, include: { travellerPrices: { orderBy: { travellerType: 'asc' } } }, orderBy: { id: 'asc' } });
  return JSON.parse(JSON.stringify({ finance,catalogue,active }));
}
(async () => {
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const protectedState = await snapshot(tx), baseline = path.join(evidence,'five-browser-baseline.json');
    if (process.argv.includes('--baseline')) {
      assert(!fs.existsSync(baseline));
      assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'staging-verification.json'))).pass,true);
      fs.writeFileSync(baseline,JSON.stringify(protectedState,null,2));
      return { pass:true,readOnly:true,baselineRecorded:true,database:url.pathname };
    }
    assert.deepEqual(protectedState,JSON.parse(fs.readFileSync(baseline)),'Protected finance, catalogue or ACTIVE versions changed');
    const product = await tx.product.findUniqueOrThrow({ where:{id:fixture.productId}, include:{variants:{include:{ratePlans:{include:{travellerRules:true,cancellationRules:true,commercialVersions:{include:{travellerPrices:true},orderBy:{versionNumber:'desc'}}}}}}} });
    assert.equal(product.status,'DRAFT'); assert.equal(product.outletId,fixture.outletId);
    const at = (variantId,day) => product.variants.find(v=>v.id===variantId).ratePlans.flatMap(p=>p.commercialVersions)
      .filter(v=>['DRAFT','ACTIVE'].includes(v.status)&&v.effectiveFrom<=new Date(day)&&(!v.effectiveTo||v.effectiveTo>new Date(day))).sort((a,b)=>b.versionNumber-a.versionNumber)[0];
    const observed = ['2026-12-05','2026-12-15','2027-01-15','2027-02-05'].map(day=>({day,
      person:JSON.parse(JSON.stringify(at(fixture.personVariantId,day))),group:JSON.parse(JSON.stringify(at(fixture.groupVariantId,day)))}));
    const drafts = await tx.product.findMany({where:{sourceImportKey:{startsWith:fixture.browserPrefix},deletedAt:null},include:{revisions:true,variants:{include:{ratePlans:{include:{commercialVersions:true}},schedules:{include:{sessions:true}}}}}});
    if (process.argv.includes('--prepare-rates')) {
      assert.equal(drafts.length,6);
      const products=['-INR','-XLSX-A'].map(suffix=>drafts.find(d=>d.sourceImportKey.endsWith(suffix)));
      const usd=drafts.find(d=>d.sourceImportKey.endsWith('-USD'));assert(products.every(Boolean)&&usd);
      const headers=['product_code','option_code','valid_from','valid_to','adult_sell_inr','child_sell_inr','senior_sell_inr','base_sell_inr','mrp_inr'];
      const rows=products.map((p,index)=>[p.productCode,'SUNRISE-SHARED','2026-12-01','2027-01-01',String(1930+index*10),'','','','']);
      fs.writeFileSync(path.join(evidence,'five-two-product-rates.csv'),[headers,...rows].map(r=>r.join(',')).join('\r\n'));
      fs.writeFileSync(path.join(evidence,'five-mixed-currency-rates.csv'),[headers,rows[0],[usd.productCode,'SUNRISE-SHARED','2026-12-01','2027-01-01','1930','','','','']].map(r=>r.join(',')).join('\r\n'));
      const XLSX=require('../../activity-saas-frontend/node_modules/xlsx'),book=XLSX.utils.book_new();book.Workbook={WBProps:{date1904:true}};
      const serial=day=>(Date.parse(day+'T00:00:00Z')-Date.UTC(1904,0,1))/86400000;
      XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...rows.map(r=>[r[0],r[1],serial(r[2]),serial(r[3]),'','0','','',''])]),'Rates');
      fs.writeFileSync(path.join(evidence,'five-two-product-child-zero.xlsx'),Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'})));
      return {pass:true,readOnly:true,database:url.pathname,preparedTwoProductRates:true,productCodes:products.map(p=>p.productCode)};
    }
    if (!process.argv.includes('--checkpoint')) {
      assert.equal(drafts.length,6);
      for (const draft of drafts) {assert.equal(draft.status,'DRAFT');assert.equal(draft.outletId,fixture.outletId);assert.equal(draft.variants.length,2);assert.equal(draft.variants.flatMap(v=>v.schedules).flatMap(s=>s.sessions).length,28);}
      for (const {day,person,group} of observed) {
        const late=day>='2027-01-01',amounts=Object.fromEntries(person.travellerPrices.map(p=>[p.travellerType,String(p.amount)]));
        assert.deepEqual(amounts,{...fixture.reference[late?'january':'december'],ADULT:late?'1953':'1920',CHILD:late?'950':'0'},day);
        assert.deepEqual(person.sourcePayload.bookingRules.cancellationRules,fixture.reference[late?'januaryCancellation':'decemberCancellation']);
        assert.equal(group.supplierBaseAmount,'7300');
        assert.deepEqual(group.sourcePayload.bookingRules.cancellationRules,fixture.reference.groupCancellation);
        assert.deepEqual(group.sourcePayload.pricingDays,['SAT','SUN']);assert.equal(group.sourcePayload.pricingTimezone,'Asia/Dubai');assert.deepEqual(group.sourcePayload.pricingSlotCodes,['06:00']);
        assert.equal(group.sourcePayload.ratePeriods[0].adjustmentValue,'100');
        if(late){assert.equal(person.bookingMode,'MANUAL_ON_REQUEST');assert.equal(person.confirmationSlaMinutes,90);assert.equal(group.bookingMode,'MANUAL_ON_REQUEST');assert.equal(group.confirmationSlaMinutes,90);}
        for(const [type,amount] of Object.entries(amounts))assert.equal(person.sourcePayload.visitorPrices.find(p=>p.travellerType===type).indian,amount);
      }
      const usd=drafts.find(d=>d.sourceImportKey.endsWith('-USD'));assert(usd);
      for(const plan of usd.variants.flatMap(v=>v.ratePlans)){assert.equal(plan.currency,'USD');assert(plan.commercialVersions.every(v=>v.currency==='USD'));}
      const versionFor=async(productId,day)=>tx.ratePlanCommercialVersion.findFirstOrThrow({where:{ratePlan:{variant:{productId,variantCode:'SUNRISE-SHARED'}},status:{in:['DRAFT','ACTIVE']},effectiveFrom:{lte:new Date(day)},effectiveTo:{gt:new Date(day)}},include:{travellerPrices:true},orderBy:{versionNumber:'desc'}});
      assert.equal(String((await versionFor(usd.id,'2027-01-15')).travellerPrices.find(p=>p.travellerType==='ADULT').amount),'1950');
      for(const [suffix,adult] of [['-INR','1930'],['-XLSX-A','1940']]) {
        const draft=drafts.find(d=>d.sourceImportKey.endsWith(suffix));assert(draft);
        for(const [day,expectedAdult,expectedChild] of [['2026-12-15',adult,'0'],['2027-01-15','1800','900']]) {
          const v=await versionFor(draft.id,day),prices=Object.fromEntries(v.travellerPrices.map(p=>[p.travellerType,String(p.amount)]));
          assert.equal(prices.ADULT,expectedAdult);assert.equal(prices.CHILD,expectedChild);
        }
      }
      const legacy=drafts.find(d=>d.sourceImportKey.endsWith('-XLS'));assert.equal(legacy.revisions[0].durationUnit,'HOURS');
      for(const v of legacy.variants.flatMap(v=>v.ratePlans).flatMap(p=>p.commercialVersions))assert.equal(v.effectiveFrom.toISOString().slice(0,10),'2026-12-01');
    }
    return {pass:true,readOnly:true,database:url.pathname,protectedFinanceTables:12,protectedCatalogueTables:12,approvedVersionsUnchanged:true,observed,
      primaryProductId:product.id,importedDrafts:drafts.map(d=>({id:d.id,key:d.sourceImportKey,code:d.productCode}))};
  },{timeout:30000});
  const checkpoint=process.argv.includes('--checkpoint')?process.argv[process.argv.indexOf('--checkpoint')+1]:null;
  if(checkpoint)assert(/^[a-z0-9-]+$/.test(checkpoint));
  const name=process.argv.includes('--baseline')?'five-browser-baseline-receipt.json':process.argv.includes('--prepare-rates')?'five-two-product-fixtures.json':checkpoint?'five-browser-'+checkpoint+'.json':'five-browser-verification.json';
  fs.writeFileSync(path.join(evidence,name),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:result.pass,database:result.database,file:name,protectedFinanceTables:result.protectedFinanceTables,importedDrafts:result.importedDrafts?.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
