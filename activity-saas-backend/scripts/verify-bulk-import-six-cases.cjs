// Called only from the guarded disposable PostgreSQL staging runner.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {CommercialCalculatorService}=require('../dist/commercial/commercial-calculator.service');

module.exports=async function sixFixChecks(context){
  const {check,request,db,owner,outlet,tag,sample,parsing,XLSX,evidence,base,token,hashFinance}=context;
  assert(/^http:\/\/127\.0\.0\.1:\d+\/api$/.test(base),'Disposable loopback API required');
  const before=await hashFinance(),browser={outletId:outlet.id,email:owner.email};
  const fixture=async(suffix,media=false)=>{
    const input=sample('SIX-'+tag+'-'+suffix);input.Basic_Info[0].product_name='Demonstration import acceptance '+tag+' '+suffix;
    for(const row of input.Availability)row.materialize=false;
    if(media){
      // Approval fixtures offer one complete option with a short future inventory
      // window; incomplete sibling offers must not obscure the case under test.
      for(const section of ['Options','Rate_Plans','Availability','Ticket_Types'])input[section]=input[section].filter(item=>item.option_code==='SUNRISE-SHARED');
      for(const row of input.Availability){row.effective_from='2026-12-01';row.effective_to='2026-12-07';row.materialize=true;}
      const asset=await db.fileAsset.findFirstOrThrow({where:{tenantId:owner.tenantId,purpose:'PRODUCT_MEDIA',visibility:'PUBLIC',archivedAt:null,mimeType:{startsWith:'image/'}}});input.Media=[{kind:'IMAGE',file_asset_id:asset.id,description:'Demonstration-only staging acceptance',rank:1}];
    }
    const created=await request(owner,'/products/import/json?outletId='+outlet.id,input);assert.equal(created.status,201,JSON.stringify(created));
    const product=await db.product.findUniqueOrThrow({where:{id:created.body.productId}}),state=await request(owner,'/products/'+product.id+'/prices-availability');
    const option=state.body.options.find(item=>item.variantCode==='SUNRISE-SHARED'),plan=option.ratePlans.find(item=>item.editable);
    return {product,option,plan,revisionId:created.body.revisionId,approvalFixture:media};
  };
  const latest=(target,day='2026-12-15')=>db.ratePlanCommercialVersion.findFirstOrThrow({where:{ratePlan:{variantId:target.option.variantId},status:{in:['ACTIVE','DRAFT']},effectiveFrom:{lte:new Date(day)},effectiveTo:{gt:new Date(day)}},include:{travellerPrices:true},orderBy:{versionNumber:'desc'}});
  const amounts=version=>Object.fromEntries(version.travellerPrices.map(item=>[item.travellerType,String(item.amount)]));
  const row=(target,extra={})=>({productCode:target.product.productCode,optionCode:target.option.variantCode,validFrom:'2026-12-01',validTo:'2027-01-01',adultSellInr:'1900',...extra});
  const apply=async(target,rows)=>{
    const dto={submissionId:crypto.randomUUID(),rows:rows||[row(target)]};
    const preview=await request(owner,'/products/rates/import/batch/validate',dto);assert.equal(preview.status,201,JSON.stringify(preview));
    const saved=await request(owner,'/products/rates/import/batch',dto);assert.equal(saved.body.status,'COMPLETED',JSON.stringify(saved));return saved;
  };
  const seed=async(target,extra={},differential)=>{
    const state=await request(owner,'/products/'+target.product.id+'/prices-availability'),plan=state.body.options.find(item=>item.variantId===target.option.variantId).ratePlans.find(item=>item.editable);
    const option={variantId:target.option.variantId,pricingUnit:'PER_PERSON',currency:'INR',supplierModel:'NET_RATE',supplierBaseAmount:'500',bookingMode:'INSTANT',effectiveFrom:target.plan.validFrom.slice(0,10),effectiveTo:target.plan.validTo.slice(0,10),expectedVersion:Math.max(...plan.versions.map(item=>item.versionNumber)),travellerPrices:[{travellerType:'ADULT',amount:'1800'},{travellerType:'CHILD',amount:'900'},{travellerType:'SENIOR',amount:'1400'}],mrpMode:'YES',mrpAmount:'3000',...extra};
    if(target.approvalFixture){
      // Model an existing catalogue that already has these supported advanced
      // categories. The three-column creation template cannot seed them. This
      // setup touches only the newly created disposable fixture, before the
      // normal editor/bulk/approval requests and preservation comparisons.
      for(const version of await db.ratePlanCommercialVersion.findMany({where:{ratePlanId:plan.id,status:'ACTIVE'}})){
        await db.ratePlanTravellerPrice.createMany({data:option.travellerPrices.map(price=>({...price,commercialVersionId:version.id})),skipDuplicates:true});
        await db.ratePlanCommercialVersion.update({where:{id:version.id},data:{sourcePayload:{...version.sourcePayload,mrpMode:'YES',mrpAmount:'3000',...(extra.visitorPrices?{visitorPrices:extra.visitorPrices,visitorEligibilityBasis:extra.visitorEligibilityBasis,visitorVerificationMode:extra.visitorVerificationMode}:{})}}});
      }
    }
    const saved=await request(owner,'/products/'+target.product.id+'/prices-availability/apply',{options:[option],...(differential===undefined?{}:{hasDifferentialVisitorPricing:differential})},{'Idempotency-Key':'SIX-SEED-'+crypto.randomUUID()});assert.equal(saved.status,201,JSON.stringify(saved));
  };
  const publish=async target=>{
    const patched=await fetch(base+'/product-revisions/'+target.revisionId,{method:'PATCH',headers:{Authorization:'Bearer '+token(owner),'Content-Type':'application/json'},body:JSON.stringify({category:'Guided tours'})});assert.equal(patched.status,200,await patched.text());
    const submitted=await request(owner,'/product-revisions/'+target.revisionId+'/submit',{});assert.equal(submitted.status,201,JSON.stringify(submitted));
    const admin=await db.user.findFirstOrThrow({where:{role:'SUPER_ADMIN',active:true}}),published=await request(admin,'/admin/product-revisions/'+target.revisionId+'/publish',{});assert.equal(published.status,201,JSON.stringify(published));
  };
  const quote=(version,travellers,visitorCategory)=>new CommercialCalculatorService().calculate({serviceDate:'2026-12-15',travellers,units:1,visitorCategory,visitorEligibilityVerified:true,agentFacingRequired:false},version,[]);
  const activeVersions=target=>db.ratePlanCommercialVersion.findMany({where:{ratePlan:{variantId:target.option.variantId},status:'ACTIVE'},include:{travellerPrices:{orderBy:{travellerType:'asc'}}},orderBy:{id:'asc'}});

  await check('six fixes: editing the exact imported date range advances its draft version and preserves new categories in a later bulk upload',async()=>{
    // No direct price seeding: reproduce the imported v1 draft / v2 active pair
    // and edit precisely that same date range through the canonical vendor API.
    const target=await fixture('EXACT-RANGE'),previous=Math.max(...target.plan.versions.map(item=>item.versionNumber));
    await seed(target,{travellerPrices:[{travellerType:'ADULT',amount:'1800'},{travellerType:'CHILD',amount:'900'},{travellerType:'SENIOR',amount:'1400'},{travellerType:'INFANT',amount:'0'},{travellerType:'YOUTH',amount:'1200'},{travellerType:'GROUP',amount:'2000'}],visitorPrices:[{travellerType:'ADULT',indian:'1800',foreign:'2600'}],visitorVerificationMode:'NONE'},true);
    const edited=await latest(target);assert(edited.versionNumber>previous,'Edited draft retained an older version number');assert.equal(amounts(edited).YOUTH,'1200');
    const stale=await request(owner,'/products/'+target.product.id+'/prices-availability/apply',{options:[{variantId:target.option.variantId,expectedVersion:previous,pricingUnit:'PER_PERSON',currency:'INR',supplierModel:'NET_RATE',bookingMode:'INSTANT',effectiveFrom:target.plan.validFrom.slice(0,10),effectiveTo:target.plan.validTo.slice(0,10),travellerPrices:[{travellerType:'ADULT',amount:'1850'}]}]},{'Idempotency-Key':'SIX-STALE-'+crypto.randomUUID()});assert.equal(stale.status,409,JSON.stringify(stale));
    const approvedBefore=await activeVersions(target);await apply(target,[row(target,{adultSellInr:'2000',childSellInr:'0'})]);const saved=await latest(target);
    assert.deepEqual(amounts(saved),{ADULT:'2000',CHILD:'0',SENIOR:'1400',INFANT:'0',YOUTH:'1200',GROUP:'2000'});assert.equal(saved.sourcePayload.visitorPrices[0].indian,'2000');assert.equal(saved.sourcePayload.visitorPrices[0].foreign,'2600');assert.deepEqual(await activeVersions(target),approvedBefore);
  });

  await check('six fixes: infant youth group and zero prices survive repeated date-limited rate saves and approval',async()=>{
    const target=await fixture('TRAVELLERS',true);
    await seed(target,{travellerPrices:[{travellerType:'ADULT',amount:'1800'},{travellerType:'CHILD',amount:'900'},{travellerType:'SENIOR',amount:'1400'},{travellerType:'INFANT',amount:'0'},{travellerType:'YOUTH',amount:'1200'},{travellerType:'GROUP',amount:'2000'}]});
    const activeBefore=await activeVersions(target);
    await apply(target);await apply(target,[row(target,{adultSellInr:undefined,childSellInr:'0'})]);
    assert.deepEqual(await activeVersions(target),activeBefore,'Rate-only edits changed approved baseline prices before review');
    const expected={ADULT:'1900',CHILD:'0',SENIOR:'1400',INFANT:'0',YOUTH:'1200',GROUP:'2000'};assert.deepEqual(amounts(await latest(target)),expected);
    await publish(target);const approved=await latest(target);assert.equal(approved.status,'ACTIVE');assert.deepEqual(amounts(approved),expected);
    assert.equal(quote(approved,[{travellerType:'ADULT',quantity:1},{travellerType:'INFANT',quantity:1},{travellerType:'YOUTH',quantity:1}]).supplier.grossBasis,'3100.00');
    assert.equal(amounts(await latest(target,'2027-01-15')).ADULT,'1800');
    browser.travellers={productId:target.product.id,productCode:target.product.productCode,optionCode:target.option.variantCode,variantId:target.option.variantId};return expected;
  });
  await check('six fixes: Indian visitor quotes follow entered prices through approval while foreign prices and verification remain unchanged',async()=>{
    const target=await fixture('VISITORS',true);
    await seed(target,{visitorPrices:[{travellerType:'ADULT',indian:'1800',foreign:'2600'},{travellerType:'CHILD',indian:'900',foreign:'1500'}],visitorEligibilityBasis:'NATIONALITY',visitorVerificationMode:'DOCUMENT_AT_BOOKING'},true);
    const activeBefore=await activeVersions(target);
    await apply(target,[row(target,{childSellInr:'0'})]);assert.deepEqual(await activeVersions(target),activeBefore);await publish(target);const approved=await latest(target);
    assert.equal(approved.status,'ACTIVE');assert.equal(quote(approved,[{travellerType:'ADULT',quantity:1}],'INDIAN').supplier.grossBasis,'1900.00');assert.equal(quote(approved,[{travellerType:'ADULT',quantity:1}],'FOREIGN').supplier.grossBasis,'2600.00');
    assert.equal(quote(approved,[{travellerType:'CHILD',quantity:1}],'INDIAN').supplier.grossBasis,'0.00');assert.equal(quote(approved,[{travellerType:'CHILD',quantity:1}],'FOREIGN').supplier.grossBasis,'1500.00');
    assert.equal(approved.sourcePayload.visitorEligibilityBasis,'NATIONALITY');assert.equal(approved.sourcePayload.visitorVerificationMode,'DOCUMENT_AT_BOOKING');
    browser.visitors={productId:target.product.id,productCode:target.product.productCode,optionCode:target.option.variantCode,variantId:target.option.variantId};return {indian:'1900.00',foreign:'2600.00',childIndian:'0.00'};
  });
  await check('six fixes: ambiguous product codes block the whole batch without changing either product or an earlier valid group',async()=>{
    const first=await fixture('ALIAS-ONE'),second=await fixture('ALIAS-TWO'),good=await fixture('ALIAS-GOOD');
    const alias=await db.publicIdentifier.findUniqueOrThrow({where:{entityType_entityId:{entityType:'PRODUCT',entityId:first.product.id}}});
    await db.product.update({where:{id:second.product.id},data:{productCode:alias.publicCode}});
    const count=await db.ratePlanCommercialVersion.count();
    for(const route of ['/products/rates/import/batch/validate','/products/rates/import/batch']){const result=await request(owner,route,{rows:[row(good),row(second,{productCode:alias.publicCode})]});assert.equal(result.status,400,JSON.stringify(result));assert(result.body.issues.some(item=>item.field==='productCode'&&/unambiguous/.test(item.correction)));}
    assert.equal(await db.ratePlanCommercialVersion.count(),count);
    browser.ambiguousProduct={productCode:alias.publicCode,optionCode:first.option.variantCode};
  });
  await check('six fixes: option alias ambiguity cannot replay an earlier successful submission',async()=>{
    const target=await fixture('OPTION-ALIAS');
    target.option.variantCode='OPT-ALIAS-'+tag;
    await db.productVariant.update({where:{id:target.option.variantId},data:{variantCode:target.option.variantCode}});
    const dto={submissionId:crypto.randomUUID(),rows:[row(target)]};
    const saved=await request(owner,'/products/rates/import/batch',dto);assert.equal(saved.body.status,'COMPLETED');
    const sibling=await db.productVariant.findFirstOrThrow({where:{productId:target.product.id,id:{not:target.option.variantId}}});
    await db.publicIdentifier.create({data:{id:crypto.randomUUID(),entityType:'VARIANT',entityId:sibling.id,publicCode:target.option.variantCode}});
    const count=await db.ratePlanCommercialVersion.count();
    for(const route of ['/products/rates/import/batch/validate','/products/rates/import/batch']){const result=await request(owner,route,dto);assert.equal(result.status,400,JSON.stringify(result));assert(result.body.issues.some(item=>item.field==='optionCode'&&/unambiguous/.test(item.correction)));}
    assert.equal(await db.ratePlanCommercialVersion.count(),count);browser.ambiguousOption={productCode:target.product.productCode,optionCode:target.option.variantCode};
  });
  await check('six fixes: overflow in every money field is rejected in API preflight and save without creating versions',async()=>{
    const target=await fixture('MONEY'),count=await db.ratePlanCommercialVersion.count();
    for(const field of ['adultSellInr','childSellInr','seniorSellInr','baseSellInr','mrpInr','supplierBaseAmount'])for(const route of ['/products/rates/import/batch/validate','/products/rates/import/batch']){
      const result=await request(owner,route,{rows:[row(target,{[field]:'100000000000000'})]});assert.equal(result.status,400,JSON.stringify(result));assert(JSON.stringify(result.body).includes('99999999999999.9999'));
    }
    assert.equal(await db.ratePlanCommercialVersion.count(),count);
    const canonical=await request(owner,'/products/'+target.product.id+'/prices-availability/preview',{options:[{variantId:target.option.variantId,pricingUnit:'PER_PERSON',mrpAmount:'100000000000000',travellerPrices:[{travellerType:'ADULT',amount:'100'}]}]});
    assert.equal(canonical.status,400,JSON.stringify(canonical));
  });
  await check('six fixes: exact decimal maximum and leading-zero forms are stored exactly, with zero distinct from omitted prices',async()=>{
    const target=await fixture('BOUNDARY');await apply(target,[row(target,{adultSellInr:'00099999999999999.9999',childSellInr:'0',mrpInr:'99999999999999.9999'})]);
    const version=await latest(target);assert.equal(amounts(version).ADULT,'99999999999999.9999');assert.equal(amounts(version).CHILD,'0');assert.equal(amounts(version).SENIOR,'1400');
  });
  await check('six fixes: free child prices round-trip through CSV and Excel and preserve other categories',async()=>{
    const target=await fixture('FREE');const headers=['product_code','option_code','valid_from','valid_to','child_sell_inr'],values=[target.product.productCode,target.option.variantCode,'2026-12-01','2027-01-01','0'];
    const csv=parsing.parseRateUpdateCsv([headers.join(','),values.join(',')].join('\n'),true);assert.deepEqual(csv.issues,[]);await apply(target,csv.rows);
    const workbook=parsing.createRateUpdateWorkbook();workbook.Sheets.Rates=XLSX.utils.aoa_to_sheet([headers,values]);const excel=parsing.parseRateUpdateWorkbook(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),true);assert.deepEqual(excel.issues,[]);await apply(target,excel.rows);
    assert.deepEqual(amounts(await latest(target)),{ADULT:'1800',CHILD:'0',SENIOR:'1400'});
    browser.free={productId:target.product.id,productCode:target.product.productCode,optionCode:target.option.variantCode,variantId:target.option.variantId};
  });
  await check('six fixes: JSON duplicate keys identify both source paths locally and both products at the API before writes',async()=>{
    const one=sample('DUPLICATE-'+tag),two=sample('duplicate-'+tag);one.Basic_Info[0].product_name='Demonstration first JSON walk';two.Basic_Info[0].product_name='Demonstration second JSON walk';
    const parsed=parsing.parseProductJson(JSON.stringify({products:[one,two]}));assert.equal(parsed.models.length,0);assert.equal(parsed.issues.filter(issue=>issue.field==='product_key').length,2);
    const csv=parsing.importErrorsCsv(parsed.issues);assert(csv.includes('products[0].Basic_Info[0].product_key')&&csv.includes('products[1].Basic_Info[0].product_key')&&csv.includes('unique product_key'));
    const count=await db.product.count(),result=await request(owner,'/products/import/batch/validate?outletId='+outlet.id,{products:[one,two]});assert.equal(result.status,400);assert.equal(result.body.products.length,2);assert(result.body.products.every(item=>item.issues[0].field==='product_key'&&item.issues[0].correction));assert.equal(await db.product.count(),count);
    fs.writeFileSync(path.join(evidence,'browser-duplicate-keys.json'),JSON.stringify({products:[one,two]},null,2));
  });
  await check('six fixes: product-create amount overflow is rejected without draft side effects',async()=>{
    const input=sample('PRODUCT-MONEY-'+tag);input.Rate_Plans[0].adult_price='100000000000000';const count=await db.product.count();
    for(const route of ['/products/import/batch/validate','/products/import/batch']){const result=await request(owner,route+'?outletId='+outlet.id,{products:[input]});assert.equal(result.status,400);assert(JSON.stringify(result.body).includes('99999999999999.9999'));}
    assert.equal(await db.product.count(),count);
  });
  fs.writeFileSync(path.join(evidence,'six-browser-fixtures.json'),JSON.stringify(browser,null,2));
  await check('six fixes: protected booking settlement payout and accounting hashes are unchanged',async()=>assert.deepEqual(await hashFinance(),before));
};
