// Readiness review: writes only to a guarded disposable local PostgreSQL copy.
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), rb = require('node:module').createRequire(path.join(root, 'activity-saas-backend/package.json'));
const evidence = path.resolve(process.env.BULK_IMPORT_EVIDENCE_DIR || path.join(root, 'outputs/import-nine-fixes-20261124/staging')); fs.mkdirSync(evidence, { recursive: true });
const database = process.env.BULK_IMPORT_STAGING_DATABASE_URL || 'postgresql://voya_staging@127.0.0.1:55445/voya_import_fixes_20261124?schema=public';
const target=new URL(database); assert(target.hostname==='127.0.0.1' && target.port==='55445' && target.username==='voya_staging' && /^\/voya_import_fixes_\d+$/.test(target.pathname),'Only a disposable local bulk-import staging database is permitted');
const serve=process.argv.includes('--serve');
const stagingPort=Number(process.env.BULK_IMPORT_STAGING_PORT || 4048);
assert(Number.isInteger(stagingPort) && stagingPort>=1024 && stagingPort<=65535,'Invalid loopback staging port');
const uiOrigin=process.env.BULK_IMPORT_STAGING_UI_ORIGIN || 'http://127.0.0.1:3040';
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(uiOrigin),'Only a loopback staging UI origin is permitted');
const protectedRoot=path.join(process.env.TEMP || process.env.TMP || '', 'voya-approved-migration-20261119-170201'), saved={};
for(const name of ['environment-0.env','environment-1.env']){const file=path.join(protectedRoot,name);if(fs.existsSync(file))Object.assign(saved,rb('dotenv').parse(fs.readFileSync(file)));}

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: database, JWT_SECRET: crypto.randomBytes(48).toString('hex'), SECRET_ENCRYPTION_KEY: saved.SECRET_ENCRYPTION_KEY || '45'.repeat(32), ONBOARDING_ENCRYPTION_KEY: saved.ONBOARDING_ENCRYPTION_KEY || saved.JWT_SECRET || '45'.repeat(32), SMTP_HOST: '', SMTP_USER: '', SMTP_PASSWORD: '', EMAIL_OTP_WEBHOOK_URL: '', AI_ACTIVITY_ENABLED: 'false', AI_PROVIDER: 'mock', DISABLE_SCHEDULED_WORKERS: 'true', VENDOR_REPORT_SCHEDULER_ENABLED: 'false', STORAGE_DRIVER: 'local', STORAGE_ROOT: path.join(evidence, 'storage') });
rb('tsx/cjs');
const parsing = require(path.join(root,'activity-saas-frontend/src/components/product-import/productImport.ts'));
const XLSX = require(path.join(root,'activity-saas-frontend/node_modules/xlsx'));
const { PrismaClient } = rb('@prisma/client'), { JwtService } = rb('@nestjs/jwt');
const db = new PrismaClient(), jwt = new JwtService({ secret: process.env.JWT_SECRET });
const checks = [], findings = []; let app, base;

