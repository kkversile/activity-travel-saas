const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'outputs/product-entry-20261128'),meta={prefix:'UX-PRODUCT-ENTRY-20261128',api:'http://127.0.0.1:4088/api'},mode=process.argv[2];
assert(['before','after'].includes(mode)&&/^UX-PRODUCT-ENTRY-20261128$/.test(meta.prefix));
const database='postgresql://voya_staging@127.0.0.1:55445/voya_import_fixes_2026112801?schema=public',target=new URL(database);assert(target.hostname==='127.0.0.1'&&target.port==='55445'&&target.pathname==='/voya_import_fixes_2026112801');
const {PrismaClient}=require(path.join(root,'activity-saas-backend/node_modules/@prisma/client'));const db=new PrismaClient({datasources:{db:{url:database}}});
(async()=>{
 const initialIds=mode==='before'?await db.product.findMany({select:{id:true},orderBy:{id:'asc'}}):JSON.parse(fs.readFileSync(path.join(out,'protected-product-ids.json')));if(mode==='before')fs.writeFileSync(path.join(out,'protected-product-ids.json'),JSON.stringify(initialIds));const idList=initialIds.map(p=>"'"+p.id+"'").join(',');const snapshot=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const finance={},catalogue={};
  for(const table of ['Booking','BookingEconomicsSnapshot','FinancialEvent','Payout','SettlementBatch','SettlementLine','SettlementEventAllocation','SettlementHold','PayoutAttempt','PayoutReleaseApprovalRequest','CommissionInvoice','FinanceConfiguration'])finance[table]=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0];
  for(const [table,joins,p] of [
   ['Product','','t'],['ProductRevision','JOIN "Product" p ON p.id=t."productId"','p'],['ProductVariant','JOIN "Product" p ON p.id=t."productId"','p'],
   ['RatePlan','JOIN "ProductVariant" v ON v.id=t."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['RatePlanCommercialVersion','JOIN "RatePlan" r ON r.id=t."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['TravellerRule','JOIN "RatePlan" r ON r.id=t."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['CancellationRule','JOIN "RatePlan" r ON r.id=t."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['ScheduleTemplate','JOIN "ProductVariant" v ON v.id=t."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['ScheduleSlotTemplate','JOIN "ScheduleTemplate" s ON s.id=t."scheduleTemplateId" JOIN "ProductVariant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['ServiceSession','JOIN "ScheduleTemplate" s ON s.id=t."scheduleTemplateId" JOIN "ProductVariant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['InventoryState','JOIN "ServiceSession" ss ON ss.id=t."sessionId" JOIN "ScheduleTemplate" s ON s.id=ss."scheduleTemplateId" JOIN "ProductVariant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId"','p'],
   ['RatePlanTravellerPrice','JOIN "RatePlanCommercialVersion" c ON c.id=t."commercialVersionId" JOIN "RatePlan" r ON r.id=c."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"','p']
  ])catalogue[table]=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t ${joins} WHERE ${p}.id IN (${idList})`))[0];
  return {finance,catalogue};
 });
 if(mode==='before'){assert(!fs.existsSync(path.join(out,'browser-before.json')));fs.writeFileSync(path.join(out,'browser-before.json'),JSON.stringify(snapshot,null,2));}
 else{assert.deepEqual(snapshot,JSON.parse(fs.readFileSync(path.join(out,'browser-before.json'))));fs.writeFileSync(path.join(out,'browser-after.json'),JSON.stringify(snapshot,null,2));

 }
 console.log(JSON.stringify({pass:true,mode,stagingDatabase:target.pathname,readOnlyDatabaseChecks:true,protectedFinanceTables:12,protectedExistingCatalogueTables:12}));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
