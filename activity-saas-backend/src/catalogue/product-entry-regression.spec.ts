import { CatalogueService } from './catalogue.service';
import { ProductReadinessService } from './product-readiness.service';

describe('product entry boundaries',()=>{
  const service=()=>new CatalogueService({} as any,{} as any,{} as any,{} as any);
  it('retains incomplete drafts and unchanged historical locations and subtype',async()=>{
    expect(await (service() as any).normalizeEntry({productName:'Walk'})).toEqual({productName:'Walk'});
    const old={type:'OTHERS',subType:'HISTORIC_CUSTOM',cityName:'Old village',stateName:'Old region',countryName:'Old country'};
    expect(await (service() as any).normalizeEntry({...old,description:'New description'},old)).toMatchObject(old);
  });
  it('blocks altered invalid destinations and arbitrary controlled values before persistence',async()=>{
    await expect((service() as any).normalizeEntry({countryName:'India',stateName:'Goa',cityName:'Munnar'})).rejects.toMatchObject({response:{code:'PRODUCT_ENTRY_INVALID',issues:expect.arrayContaining([expect.objectContaining({field:'cityName'})])}});
    await expect((service() as any).normalizeEntry({type:'TRANSFER',subType:'GUIDED_TOUR'})).rejects.toThrow();
    await expect((service() as any).normalizeEntry({durationUnit:'bananas'})).rejects.toThrow();
  });
  it('clears a stale numeric duration when switching to Flexible and canonicalizes location aliases',async()=>{
    expect(await (service() as any).normalizeEntry({durationUnit:'flexible'},{durationUnit:'HOURS',durationValue:'2'})).toEqual({durationUnit:'FLEXIBLE',durationValue:null});
    expect(await (service() as any).normalizeEntry({countryName:' india ',stateName:'kerala',cityName:'cochin'})).toMatchObject({countryName:'India',stateName:'Kerala',cityName:'Kochi'});
  });
  async function readiness(status:string,unit?:string,value?:string){const db:any={product:{findFirst:jest.fn(async()=>({id:'p',tenantId:'t',currentRevisionId:'r',revisions:[{id:'r',status,durationUnit:unit,durationValue:value}],variants:[]}))}};return new ProductReadinessService(db,{} as any).evaluate({sub:'u',role:'VENDOR',tenantId:'t'} as any,'p');}
  it('requires duration on working submissions without changing published readiness',async()=>{
    expect((await readiness('DRAFT')).sections.basicInfo.reasonCodes).toContain('DURATION_MISSING');
    expect((await readiness('DRAFT','HOURS','0')).sections.basicInfo.reasonCodes).toContain('DURATION_VALUE_REQUIRED');
    expect((await readiness('DRAFT','FLEXIBLE')).sections.basicInfo.reasonCodes.join()).not.toContain('DURATION_');
    expect((await readiness('PUBLISHED')).sections.basicInfo.reasonCodes.join()).not.toContain('DURATION_');
  });
});
