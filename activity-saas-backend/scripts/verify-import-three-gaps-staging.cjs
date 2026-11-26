// Integration checks restricted to the disposable local PostgreSQL harness.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
module.exports=async({check,request,db,owner,foreign,outlet,tag,sample,evidence,hashFinance})=>{
 const target=new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);assert(target.hostname==='127.0.0.1'&&target.port==='55445'&&/^\/voya_import_fixes_\d+$/.test(target.pathname));
 const beforeFinance=await hashFinance(),prefix='IMPORT-THREE-GAPS-'+tag;
 const input=suffix=>{const model=sample(prefix+'-'+suffix);delete model.Basic_Info[0].currency;model.Basic_Info[0].product_name='Demonstration import defaults '+suffix+' '+tag;for(const row of model.Rate_Plans)Object.assign(row,{currency:'USD',valid_from:'2026-12-01',valid_to:'2027-03-01'});for(const row of model.Availability)Object.assign(row,{effective_from:'2026-12-01',effective_to:'2026-12-07',materialize:false});return model;};
 const fixture=input('USD');const imported=await request(owner,'/products/import/json?outletId='+outlet.id,fixture);assert.equal(imported.status,201,JSON.stringify(imported));const id=imported.body.productId,route='/products/'+id+'/prices-availability';
 const get=async()=>{const r=await request(owner,'/products/'+id);assert.equal(r.status,200);return r.body;};
 const rates=async()=>{const r=await request(owner,route);assert.equal(r.status,200);return r.body;};
 const priceRows=await rates(),person=priceRows.options.find(o=>o.variantCode==='SUNRISE-SHARED'),group=priceRows.options.find(o=>o.variantCode==='PRIVATE-SPICE-WALK'),planId=person.ratePlans[0].id;
 const approved=()=>db.ratePlanCommercialVersion.findMany({where:{ratePlan:{variant:{productId:id}},status:'ACTIVE'},include:{travellerPrices:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}});
 const activeBefore=await approved();
 const apply=async values=>{const state=await rates(),plan=state.options.find(o=>o.variantId===person.variantId).ratePlans.find(p=>p.editable);const dto={options:[{updateMode:'PATCH',variantId:person.variantId,expectedVersion:Math.max(...plan.versions.map(v=>v.versionNumber)),effectiveFrom:'2026-12-01',effectiveTo:'2027-03-01',...values}]};const preview=await request(owner,route+'/preview',dto);assert.equal(preview.body.valid,true,JSON.stringify(preview));const result=await request(owner,route+'/apply',dto,{'Idempotency-Key':crypto.randomUUID()});assert.equal(result.status,201,JSON.stringify(result));};
 await check('import defaults: uniform USD sets product metadata and all rate versions without conversion',async()=>{
  const product=await get();assert.equal(product.currency,'USD');for(const option of priceRows.options)for(const plan of option.ratePlans)assert(plan.versions.every(v=>v.currency==='USD'));
 });
 await check('import defaults: each option starts with its own rate limits and cutoff',async()=>{
  const product=await get(),p=product.variants.find(v=>v.id===person.variantId),g=product.variants.find(v=>v.id===group.variantId);assert.equal(p.maxPax,15);assert.equal(g.maxPax,6);assert.equal(p.cutOffMinutes,1440);assert.equal(g.cutOffMinutes,1440);
 });
 await check('import defaults: ambiguous mixed currencies block preview and import before writes',async()=>{
  const model=input('AMBIGUOUS');model.Rate_Plans[1].currency='INR';const count=await db.product.count();for(const endpoint of ['/products/import/batch/validate','/products/import/json']){const result=await request(owner,endpoint+'?outletId='+outlet.id,endpoint.includes('batch')?{products:[model]}:model);assert.equal(result.status,400,JSON.stringify(result));assert(JSON.stringify(result).includes('default currency'));}assert.equal(await db.product.count(),count);
 });
 await check('import defaults: explicit mixed default is retained while rate currencies remain independent',async()=>{
  const model=input('EXPLICIT');model.Rate_Plans[1].currency='INR';model.Basic_Info[0].currency='USD';const r=await request(owner,'/products/import/json?outletId='+outlet.id,model);assert.equal(r.status,201,JSON.stringify(r));assert.equal((await db.product.findUniqueOrThrow({where:{id:r.body.productId}})).currency,'USD');
 });
 await check('import defaults: conflicting explicit product currency rejects without creating a draft',async()=>{
  const model=input('CONFLICT');model.Basic_Info[0].currency='INR';const count=await db.product.count(),r=await request(owner,'/products/import/json?outletId='+outlet.id,model);assert.equal(r.status,400);assert.equal(await db.product.count(),count);
 });
 await check('import defaults: price-only patches preserve custom option and plan limits separately',async()=>{
  await db.productVariant.update({where:{id:person.variantId},data:{minPax:2,maxPax:20,cutOffMinutes:300}});
  const before=await db.ratePlan.findUniqueOrThrow({where:{id:planId}});await apply({travellerPrices:[{travellerType:'ADULT',amount:'1950'}]});const variant=await db.productVariant.findUniqueOrThrow({where:{id:person.variantId}}),plan=await db.ratePlan.findUniqueOrThrow({where:{id:planId}});
  assert.deepEqual([variant.minPax,variant.maxPax,variant.cutOffMinutes],[2,20,300]);assert.deepEqual([plan.minPax,plan.maxPax,plan.cutOffMinutes],[before.minPax,before.maxPax,before.cutOffMinutes]);
 });
 await check('import defaults: explicit limits including zero cutoff synchronize only the selected option',async()=>{
  const before=await db.productVariant.findUniqueOrThrow({where:{id:group.variantId}});await apply({maxPax:12,cutOffMinutes:0});const variant=await db.productVariant.findUniqueOrThrow({where:{id:person.variantId}});assert.equal(variant.maxPax,12);assert.equal(variant.cutOffMinutes,0);assert.deepEqual(await db.productVariant.findUniqueOrThrow({where:{id:group.variantId}}),before);
 });
 await check('import defaults: legacy null option limits stay null after a price-only save',async()=>{
  await db.productVariant.update({where:{id:person.variantId},data:{minPax:null,maxPax:null,cutOffMinutes:null}});await apply({travellerPrices:[{travellerType:'ADULT',amount:'1900'}]});const variant=await db.productVariant.findUniqueOrThrow({where:{id:person.variantId}});assert.deepEqual([variant.minPax,variant.maxPax,variant.cutOffMinutes],[null,null,null]);
 });
 await check('import defaults: tied creation timestamps retain deterministic option order after repeated saves',async()=>{
  await db.productVariant.updateMany({where:{productId:id},data:{createdAt:new Date('2020-01-01')}});const expected=[person.variantId,group.variantId].sort();for(const amount of ['1910','1920']){await apply({travellerPrices:[{travellerType:'ADULT',amount}]});assert.deepEqual((await get()).variants.map(v=>v.id),expected);assert.deepEqual((await rates()).options.map(v=>v.variantId),expected);}
 });
 await check('import defaults: outlet and tenant checks remain enforced on metadata and price reads',async()=>{
  for(const endpoint of ['/products/'+id,route])assert([403,404].includes((await request(foreign,endpoint)).status));
 });
 await check('import defaults: finance and original active commercial versions remain unchanged',async()=>{
  assert.deepEqual(await hashFinance(),beforeFinance);assert.deepEqual(await approved(),activeBefore);
 });
 fs.writeFileSync(path.join(evidence,'import-defaults-browser-fixture.json'),JSON.stringify({productId:id,outletId:outlet.id,prefix},null,2));
};
