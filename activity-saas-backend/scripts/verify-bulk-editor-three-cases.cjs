// Runs only in the disposable PostgreSQL staging harness, never against live.
const assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');

module.exports = async ({ check, request, db, owner, foreign, outlet, tag, sample, evidence, hashFinance }) => {
  const target = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
  assert(target.hostname === '127.0.0.1' && target.port === '55445' && /^\/voya_import_fixes_\d+$/.test(target.pathname));
  const prefix = 'EDITOR-THREE-' + tag, protectedFinance = await hashFinance();
  const fixture = sample(prefix); fixture.Basic_Info[0].product_name = 'Demonstration Harbour pricing ' + tag;
  for (const r of fixture.Rate_Plans) Object.assign(r, {valid_from:'2026-12-01',valid_to:'2027-03-01'});
  for (const a of fixture.Availability) Object.assign(a, {effective_from:'2026-12-01',effective_to:'2026-12-07'});
  const created = await request(owner, '/products/import/json?outletId=' + outlet.id, fixture);
  assert.equal(created.status, 201, JSON.stringify(created));
  const productId = created.body.productId, route = '/products/' + productId + '/prices-availability';
  const read = async () => { const r = await request(owner, route); assert.equal(r.status,200); return r.body; };
  const initial = await read(), person = initial.options.find(o=>o.variantCode==='SUNRISE-SHARED'), group = initial.options.find(o=>o.variantCode==='PRIVATE-SPICE-WALK');
  const max = o => Math.max(...o.ratePlans.find(p=>p.editable).versions.map(v=>v.versionNumber));
  async function body(options) { const state=await read();return {hasDifferentialVisitorPricing:true,options:options.map(o=>({...o,expectedVersion:max(state.options.find(v=>v.variantId===o.variantId))}))}; }
  async function apply(options) { const r=await request(owner,route+'/apply',await body(options),{'Idempotency-Key':crypto.randomUUID()});assert.equal(r.status,201,JSON.stringify(r));return r.body; }
  const amounts = late => ({ADULT:late?'1900':'1800',CHILD:late?'950':'900',SENIOR:'1400',INFANT:late?'100':'0',YOUTH:late?'1300.1234':'1200.1234',GROUP:late?'2100':'2000'});
  const prices = late => Object.entries(amounts(late)).map(([travellerType,amount])=>({travellerType,amount}));
  const patch = changes => ({updateMode:'PATCH',variantId:person.variantId,effectiveFrom:'2027-01-01',effectiveTo:'2027-03-01',...changes});
  const full = late => ({variantId:person.variantId,pricingUnit:'PER_PERSON',currency:'INR',supplierModel:'NET_RATE',supplierBaseAmount:'500',bookingMode:'INSTANT',
    effectiveFrom:late?'2027-01-01':'2026-12-01',effectiveTo:late?'2027-03-01':'2027-01-01',travellerPrices:prices(late),mrpMode:'YES',mrpAmount:'3000',
    pricingDays:['MON','TUE','WED','THU','FRI','SAT','SUN'],timezone:'Asia/Kolkata',pricingSlotCodes:[],ratePeriods:[],
    cancellationRules:[{minDaysBefore:late?3:7,chargeValue:late?'25':'0',chargeType:'PERCENTAGE'}],
    visitorPrices:prices(late).map(p=>({travellerType:p.travellerType,indian:p.amount,foreign:p.travellerType==='INFANT'?'200':'2600'}))});
  await apply([full(false)]); await apply([full(true)]);
  const at = (state, day) => state.options.find(o=>o.variantId===person.variantId).ratePlans.find(p=>p.editable).versions
    .filter(v=>['DRAFT','ACTIVE'].includes(v.status)&&v.effectiveFrom.slice(0,10)<=day&&v.effectiveTo.slice(0,10)>day).sort((a,b)=>b.versionNumber-a.versionNumber)[0];
  const approved = await db.ratePlanCommercialVersion.findMany({where:{ratePlan:{variant:{productId}},status:'ACTIVE'},include:{travellerPrices:true},orderBy:{id:'asc'}});
  const baseline = await read();
  await check('three fixes: editor exposes all enabled ticket categories with saved pricing',async()=>{
    const plan=(await read()).options.find(o=>o.variantId===person.variantId).ratePlans.find(p=>p.editable);
    assert.deepEqual(plan.travellerRules.filter(r=>r.maxCount>0).map(r=>r.type).sort(),Object.keys(amounts(false)).sort());
  });
  await apply([patch({pricingUnit:'GROUP',supplierBaseAmount:'2000'})]);
  await check('three fixes: incomplete reverse basis change rejects preview and every option write atomically',async()=>{
    const before=await read(), requests=await db.activityPriceApplyRequest.count();
    const dto=await body([patch({variantId:group.variantId,supplierBaseAmount:'7300'}),patch({pricingUnit:'PER_PERSON',travellerPrices:prices(true).slice(0,3)})]);
    const preview=await request(owner,route+'/preview',dto);assert.equal(preview.body.valid,false);assert(preview.body.errors.some(e=>['INFANT','YOUTH','GROUP'].every(type=>e.includes(type))),JSON.stringify(preview));
    const saved=await request(owner,route+'/apply',dto,{'Idempotency-Key':crypto.randomUUID()});assert.equal(saved.status,400,JSON.stringify(saved));
    assert.deepEqual(await read(),before);assert.equal(await db.activityPriceApplyRequest.count(),requests);
  });
  await check('three fixes: complete reverse transition accepts zero and retains visitor terms, dates and cancellations',async()=>{
    await apply([patch({pricingUnit:'PER_PERSON',travellerPrices:prices(true).map(p=>p.travellerType==='INFANT'?{...p,amount:'0'}:p)})]);
    const state=await read(), v=at(state,'2027-01-15');assert.equal(v.travellerPrices.length,6);assert.equal(v.travellerPrices.find(p=>p.travellerType==='INFANT').amount,'0');
    assert.equal(v.sourcePayload.visitorPrices.find(p=>p.travellerType==='INFANT').foreign,'200');
    assert.deepEqual(v.sourcePayload.bookingRules,at(baseline,'2027-01-15').sourcePayload.bookingRules);
    assert.equal(at(state,'2026-12-15').travellerPrices.find(p=>p.travellerType==='INFANT').amount,'0');
    const plan=await db.ratePlan.findUniqueOrThrow({where:{id:person.ratePlans.find(p=>p.editable).id},include:{travellerRules:true}});
    const {CommercialService}=require('../dist/commercial/commercial.service'),{CommercialCalculatorService}=require('../dist/commercial/commercial-calculator.service');
    assert(!CommercialService.prototype.structuralReadinessReasons.call({},plan,v,[]).includes('TRAVELLER_PRICE_MISSING'));
    const quote=new CommercialCalculatorService().calculate({ratePlanId:plan.id,serviceDate:new Date('2027-01-15'),units:1,travellers:[{travellerType:'ADULT',quantity:1},{travellerType:'INFANT',quantity:1}]},v,[]);
    assert(!quote.reasonCodes.includes('TRAVELLER_PRICE_MISSING'));
  });
  await check('three fixes: MRP cannot be cleared while enabled and No MRP survives readback',async()=>{
    const before=await read(),dto=await body([patch({mrpMode:'YES',mrpAmount:''})]);
    const preview=await request(owner,route+'/preview',dto);assert(preview.status===400||preview.body.valid===false);
    const saved=await request(owner,route+'/apply',dto,{'Idempotency-Key':crypto.randomUUID()});assert.equal(saved.status,400);assert.deepEqual(await read(),before);
    await apply([patch({mrpMode:'NO'})]);assert.equal(at(await read(),'2027-01-15').sourcePayload.mrpMode,'NO');
    await apply([patch({mrpMode:'YES',mrpAmount:'3000'})]);
  });
  await check('three fixes: legacy incomplete enabled categories require an explicit repair',async()=>{
    const v=at(await read(),'2027-01-15');await db.ratePlanTravellerPrice.deleteMany({where:{commercialVersionId:v.id,travellerType:'INFANT'}});
    const before=await read(),dto=await body([patch({travellerPrices:[{travellerType:'ADULT',amount:'1950'}]})]);
    const preview=await request(owner,route+'/preview',dto);assert.equal(preview.body.valid,false);assert(preview.body.errors.some(e=>e.includes('INFANT')));
    const saved=await request(owner,route+'/apply',dto,{'Idempotency-Key':crypto.randomUUID()});assert.equal(saved.status,400);assert.deepEqual(await read(),before);
    await apply([patch({travellerPrices:[{travellerType:'INFANT',amount:'0'}]})]);
  });
  await check('three fixes: editing an additional category preserves other periods and policies',async()=>{
    const before=await read();await apply([patch({effectiveFrom:'2026-12-01',effectiveTo:'2027-01-01',travellerPrices:[{travellerType:'INFANT',amount:'25.1234'}]})]);
    const after=await read();assert.equal(at(after,'2026-12-15').travellerPrices.find(p=>p.travellerType==='INFANT').amount,'25.1234');
    assert.deepEqual(at(after,'2027-01-15').travellerPrices.map(p=>[p.travellerType,p.amount]),at(before,'2027-01-15').travellerPrices.map(p=>[p.travellerType,p.amount]));
    for(const day of ['2026-12-15','2027-01-15'])assert.deepEqual(at(after,day).sourcePayload.bookingRules,at(before,day).sourcePayload.bookingRules);
  });
  await check('three fixes: another tenant cannot read enabled categories, preview or apply rates',async()=>{
    assert([403,404].includes((await request(foreign,route)).status));
    const dto=await body([patch({travellerPrices:[{travellerType:'ADULT',amount:'1999'}]})]);
    for(const suffix of ['/preview','/apply'])assert([403,404].includes((await request(foreign,route+suffix,dto,{'Idempotency-Key':crypto.randomUUID()})).status));
  });
  await check('three fixes: all approved versions and finance remain unchanged',async()=>{
    assert.deepEqual(await db.ratePlanCommercialVersion.findMany({where:{ratePlan:{variant:{productId}},status:'ACTIVE'},include:{travellerPrices:true},orderBy:{id:'asc'}}),approved);
    assert.deepEqual(await hashFinance(),protectedFinance);
  });
  // Restore reference values and prepare a third option for real clipboard checks.
  await apply([full(false)]);await apply([full(true)]);
  const third=await request(owner,'/products/'+productId+'/variants',{variantCode:'SUNSET-WALK',name:'Harbour Sunset Walk',minPax:1,maxPax:15,cutOffMinutes:1440});assert.equal(third.status,201,JSON.stringify(third));
  const thirdOption={...full(true),variantId:third.body.id,travellerPrices:[{travellerType:'ADULT',amount:'2100'}],visitorPrices:[{travellerType:'ADULT',indian:'2100',foreign:'2600'}]};
  // A newly created option has no expected version yet.
  const thirdSave=await request(owner,route+'/apply',{options:[thirdOption]},{'Idempotency-Key':crypto.randomUUID()});assert.equal(thirdSave.status,201,JSON.stringify(thirdSave));
  fs.writeFileSync(path.join(evidence,'three-browser-fixtures.json'),JSON.stringify({prefix,productId,personVariantId:person.variantId,groupVariantId:group.variantId,thirdVariantId:third.body.id,outletId:outlet.id,email:owner.email},null,2));
};
