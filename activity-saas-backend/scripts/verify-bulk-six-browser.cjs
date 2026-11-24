const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
const url=process.env.BULK_IMPORT_STAGING_DATABASE_URL,target=new URL(url);
assert(target.hostname==='127.0.0.1'&&target.port==='55445'&&target.username==='voya_staging'&&/^\/voya_import_fixes_\d+$/.test(target.pathname),'Disposable loopback staging database required');
const evidence=path.resolve(process.env.BULK_IMPORT_EVIDENCE_DIR),fixture=JSON.parse(fs.readFileSync(path.join(evidence,'six-browser-session-fixtures.json'))),db=new PrismaClient({datasourceUrl:url});
const tables=['Booking','BookingEconomicsSnapshot','FinancialEvent','Payout','SettlementBatch','SettlementLine','SettlementEventAllocation','SettlementHold','PayoutAttempt','PayoutReleaseApprovalRequest','CommissionInvoice','FinanceConfiguration'];
async function hashFinance(tx){const result={};for(const table of tables)result[table]=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0];return result;}
async function approved(tx){const result={};for(const name of ['travellers','visitors']){const item=fixture.six[name];result[name]=await tx.ratePlanCommercialVersion.findMany({where:{ratePlan:{variantId:item.variantId},status:'ACTIVE'},include:{travellerPrices:{orderBy:{travellerType:'asc'}}},orderBy:{id:'asc'}});}return result;}
async function prices(tx,item,day){const version=await tx.ratePlanCommercialVersion.findFirstOrThrow({where:{ratePlan:{variantId:item.variantId},status:{in:['DRAFT','ACTIVE']},effectiveFrom:{lte:new Date(day)},effectiveTo:{gt:new Date(day)}},include:{travellerPrices:true},orderBy:{versionNumber:'desc'}});return {status:version.status,prices:Object.fromEntries(version.travellerPrices.map(item=>[item.travellerType,String(item.amount)])),source:version.sourcePayload};}
(async()=>{
 const report=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const finance=await hashFinance(tx),active=JSON.parse(JSON.stringify(await approved(tx)));
  const baselinePath=path.join(evidence,'six-browser-before.json');
  if(process.argv.includes('--baseline')){fs.writeFileSync(baselinePath,JSON.stringify({finance,active},null,2));return {baselineRecorded:true,protectedTables:tables.length};}
  const before=JSON.parse(fs.readFileSync(baselinePath));assert.deepEqual(finance,before.finance);assert.deepEqual(active,before.active,'A browser draft save changed approved prices');
  const owner=await tx.user.findUniqueOrThrow({where:{email:fixture.standard.email}}),drafts=await tx.product.findMany({where:{tenantId:owner.tenantId,sourceImportKey:{in:fixture.importKeys},deletedAt:null}});assert.equal(drafts.length,fixture.importKeys.length);for(const item of drafts){assert.equal(item.status,'DRAFT');assert.equal(item.outletId,fixture.standard.outletId);}
  const standard=await prices(tx,fixture.standard,'2026-12-15'),outside=await prices(tx,fixture.standard,'2027-01-15');
  assert.deepEqual(standard.prices,{ADULT:'1930',CHILD:'0',SENIOR:'1400'});assert.deepEqual(outside.prices,{ADULT:'1800',CHILD:'900',SENIOR:'1400'});assert.equal(standard.source.mrpAmount,'2200');
  const csvProduct=drafts.find(item=>item.sourceImportKey===fixture.prefix+'-CSV'),csvVariant=await tx.productVariant.findFirstOrThrow({where:{productId:csvProduct.id,variantCode:'SUNRISE-SHARED'}});
  const displayedCode=await tx.publicIdentifier.findUniqueOrThrow({where:{entityType_entityId:{entityType:'PRODUCT',entityId:csvProduct.id}}});assert.equal(displayedCode.publicCode,fixture.csvPublicCode);
  const publicCodeRate=await prices(tx,{variantId:csvVariant.id},'2026-12-15');assert.deepEqual(publicCodeRate.prices,{ADULT:'1930',CHILD:'0',SENIOR:'1400'});
  const travellers=await prices(tx,fixture.six.travellers,'2026-12-15');assert.deepEqual(travellers.prices,{ADULT:'2000',CHILD:'0',SENIOR:'1400',INFANT:'0',YOUTH:'1200',GROUP:'2000'});assert.equal(travellers.status,'DRAFT');
  const visitors=await prices(tx,fixture.six.visitors,'2026-12-15');assert.equal(visitors.prices.ADULT,'2100');assert.equal(visitors.prices.CHILD,'0');assert.equal(visitors.status,'DRAFT');
  assert.deepEqual(visitors.source.visitorPrices.find(item=>item.travellerType==='ADULT'),{travellerType:'ADULT',indian:'2100',foreign:'2600'});assert.equal(visitors.source.visitorPrices.find(item=>item.travellerType==='CHILD').foreign,'1500');assert.equal(visitors.source.visitorVerificationMode,'DOCUMENT_AT_BOOKING');
  const duplicateErrors=fs.readFileSync(path.join(evidence,'browser-six-duplicate-errors.csv'),'utf8');assert(duplicateErrors.includes('products[0].Basic_Info[0].product_key')&&duplicateErrors.includes('products[1].Basic_Info[0].product_key')&&duplicateErrors.includes('unique product_key'));
  return {pass:true,checkedAt:new Date().toISOString(),database:target.pathname,demoDrafts:drafts.map(item=>({id:item.id,key:item.sourceImportKey,outletId:item.outletId})),standard,outside,publicCodeRate,travellers,visitors,approvedPricesUnchanged:true,protectedFinanceTablesUnchanged:tables.length,jsonErrorDownloadVerified:true,readOnly:true};
 },{timeout:30000});
 fs.writeFileSync(path.join(evidence,process.argv.includes('--baseline')?'six-browser-baseline-report.json':'six-browser-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
