const {candidate,applyRepair}=require('../../scripts/repair-import-currency.cjs');
function product(){return {id:'p',tenantId:'t',sourceImportKey:'IMPORTED',importFingerprint:'fp',currency:'INR',revisions:[],variants:[{ratePlans:[{currency:'USD',sourcePayload:{},channelMappings:[],commercialVersions:[{status:'ACTIVE',currency:'USD',sourcePayload:{createdFromProductImport:true}}]}]}]};}
describe('reviewed imported-currency repair',()=>{
  it('proposes a reviewable metadata-only candidate for the old default bug',()=>expect(candidate(product())).toMatchObject({from:'INR',to:'USD',approved:false}));
  it.each(['not-imported','mixed','explicit','protected','deleted'])('skips %s records',kind=>{
    const p:any=product();if(kind==='not-imported')p.sourceImportKey=null;if(kind==='mixed')p.variants[0].ratePlans[0].commercialVersions[0].currency='EUR';if(kind==='explicit')p.revisions=[{sourcePayload:{importOriginalCurrency:'INR'}}];if(kind==='protected')p.variants[0].ratePlans[0].sourcePayload.specialContract=true;if(kind==='deleted')p.deletedAt=new Date();expect(candidate(p)).toBeNull();
  });
  it('rejects the wrong database before starting a repair transaction',async()=>{const db={$transaction:jest.fn()};await expect(applyRepair(db,{format:1,target:'other',reviewedBy:'Reviewer'},'local')).rejects.toThrow('exact database');expect(db.$transaction).not.toHaveBeenCalled();});
  it('rejects stale input before any updates',async()=>{
    const original=product(),entry={...candidate(original),approved:true,reviewDecision:'CONFIRMED_IMPORT_DEFAULT_BUG',reviewNote:'Confirmed staging import default issue'};
    const tx={$queryRawUnsafe:jest.fn(),product:{findUnique:jest.fn().mockResolvedValue({...original,importFingerprint:'changed'}),update:jest.fn()}};
    await expect(applyRepair({$transaction:(fn:any)=>fn(tx)},{format:1,target:'local',reviewedBy:'Reviewer',candidates:[entry]},'local')).rejects.toThrow('changed');expect(tx.product.update).not.toHaveBeenCalled();
  });
});
