import { explicitActivityPlan, CatalogueService } from './catalogue.service';
import { attachCatalogueTestOutletAccess } from './catalogue-test-outlet-access';

describe('explicit rate-plan targeting',()=>{
  const plan={id:'r1',variantId:'v1',status:'ACTIVE',sourcePayload:{},channelMappings:[]};
  const patch:any={variantId:'v1',ratePlanId:'r1',updateMode:'PATCH'};
  it('requires the exact plan instead of falling back to another offer',()=>{
    expect(explicitActivityPlan([plan,{...plan,id:'r2'}],patch)).toBe(plan);
    expect(()=>explicitActivityPlan([{...plan,id:'r2'}],patch)).toThrow('unavailable');
  });
  it.each([{variantId:'other'},{status:'ARCHIVED'},{status:'INACTIVE'}])('rejects a plan outside the active option (%j)',changes=>expect(()=>explicitActivityPlan([{...plan,...changes}],patch)).toThrow('unavailable'));
  it.each([{sourcePayload:{specialContract:true}},{sourcePayload:{protectedFromActivityEditor:true}},{channelMappings:[{status:'ACTIVE',enabled:false}]},{channelMappings:[{status:'INACTIVE',enabled:true}]}])('retains contract and channel protection (%j)',changes=>expect(()=>explicitActivityPlan([{...plan,...changes}],patch)).toThrow('protected'));
  it('requires patch semantics for an explicit existing plan',()=>expect(()=>explicitActivityPlan([plan],{...patch,updateMode:undefined})).toThrow('PATCH'));
  it('previews the explicitly selected currency and dates rather than the other offer',async()=>{
    const prisma:any={product:{findFirst:jest.fn().mockResolvedValue({id:'p',tenantId:'t'})},productVariant:{findMany:jest.fn().mockResolvedValue([{id:'v1',name:'Shared'}])},ratePlan:{findMany:jest.fn().mockResolvedValue([
      {...plan,id:'other',currency:'INR',commercialVersions:[]},
      {...plan,currency:'USD',travellerRules:[],cancellationRules:[],commercialVersions:[{id:'c',versionNumber:2,status:'ACTIVE',pricingUnit:'PER_PERSON',currency:'USD',supplierModel:'NET_RATE',supplierBaseAmount:'0',bookingMode:'INSTANT',effectiveFrom:'2027-01-01',effectiveTo:'2027-03-01',travellerPrices:[{travellerType:'ADULT',amount:'100'}],sourcePayload:{mrpMode:'NO'}}]},
    ])}};
    const service=attachCatalogueTestOutletAccess(new CatalogueService(prisma,{} as any,{} as any,{} as any));
    const result=await service.previewActivityPricesAvailability({sub:'u',role:'VENDOR',tenantId:'t'} as any,'p',{options:[{...patch,expectedVersion:2,effectiveFrom:'2027-01-01',effectiveTo:'2027-02-01',travellerPrices:[{travellerType:'ADULT',amount:'110'}]}]});
    expect(result.valid).toBe(true);expect(result.proposedRates[0].travellerPrices).toContainEqual({travellerType:'ADULT',amount:'110'});
  });
});
