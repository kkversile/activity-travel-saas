import { ChannelMappingService } from './channel-mapping.service';
describe('agent sales activation across revisions', () => {
  function fixture(existing = false) {
    const create = () => jest.fn().mockImplementation(({data}: any) => ({id:'mapping',...data}));
    const tx: any = {
      distributionChannel: {findUnique:jest.fn().mockResolvedValue({id:'ch',active:true,code:'VOYA_AGENT'})},
      product: {findUnique:jest.fn().mockResolvedValue({id:'p',tenantId:'vendor',productCode:'TA-1',status:'LIVE',currentRevisionId:'rev2',currentRevision:{status:'PUBLISHED'},variants:[{id:'old',revisionId:'rev1',variantCode:'SHARED',ratePlans:[{id:'old-rate',ratePlanCode:'BASE'}]},{id:'current',revisionId:'rev2',variantCode:'SHARED',ratePlans:[{id:'current-rate',ratePlanCode:'BASE'}]}]})},
      productChannelMapping:{findUnique:jest.fn().mockResolvedValue(null),create:create()},
      variantChannelMapping:{findUnique:jest.fn().mockResolvedValue(existing ? {id:'vm',status:'ACTIVE',activatedAt:new Date(),externalVariantCode:'legacy-code'} : null),create:create()},
      ratePlanChannelMapping:{findUnique:jest.fn().mockResolvedValue(null),create:create()},
      channelInventoryRule:{findUnique:jest.fn().mockResolvedValue(null),create:create()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new ChannelMappingService(prisma,{write:jest.fn()} as any,{enqueue:jest.fn()} as any);
    return {service,tx};
  }
  it('maps only published-revision options with identities unique across products and revisions',async()=>{
    const {service,tx}=fixture(); await service.activateAgentHierarchy({sub:'admin'} as any,'p');
    expect(tx.variantChannelMapping.create).toHaveBeenCalledTimes(1);
    expect(tx.variantChannelMapping.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({variantId:'current',externalVariantCode:'current'})}));
    expect(tx.ratePlanChannelMapping.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({ratePlanId:'current-rate',externalRatePlanCode:'current-rate'})}));
  });
  it('retains an already activated immutable external identity',async()=>{
    const {service,tx}=fixture(true); await expect(service.activateAgentHierarchy({sub:'admin'} as any,'p')).resolves.toBeDefined();
    expect(tx.variantChannelMapping.create).not.toHaveBeenCalled();
  });
});
