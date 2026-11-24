// Read-only verification of the real Codex browser imports on the isolated copy.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const url=process.env.BULK_IMPORT_STAGING_DATABASE_URL || 'postgresql://voya_staging@127.0.0.1:55445/voya_import_fixes_2026112403?schema=public',target=new URL(url);
assert(target.hostname==='127.0.0.1' && target.port==='55445' && target.username==='voya_staging' && /^\/voya_import_fixes_\d+$/.test(target.pathname),'Disposable local staging copy required');
const root=path.resolve(__dirname,'../../outputs/import-nine-fixes-20261124/staging'),fixture=JSON.parse(fs.readFileSync(path.join(root,'browser-session-fixtures.json')));
const current=new PrismaClient({datasourceUrl:url});
const template=new PrismaClient({datasourceUrl:'postgresql://voya_staging@127.0.0.1:55445/voya_readiness_recovery_review_20261119192801?schema=public'});
const tables=['Booking','BookingEconomicsSnapshot','FinancialEvent','Payout','SettlementBatch','SettlementLine','SettlementEventAllocation','SettlementHold','PayoutAttempt','PayoutReleaseApprovalRequest','CommissionInvoice','FinanceConfiguration'];
async function snapshot(tx){const result={};for(const table of tables)result[table]=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows, md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0];return result;}
async function readOnly(client,run){return client.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return run(tx);});}
(async()=>{
 const report=await readOnly(current,async tx=>{
  const owner=await tx.user.findUniqueOrThrow({where:{email:fixture.email}});
  const key=fixture.productImportKey.replace('BROWSER-BULK-','BROWSER-NAV-');
  const drafts=await tx.product.findMany({where:{tenantId:owner.tenantId,sourceImportKey:key,deletedAt:null}});assert.equal(drafts.length,1,'Browser re-upload created a duplicate');assert.equal(drafts[0].status,'DRAFT');assert.equal(drafts[0].outletId,fixture.outletId);
  async function prices(day){const version=await tx.ratePlanCommercialVersion.findFirstOrThrow({where:{ratePlan:{variantId:fixture.variantId},status:'DRAFT',effectiveFrom:{lte:new Date(day)},effectiveTo:{gt:new Date(day)}},include:{travellerPrices:true},orderBy:{versionNumber:'desc'}});return {day,amounts:Object.fromEntries(version.travellerPrices.map(item=>[item.travellerType,String(item.amount)])),mrp:version.sourcePayload?.mrpAmount};}
  const inside=await prices('2026-12-15'),outside=await prices('2027-01-15');assert.equal(inside.amounts.ADULT,'1930');assert.equal(inside.amounts.CHILD,'970');assert.equal(inside.amounts.SENIOR,'1400');assert.equal(inside.mrp,'2200');assert.equal(outside.amounts.ADULT,'1800');assert.equal(outside.amounts.CHILD,'900');
  const finance=await snapshot(tx),baseline=await readOnly(template,snapshot);assert.deepEqual(finance,baseline,'Browser uploads changed protected finance/booking records');
  const errors=fs.readFileSync(path.join(root,'browser-downloaded-error-rows.csv'),'utf8');assert(errors.includes('"CSV","4","A4","product_code"'));assert(errors.includes('Copy the existing product code from Your products.'));
  return {checkedAt:new Date().toISOString(),pass:true,database:target.pathname,browserProductDraftId:drafts[0].id,productCount:1,outletPreserved:true,inside,outside,protectedTables:tables,financialHashesMatchRestoredSource:true,errorDownloadHasSourceCellAndCorrection:true};
 });fs.writeFileSync(path.join(root,'browser-database-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{await current.$disconnect();await template.$disconnect();});