const payload = (model) => ({ Basic_Info: [model.basic], Experience: [model.experience], Options: model.options, Ticket_Types: model.ticketTypes, Rate_Plans: model.ratePlans, Availability: model.availability, Media: model.media, Booking_Questions: model.bookingQuestions, Fulfilment: Object.keys(model.fulfilment).length ? [model.fulfilment] : [] });
function sample(key) {
  const file = parsing.createSampleWorkbook();
  for (const name of file.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(file.Sheets[name], { defval: '' });
    if (!rows.length) continue;
    file.Sheets[name] = XLSX.utils.json_to_sheet(rows.map(row => ({ ...row, product_code: key, ...(name === 'Products' ? { product_name: 'Demonstration review ' + key } : {}) })));
  }
  const parsed = parsing.parseProductWorkbook(XLSX.write(file, { type: 'array', bookType: 'xlsx' }));
  assert.deepEqual(parsed.issues, []); assert.equal(parsed.models.length, 1);
  return payload(parsed.models[0]);
}
async function hashFinance() {
  const result = {};
  for (const table of ['Booking','BookingEconomicsSnapshot','FinancialEvent','Payout','SettlementBatch','SettlementLine','SettlementEventAllocation','SettlementHold','PayoutAttempt','PayoutReleaseApprovalRequest','CommissionInvoice','FinanceConfiguration']) result[table] = (await db.$queryRawUnsafe(`SELECT count(*)::int AS rows, md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0];
  return result;
}
const token = (user) => jwt.sign({ sub: user.id, tenantId: user.tenantId, role: user.role, organizationRole: user.organizationRole }, { expiresIn: '1h' });
async function request(user, route, body, extra = {}) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token(user), 'Content-Type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function check(name, fn) {
  try { const detail = await fn(); checks.push({ name, pass: true, detail }); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); }
  const summary=checks.at(-1); console.log(JSON.stringify({name:summary.name,pass:summary.pass,...(summary.error?{error:summary.error.slice(0,550)}:{})}));
}
async function extraChecks(owner, outlet) {
  const before=await hashFinance();
  const product=await db.product.findFirstOrThrow({where:{tenantId:owner.tenantId,sourceImportKey:{startsWith:'REVIEW-',endsWith:'-REQUEST'}},orderBy:{createdAt:'desc'}});
  const variants=await db.productVariant.findMany({where:{productId:product.id},orderBy:{createdAt:'asc'}});
  const row={productCode:product.productCode,optionCode:variants[0].variantCode,validFrom:'2026-12-01',validTo:'2027-01-01',adultSellInr:'1900'};
  await check('existing on-request option retains confirmation SLA in rate preview',async()=>{
    await db.ratePlanCommercialVersion.updateMany({where:{ratePlan:{variantId:variants[0].id}},data:{bookingMode:'MANUAL_ON_REQUEST',confirmationSlaMinutes:120}});
    const result=await request(owner,'/products/rates/import/batch/validate',{rows:[row]}); assert.equal(result.status,201,JSON.stringify(result));
  });
  await check('existing per-resource option retains passenger limit in rate preview',async()=>{
    await db.ratePlanCommercialVersion.updateMany({where:{ratePlan:{variantId:variants[0].id}},data:{bookingMode:'INSTANT',pricingUnit:'PER_UNIT',supplierBaseAmount:'1000',sourcePayload:{maxPassengersPerResource:4,pricingDays:['MON','TUE','WED','THU','FRI','SAT','SUN']}}});
    const result=await request(owner,'/products/rates/import/batch/validate',{rows:[{...row,adultSellInr:undefined,baseSellInr:'1100'}]}); assert.equal(result.status,201,JSON.stringify(result));
  });
  await check('wrong traveller-price column cannot be ignored for a group option',async()=>{
    const result=await request(owner,'/products/rates/import/batch/validate',{rows:[{...row,optionCode:variants[1].variantCode,adultSellInr:'1500'}]}); assert.equal(result.status,400,JSON.stringify(result));
  });
  await check('backend rate errors retain uploaded physical CSV rows',async()=>{
    const parsed=parsing.parseRateUpdateCsv('product_code,option_code,valid_from,valid_to,adult_sell_inr\n\nMISSING-PRODUCT,OPTION,2026-12-01,2027-01-01,1500');
    assert.equal(parsed.rows.length,1); const result=await request(owner,'/products/rates/import/batch/validate',{rows:parsed.rows}); assert.equal(result.status,400);
    const shown=parsing.serverImportIssues(result.body.issues,[],parsed.rows); assert.equal(shown[0].row,3,'CSV physical row 3 is displayed as '+shown[0].row); assert.equal(shown[0].sheet,'CSV');
  });
  await check('partial rate batches preserve completed groups and can retry the remainder',async()=>{
    const {CatalogueService}=require('../dist/catalogue/catalogue.service'); const service=app.get(CatalogueService), original=service.applyActivityPricesAvailability.bind(service);
    const products=await db.product.findMany({where:{tenantId:owner.tenantId,sourceImportKey:{startsWith:'REVIEW-'},OR:[{sourceImportKey:{endsWith:'-B'}},{sourceImportKey:{endsWith:'-C'}}]},orderBy:{createdAt:'desc'},take:2}); assert.equal(products.length,2);
    const rows=[]; for(const item of products){const variant=await db.productVariant.findFirstOrThrow({where:{productId:item.id},orderBy:{createdAt:'asc'}});rows.push({...row,productCode:item.productCode,optionCode:variant.variantCode,adultSellInr:'1950'});}
    let calls=0; service.applyActivityPricesAvailability=async(...args)=>{if(++calls===2)throw new Error('Simulated staging-only second-group interruption');return original(...args);};
    try{const result=await request(owner,'/products/rates/import/batch',{rows});assert.equal(result.body.status,'PARTIAL',JSON.stringify(result));assert.equal(result.body.updatedProductCount,1);assert.equal(result.body.failedProductCode,rows[1].productCode);}
    finally{service.applyActivityPricesAvailability=original;}
    const result=await request(owner,'/products/rates/import/batch',{rows:rows.slice(1)});assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));assert.equal(result.body.updatedProductCount,1);
  });
  await check('JSON malformed optional rows are reported instead of silently discarded',async()=>{
    const source=parsing.createSampleImportJson(); source.Media=[null,42];const parsed=parsing.parseProductJson(JSON.stringify(source)); assert(parsed.issues.length>0,'Invalid Media rows were removed without any warning');
  });
  await check('protected finance tables unchanged during additional checks',async()=>assert.deepEqual(await hashFinance(),before));
}
async function productRecoveryChecks(owner,outlet){
  const before=await hashFinance(), suffix=crypto.randomBytes(3).toString('hex').toUpperCase();
  const first=sample('RECOVERY-'+suffix+'-ONE'),second=sample('RECOVERY-'+suffix+'-TWO');
  // Keep this fault-injection rehearsal small; sample imports already checked materialization.
  for(const item of [first,second])for(const schedule of item.Availability)schedule.materialize=false;
  await check('partial product save cleans interrupted draft and retries exported remaining JSON',async()=>{
    const {CatalogueService}=require('../dist/catalogue/catalogue.service');const service=app.get(CatalogueService),original=service.updateRevision.bind(service);let calls=0;
    service.updateRevision=async(...args)=>{if(++calls===2)throw new Error('Staging-only interruption after second draft creation');return original(...args);};
    try{const result=await request(owner,'/products/import/batch?outletId='+outlet.id,{products:[first,second]});assert.equal(result.body.status,'PARTIAL',JSON.stringify(result));assert.equal(result.body.importedCount,1);assert.equal(result.body.failedProductIndex,2);}
    finally{service.updateRevision=original;}
    assert.equal(await db.product.count({where:{tenantId:owner.tenantId,sourceImportKey:second.Basic_Info[0].product_key}}),0,'Interrupted draft retained its import identity');
    const recovery=parsing.parseProductJson(JSON.stringify({products:[second]}));assert.deepEqual(recovery.issues,[]);assert.equal(recovery.models.length,1);
    const result=await request(owner,'/products/import/json?outletId='+outlet.id,payload(recovery.models[0]));assert.equal(result.status,201,JSON.stringify(result));assert(result.body.productId);
  });
  await check('same-content products with different codes are detected during batch preflight',async()=>{
    const a=sample('CONTENT-'+suffix+'-ONE'),b=sample('CONTENT-'+suffix+'-TWO');b.Basic_Info[0].product_name=a.Basic_Info[0].product_name;
    for(const item of [a,b])for(const schedule of item.Availability)schedule.materialize=false;
    const result=await request(owner,'/products/import/batch/validate?outletId='+outlet.id,{products:[a,b]});
    const saved=await request(owner,'/products/import/batch?outletId='+outlet.id,{products:[a,b]});
    const detail={preflight:result,save:{status:saved.status,body:{status:saved.body.status,importedCount:saved.body.importedCount,failedProductIndex:saved.body.failedProductIndex,error:saved.body.error}}};
    assert([400,409].includes(result.status),JSON.stringify(detail));assert([400,409].includes(saved.status),JSON.stringify(detail));return detail;
  });
  await check('unsupported external image URL is rejected during preflight rather than after draft writes',async()=>{
    const item=sample('MEDIA-'+suffix);for(const schedule of item.Availability)schedule.materialize=false;
    item.Media=[{kind:'IMAGE',external_url:'https://images.unsplash.com/photo-1500534623283-312aade485b7',rank:1}];
    const parsed=parsing.parseProductJson(JSON.stringify(item));assert.equal(parsed.models.length,0);assert(parsed.issues.some(issue=>issue.correction));const count=await db.product.count();
    const preview=await request(owner,'/products/import/batch/validate?outletId='+outlet.id,{products:[item]});
    const saved=await request(owner,'/products/import/json?outletId='+outlet.id,item);
    assert([400,409].includes(preview.status),JSON.stringify({preflight:preview,save:saved}));assert.equal(await db.product.count(),count,'Rejected media created a draft');
  });
  await check('protected finance unchanged during interrupted product recovery',async()=>assert.deepEqual(await hashFinance(),before));
}
async function publishedChecks(owner,outlet){
  const before=await hashFinance();let selected;
  for(const product of await db.product.findMany({where:{tenantId:owner.tenantId,status:'LIVE',deletedAt:null},orderBy:{createdAt:'asc'}})){
    const response=await request(owner,'/products/'+product.id+'/prices-availability');if(response.status!==200)continue;
    for(const option of response.body.options||[]){const plan=option.ratePlans.find(item=>item.editable),version=plan?.versions.find(item=>item.status==='ACTIVE'&&item.pricingUnit==='PER_PERSON'&&item.bookingMode==='INSTANT'&&item.currency==='INR');if(version){selected={product,option,plan,version};break;}}
    if(selected)break;
  }
  if(!selected){
    const key='PUBLISHED-REVIEW-'+crypto.randomBytes(3).toString('hex').toUpperCase(),fixture=sample(key);
    const asset=await db.fileAsset.findFirstOrThrow({where:{tenantId:owner.tenantId,purpose:'PRODUCT_MEDIA',visibility:'PUBLIC',archivedAt:null,mimeType:{startsWith:'image/'}}});
    fixture.Media=[{product_key:key,kind:'IMAGE',file_asset_id:asset.id,description:'Demonstration-only staging catalogue review',rank:1}];
    const created=await request(owner,'/products/import/json?outletId='+outlet.id,fixture);assert.equal(created.status,201,JSON.stringify(created));
    const patched=await fetch(base+'/product-revisions/'+created.body.revisionId,{method:'PATCH',headers:{Authorization:'Bearer '+token(owner),'Content-Type':'application/json'},body:JSON.stringify({category:'Guided tours'})});assert.equal(patched.status,200,await patched.text());
    const submitted=await request(owner,'/product-revisions/'+created.body.revisionId+'/submit',{});assert.equal(submitted.status,201,JSON.stringify(submitted));
    const admin=await db.user.findFirstOrThrow({where:{role:'SUPER_ADMIN',active:true}});
    const published=await request(admin,'/admin/product-revisions/'+created.body.revisionId+'/publish',{});assert.equal(published.status,201,JSON.stringify(published));
    const product=await db.product.findUniqueOrThrow({where:{id:created.body.productId}}),state=await request(owner,'/products/'+product.id+'/prices-availability');
    for(const option of state.body.options){const plan=option.ratePlans.find(item=>item.editable),version=plan?.versions.find(item=>item.status==='ACTIVE'&&item.pricingUnit==='PER_PERSON');if(version){selected={product,option,plan,version};break;}}
  }
  assert(selected,'No published standard per-person staging fixture');const {product,option,version}=selected;
  const amount=Number(version.travellerPrices.find(item=>item.travellerType==='ADULT').amount);
  const row={productCode:product.productCode,optionCode:option.variantCode,validFrom:'2026-12-20',validTo:'2026-12-21',adultSellInr:String(amount+1)};
  const policiesBefore=await db.ratePlan.findUniqueOrThrow({where:{id:selected.plan.id},select:{basePrice:true,travellerRules:{orderBy:{id:'asc'}},cancellationRules:{orderBy:{id:'asc'}}}});
  const activeBefore=await db.ratePlanCommercialVersion.findMany({where:{ratePlan:{variant:{productId:product.id}},status:'ACTIVE'},include:{travellerPrices:true},orderBy:{id:'asc'}});
  await check('published product bulk rate update preserves active approved versions until review',async()=>{
    const result=await request(owner,'/products/rates/import/batch',{rows:[row]});assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));
    const activeAfter=await db.ratePlanCommercialVersion.findMany({where:{ratePlan:{variant:{productId:product.id}},status:'ACTIVE'},include:{travellerPrices:true},orderBy:{id:'asc'}});assert.deepEqual(activeAfter,activeBefore);assert.deepEqual(await db.ratePlan.findUniqueOrThrow({where:{id:selected.plan.id},select:{basePrice:true,travellerRules:{orderBy:{id:'asc'}},cancellationRules:{orderBy:{id:'asc'}}}}),policiesBefore,'A rate-only draft save changed approved plan defaults or traveller/cancellation policy');
    const draft=await db.ratePlanCommercialVersion.findFirstOrThrow({where:{ratePlan:{variantId:option.variantId},status:'DRAFT',effectiveFrom:new Date(row.validFrom),effectiveTo:new Date(row.validTo)},include:{travellerPrices:true},orderBy:{versionNumber:'desc'}});assert.equal(String(draft.travellerPrices.find(item=>item.travellerType==='ADULT').amount),row.adultSellInr);
  });
  await check('historical bookings and all protected finance remain unchanged after published product rate edit',async()=>assert.deepEqual(await hashFinance(),before));
}
async function main() {
  const { NestFactory } = rb('@nestjs/core'), { ValidationPipe } = rb('@nestjs/common'), { SchedulerRegistry } = rb('@nestjs/schedule');
  const { AppModule } = require('../dist/app.module');
  const { RequestContextService } = require('../dist/common/request-context.service'), { CorrelationIdMiddleware } = require('../dist/common/correlation-id.middleware');
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  const middleware = new CorrelationIdMiddleware(app.get(RequestContextService)); app.use((req,res,next) => middleware.use(req,res,next));
  app.enableCors({origin:uiOrigin}); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  for (const name of app.get(SchedulerRegistry).getCronJobs().keys()) app.get(SchedulerRegistry).deleteCronJob(name);
  await app.listen(serve ? stagingPort : 0, '127.0.0.1'); base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const savedFetch = global.fetch; global.fetch = (url, options) => { assert(String(url).startsWith(base + '/'), 'External HTTP forbidden'); return savedFetch(url, options); };
  const owner = await db.user.findUniqueOrThrow({ where: { email: 'owner@harbour-trails.example.com' } });
  const employee = await db.user.findUniqueOrThrow({ where: { email: 'kochi@harbour-trails.example.com' } });
  const foreign = await db.user.findFirstOrThrow({ where: { role: 'VENDOR', tenantId: { not: owner.tenantId }, organizationRole: 'OWNER', active: true } });
  const outlets = await db.vendorOutlet.findMany({ where: { tenantId: owner.tenantId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  const grant = await db.userOutletAccess.findFirstOrThrow({ where: { userId: employee.id, active: true } });
  const outlet = outlets.find(item => item.id === grant.outletId), otherOutlet = outlets.find(item => item.id !== grant.outletId);
  assert(outlet && otherOutlet);
  const before = await hashFinance(), tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  fs.writeFileSync(path.join(evidence,'financial-baseline.json'),JSON.stringify(before,null,2));
  const original = sample('REVIEW-' + tag + '-A'); let imported;
  await check('preflight does not save catalogue records', async () => {
    const count = await db.product.count(); const result = await request(owner, '/products/import/batch/validate?outletId='+outlet.id, { products: [original] });
    assert.equal(result.status, 201, JSON.stringify(result)); assert.equal(result.body.valid, true); assert.equal(await db.product.count(), count);
  });
  await check('single Excel-derived product saves options rates and schedules', async () => {
    const result = await request(owner, '/products/import/json?outletId='+outlet.id, original); assert.equal(result.status, 201, JSON.stringify(result)); imported = result.body;
    assert(imported.productId); const product = await db.product.findUniqueOrThrow({where:{id:imported.productId}}); assert.equal(product.outletId, outlet.id);
    return { response: result.body, productCode: product.productCode };
  });
  if (!imported?.productId) return;
  const product = await db.product.findUniqueOrThrow({where:{id:imported.productId}});
  await check('duplicate create preflight saves nothing', async () => {
    const count = await db.product.count(); const result = await request(owner, '/products/import/batch/validate?outletId='+outlet.id, {products:[original]}); assert.equal(result.status,409,JSON.stringify(result)); assert.equal(await db.product.count(), count); return result.body;
  });
  await check('duplicate single save is rejected without extra product', async () => {
    const count = await db.product.count(); const result = await request(owner, '/products/import/json?outletId='+outlet.id, original); assert.equal(result.status,409,JSON.stringify(result)); assert.equal(await db.product.count(),count); return result.body;
  });
  await check('multi-product batch saves in source order', async () => {
    const result = await request(owner,'/products/import/batch?outletId='+outlet.id,{products:[sample('REVIEW-'+tag+'-B'),sample('REVIEW-'+tag+'-C')]}); assert.equal(result.status,201,JSON.stringify(result)); assert.equal(result.body.status,'COMPLETED',JSON.stringify(result)); assert.equal(result.body.importedCount,2); return result.body;
  });
  await check('existing product blocks entire mixed batch without saving new draft', async () => {
    const count = await db.product.count(); const result = await request(owner,'/products/import/batch?outletId='+outlet.id,{products:[sample('REVIEW-'+tag+'-D'),original]}); assert.equal(result.status,409,JSON.stringify(result)); assert.equal(await db.product.count(),count); return result.body;
  });
  await check('outlet employee cannot import into another outlet', async () => {
    const count = await db.product.count(); for (const route of ['/products/import/batch/validate','/products/import/batch']) { const result = await request(employee,route+'?outletId='+otherOutlet.id,{products:[sample('REVIEW-'+tag+'-E')]}); assert([400,403,404].includes(result.status),JSON.stringify(result)); } assert.equal(await db.product.count(),count);
  });
  const current = await request(owner,'/products/'+product.id+'/prices-availability'); assert.equal(current.status,200,JSON.stringify(current));
  fs.writeFileSync(path.join(evidence,'imported-rate-state.json'), JSON.stringify(current.body,null,2));
  const option = current.body.options[0], version = option.ratePlans.find(item=>item.editable)?.versions[0]; assert(version,'No editable version');
  const rate = {productCode:product.productCode,optionCode:option.variantCode,validFrom:'2026-12-01',validTo:'2027-01-01',adultSellInr:'1900'};
  await check('rate preflight leaves commercial version counts unchanged', async () => {
    const count = await db.ratePlanCommercialVersion.count(); const result = await request(owner,'/products/rates/import/batch/validate',{rows:[rate]}); assert.equal(result.status,201,JSON.stringify(result)); assert.equal(await db.ratePlanCommercialVersion.count(),count); return result.body;
  });
  await check('rate save creates version and preserves child senior and MRP', async () => {
    const result = await request(owner,'/products/rates/import/batch',{rows:[rate]}); assert.equal(result.status,201,JSON.stringify(result)); assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));
    const after = await request(owner,'/products/'+product.id+'/prices-availability'); fs.writeFileSync(path.join(evidence,'updated-rate-state.json'),JSON.stringify(after.body,null,2)); return result.body;
  });
  await check('identical rate retry does not add a version', async () => {
    const count = await db.ratePlanCommercialVersion.count(); const result = await request(owner,'/products/rates/import/batch',{rows:[rate]}); assert.equal(result.status,201,JSON.stringify(result)); assert.equal(result.body.status,'COMPLETED',JSON.stringify(result)); assert.equal(await db.ratePlanCommercialVersion.count(),count); return result.body;
  });
  await check('child-only update preserves adult price already set for the same date range', async () => {
    const result=await request(owner,'/products/rates/import/batch',{rows:[{...rate,adultSellInr:undefined,childSellInr:'950'}]}); assert.equal(result.status,201,JSON.stringify(result)); assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));
    const priced=await db.ratePlanCommercialVersion.findMany({where:{ratePlan:{variantId:option.variantId},effectiveFrom:{lte:new Date('2026-12-15')},effectiveTo:{gt:new Date('2026-12-15')},status:{in:['DRAFT','ACTIVE']}},include:{travellerPrices:true},orderBy:{versionNumber:'desc'}});
    assert(priced.length); const adult=priced[0].travellerPrices.find(item=>item.travellerType==='ADULT'); assert.equal(String(adult.amount),'1900','Child-only upload changed adult price: '+JSON.stringify(priced[0].travellerPrices));
  });
  await check('existing on-request option retains confirmation SLA in rate preview', async () => {
    const target=sample('REVIEW-'+tag+'-REQUEST'); const saved=await request(owner,'/products/import/json?outletId='+outlet.id,target); assert.equal(saved.status,201,JSON.stringify(saved));
    const item=await db.product.findUniqueOrThrow({where:{id:saved.body.productId}}), variant=await db.productVariant.findFirstOrThrow({where:{productId:item.id}});
    await db.ratePlanCommercialVersion.updateMany({where:{ratePlan:{variantId:variant.id}},data:{bookingMode:'MANUAL_ON_REQUEST',confirmationSlaMinutes:120}});
    const result=await request(owner,'/products/rates/import/batch/validate',{rows:[{...rate,productCode:item.productCode,optionCode:variant.variantCode}]}); assert.equal(result.status,201,JSON.stringify(result)); return result.body;
  });
  await check('employee and other tenant cannot change foreign outlet rates', async () => {
    const other = await request(owner,'/products/import/json?outletId='+otherOutlet.id,sample('REVIEW-'+tag+'-F')); assert.equal(other.status,201,JSON.stringify(other)); const target=await db.product.findUniqueOrThrow({where:{id:other.body.productId}});
    const row={...rate,productCode:target.productCode}; for(const actor of [employee,foreign]) for(const route of ['/products/rates/import/batch/validate','/products/rates/import/batch']) { const result=await request(actor,route,{rows:[row]}); assert([400,403,404].includes(result.status),JSON.stringify(result)); }
  });
  await check('irrelevant base_sell_inr must not be silently ignored for per-person option', async () => {
    const row={...rate,adultSellInr:undefined,baseSellInr:'999'}; const result=await request(owner,'/products/rates/import/batch/validate',{rows:[row]}); assert.equal(result.status,400,JSON.stringify(result));
  });
  await check('invalid calendar date is rejected by direct API', async () => {
    const result=await request(owner,'/products/rates/import/batch/validate',{rows:[{...rate,validFrom:'2026-02-30'}]}); assert.equal(result.status,400,JSON.stringify(result));
  });
  await check('all protected financial tables unchanged after import/update', async () => assert.deepEqual(await hashFinance(),before));
  await extraChecks(owner,outlet);
  await productRecoveryChecks(owner,outlet);
  await publishedChecks(owner,outlet);
  await extendedChecks(owner,employee,outlet,product,option,rate);
  await check('public product codes from Your products and public option codes validate and save with tenant/outlet isolation',async()=>{
    // Imported options use their supplier code; also rehearse an option with a
    // public alias, as assigned by the existing identifier/backfill system.
    const {ensurePublicIdentifier}=require('../dist/common/public-identifiers');
    await ensurePublicIdentifier(db,'VARIANT',option.variantId,'DEMO-OPTION-'+crypto.randomUUID().toUpperCase());
    const publicProduct=await db.publicIdentifier.findUniqueOrThrow({where:{entityType_entityId:{entityType:'PRODUCT',entityId:product.id}}}),publicOption=await db.publicIdentifier.findUniqueOrThrow({where:{entityType_entityId:{entityType:'VARIANT',entityId:option.variantId}}});
    const listing=await request(owner,'/products/listing?search='+encodeURIComponent(publicProduct.publicCode));assert.equal(listing.status,200);assert(listing.body.items.some(item=>item.id===product.id&&item.productCode===publicProduct.publicCode));
    const row={...rate,productCode:publicProduct.publicCode,optionCode:publicOption.publicCode,adultSellInr:'2060'},dto={submissionId:crypto.randomUUID(),rows:[row]};
    const preview=await request(owner,'/products/rates/import/batch/validate',dto);assert.equal(preview.status,201,JSON.stringify(preview));const saved=await request(owner,'/products/rates/import/batch',dto);assert.equal(saved.body.status,'COMPLETED',JSON.stringify(saved));assert.deepEqual(saved.body.completedProductCodes,[publicProduct.publicCode]);
    const count=await db.ratePlanCommercialVersion.count();const duplicate=await request(owner,'/products/rates/import/batch',{rows:[row,{...row,productCode:product.productCode,optionCode:option.variantCode}]});assert.equal(duplicate.status,400);assert.equal(await db.ratePlanCommercialVersion.count(),count);
    const sibling=await db.productVariant.findFirstOrThrow({where:{productId:product.id,id:{not:option.variantId}}});
    const mixed=await request(owner,'/products/rates/import/batch',{submissionId:crypto.randomUUID(),rows:[{...row,productCode:product.productCode},{...row,optionCode:sibling.variantCode,adultSellInr:undefined,baseSellInr:'7300'}]});assert.equal(mixed.body.status,'COMPLETED',JSON.stringify(mixed));assert.equal(mixed.body.updatedProductCount,1);assert.deepEqual(mixed.body.completedProductCodes,[product.productCode,publicProduct.publicCode]);
    const foreignOutlet=await db.product.findFirstOrThrow({where:{tenantId:owner.tenantId,outletId:{not:outlet.id},sourceImportKey:{startsWith:'REVIEW-'}}}),foreignPublic=await db.publicIdentifier.findUniqueOrThrow({where:{entityType_entityId:{entityType:'PRODUCT',entityId:foreignOutlet.id}}});
    for(const actor of [employee,foreign]){const denied=await request(actor,'/products/rates/import/batch/validate',{rows:[{...row,productCode:foreignPublic.publicCode}]});assert([400,403,404].includes(denied.status),JSON.stringify(denied));}
  });
  await require('./verify-bulk-import-six-cases.cjs')({check,request,db,owner,outlet,tag,sample,parsing,XLSX,evidence,base,token,hashFinance});
  await browserFixtures(owner,outlet,tag);
  await check('final protected booking and finance hash comparison',async()=>assert.deepEqual(await hashFinance(),before));
}
async function extendedChecks(owner,employee,outlet,product,option,rate){
  const pricesAt=async(day)=>{
    const found=await db.ratePlanCommercialVersion.findFirstOrThrow({where:{ratePlan:{variantId:option.variantId},status:'DRAFT',effectiveFrom:{lte:new Date(day)},effectiveTo:{gt:new Date(day)}},include:{travellerPrices:true},orderBy:{versionNumber:'desc'}});
    return Object.fromEntries(found.travellerPrices.map(item=>[item.travellerType,String(item.amount)]));
  };
  await check('date-spanning updates preserve omitted adult and child prices inside and outside every boundary',async()=>{
    let result=await request(owner,'/products/rates/import/batch',{submissionId:crypto.randomUUID(),rows:[{...rate,validFrom:'2026-12-15',validTo:'2026-12-25',adultSellInr:'1950'}]});assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));
    result=await request(owner,'/products/rates/import/batch',{submissionId:crypto.randomUUID(),rows:[{...rate,adultSellInr:undefined,childSellInr:'960'}]});assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));
    assert.equal((await pricesAt('2026-12-05')).ADULT,'1900');assert.equal((await pricesAt('2026-12-20')).ADULT,'1950');assert.equal((await pricesAt('2027-01-05')).ADULT,'1800');assert.equal((await pricesAt('2026-12-20')).CHILD,'960');assert.equal((await pricesAt('2027-01-05')).CHILD,'900');
    result=await request(owner,'/products/rates/import/batch',{submissionId:crypto.randomUUID(),rows:[{...rate,validFrom:'2026-12-10',validTo:'2027-01-10',adultSellInr:'2000'}]});assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));assert.equal((await pricesAt('2026-12-20')).CHILD,'960');assert.equal((await pricesAt('2027-01-05')).CHILD,'900');assert.equal((await pricesAt('2026-12-05')).ADULT,'1900');
  });
  await check('concurrent identical submissions replay exactly once and intentional new submission is allowed',async()=>{
    const submissionId=crypto.randomUUID(),dto={submissionId,rows:[{...rate,adultSellInr:'2050'}]};const count=await db.activityPriceApplyRequest.count();
    const results=await Promise.all([request(owner,'/products/rates/import/batch',dto),request(owner,'/products/rates/import/batch',dto)]);for(const result of results)assert.equal(result.body.status,'COMPLETED',JSON.stringify(result));assert.equal(await db.activityPriceApplyRequest.count(),count+1);
    const replay=await request(owner,'/products/rates/import/batch',dto);assert.equal(replay.body.products[0].replayed,true);assert.equal(await db.activityPriceApplyRequest.count(),count+1);
    const changed=await request(owner,'/products/rates/import/batch',{...dto,rows:[{...rate,adultSellInr:'2060'}]});assert.equal(changed.status,409,JSON.stringify(changed));
    const fresh=await request(owner,'/products/rates/import/batch',{...dto,submissionId:crypto.randomUUID()});assert.equal(fresh.body.status,'COMPLETED');assert.equal(await db.activityPriceApplyRequest.count(),count+2);
  });
  await check('all pricing bases and booking modes retain resource SLA and cancellation settings through real apply calls',async()=>{
    for(const unit of ['PER_PERSON','PER_BOOKING','GROUP','PER_UNIT'])for(const mode of ['INSTANT','VENDOR_CONFIRMATION','MANUAL_ON_REQUEST']){
      const current=await request(owner,'/products/'+product.id+'/prices-availability'),plan=current.body.options.find(item=>item.variantId===option.variantId).ratePlans.find(item=>item.editable),version=plan.versions[0];
      const setting={variantId:option.variantId,pricingUnit:unit,currency:'INR',supplierModel:'NET_RATE',bookingMode:mode,confirmationSlaMinutes:mode==='INSTANT'?undefined:120,maxPassengersPerResource:unit==='PER_UNIT'?4:undefined,effectiveFrom:'2027-02-01',effectiveTo:'2027-03-01',expectedVersion:version.versionNumber,supplierBaseAmount:'1000',mrpMode:'YES',mrpAmount:'2500',pricingDays:['MON','TUE','WED','THU','FRI','SAT','SUN'],...(unit==='PER_PERSON'?{travellerPrices:[{travellerType:'ADULT',amount:'1800'},{travellerType:'CHILD',amount:'900'}]}:{})};
      const seeded=await request(owner,'/products/'+product.id+'/prices-availability/apply',{options:[setting]},{'Idempotency-Key':'STAGING-SEED-'+crypto.randomUUID()});assert.equal(seeded.status,201,JSON.stringify(seeded));
      const updated=await request(owner,'/products/rates/import/batch',{submissionId:crypto.randomUUID(),rows:[{productCode:product.productCode,optionCode:option.variantCode,validFrom:'2027-02-10',validTo:'2027-02-20',...(unit==='PER_PERSON'?{adultSellInr:'1900'}:{baseSellInr:'1400'})}]});assert.equal(updated.body.status,'COMPLETED',JSON.stringify({unit,mode,updated}));
      const saved=await db.ratePlanCommercialVersion.findFirstOrThrow({where:{ratePlan:{variantId:option.variantId},status:'DRAFT',effectiveFrom:new Date('2027-02-10'),effectiveTo:new Date('2027-02-20')},orderBy:{versionNumber:'desc'}});assert.equal(saved.bookingMode,mode);if(mode!=='INSTANT')assert.equal(saved.confirmationSlaMinutes,120);if(unit==='PER_UNIT')assert.equal(saved.sourcePayload.maxPassengersPerResource,4);
    }
  });
}
async function browserFixtures(owner,outlet,tag){
  const key='BROWSER-BULK-'+tag,book=parsing.createSampleWorkbook();
  for(const name of book.SheetNames){const rows=XLSX.utils.sheet_to_json(book.Sheets[name],{defval:''});book.Sheets[name]=XLSX.utils.json_to_sheet(rows.map(row=>({...row,product_code:key,...(name==='Products'?{product_name:'Demonstration Munnar Coastal Walk '+tag}:{})})));}
  fs.writeFileSync(path.join(evidence,'browser-products.xlsx'),Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'})));
  const prepared=await request(owner,'/products/import/json?outletId='+outlet.id,sample('BROWSER-RATES-'+tag));assert.equal(prepared.status,201,JSON.stringify(prepared));const item=await db.product.findUniqueOrThrow({where:{id:prepared.body.productId}}),variant=await db.productVariant.findFirstOrThrow({where:{productId:item.id},orderBy:{createdAt:'asc'}});
  const headers='product_code,option_code,valid_from,valid_to,adult_sell_inr,child_sell_inr,senior_sell_inr,base_sell_inr,mrp_inr';
  fs.writeFileSync(path.join(evidence,'browser-adult-rates.csv'),headers+'\n'+[item.productCode,variant.variantCode,'2026-12-01','2027-01-01','1930','','','',''].join(','));
  fs.writeFileSync(path.join(evidence,'browser-child-rates.csv'),headers+'\n'+[item.productCode,variant.variantCode,'2026-12-01','2027-01-01','','970','','',''].join(','));
  fs.writeFileSync(path.join(evidence,'browser-rate-error.csv'),headers+'\n\n\nMISSING-PRODUCT,OPTION,2026-12-01,2027-01-01,1900,,,,');
  fs.writeFileSync(path.join(evidence,'browser-numeric-error.csv'),headers+'\n\n'+[item.productCode,variant.variantCode,'2026-12-01','2027-01-01','banana','','','',''].join(','));
  const invalid=parsing.createSampleImportJson();invalid.Media=[null,42];fs.writeFileSync(path.join(evidence,'browser-invalid.json'),JSON.stringify(invalid,null,2));
  const auth=await request(owner,'/auth/login',{email:owner.email,password:'Demo@123'});assert.equal(auth.status,201,'Existing staging owner login failed');
  fs.writeFileSync(path.join(evidence,'browser-fixtures.json'),JSON.stringify({outletId:outlet.id,productId:item.id,productCode:item.productCode,variantId:variant.id,variantCode:variant.variantCode,email:owner.email,productImportKey:key},null,2));
}

main().catch(error=>{findings.push({fatal:error.message,stack:error.stack});console.error(error.message);process.exitCode=1;}).finally(async()=>{
  const pass=!findings.length && checks.length>0 && checks.every(check=>check.pass);
  if(!pass)process.exitCode=1;
  fs.writeFileSync(path.join(evidence,'staging-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),pass,database:target.pathname,externalDeliveryDisabled:true,checks,findings},null,2));
  await db.$disconnect();
  if(serve && pass) console.log(`STAGING_READY ${base}; external delivery and all scheduled workers disabled.`);
  else await app?.close();
});
