import { UserRole } from '@prisma/client';
import { CatalogueService } from './catalogue.service';
import { attachCatalogueTestOutletAccess } from './catalogue-test-outlet-access';
import { productImportJsonSample } from '../common/product-import-sample';
const vendor = {sub:'vendor',tenantId:'tenant',role:UserRole.VENDOR} as any;
function fixture() {
 const tx = {product:{updateMany:jest.fn().mockResolvedValue({count:1})}};
 const prisma:any = {product:{findFirst:jest.fn().mockResolvedValue(null)},$transaction:jest.fn(async run=>run(tx))};
 const audit:any={write:jest.fn()};const outbox:any={enqueue:jest.fn()};
 const commercial:any={createVersion:jest.fn().mockResolvedValue({id:'commercial'}),activateVersion:jest.fn()};
 const ratePlans:any={create:jest.fn().mockResolvedValue({id:'rate'})};
 const schedule={id:'schedule',version:1};const schedules:any={create:jest.fn().mockResolvedValue(schedule),activate:jest.fn().mockResolvedValue(schedule),mapRatePlan:jest.fn(),list:jest.fn().mockResolvedValue([schedule])};
 const service=attachCatalogueTestOutletAccess(new CatalogueService(prisma,audit,outbox,{} as any,undefined,commercial,undefined,ratePlans,schedules,{materialize:jest.fn()} as any));
 jest.spyOn(service,'createDraft').mockResolvedValue({id:'new-product'} as any);
 jest.spyOn(service,'get').mockResolvedValue({revisions:[{id:'revision',status:'DRAFT'}]} as any);
 jest.spyOn(service,'updateRevision').mockResolvedValue({} as any);
 jest.spyOn(service,'addMedia').mockResolvedValue({} as any);
 jest.spyOn(service,'createBookingQuestion').mockResolvedValue({} as any);
 jest.spyOn(service,'createVariant').mockResolvedValue({id:'variant'} as any);
 const blueprint=jest.spyOn(service,'replaceVariantBlueprint').mockResolvedValue({} as any);
 const dto:any=JSON.parse(JSON.stringify(productImportJsonSample));
 dto.Ticket_Types=[{product_key:dto.Basic_Info[0].product_key,option_code:dto.Options[0].option_code,ticket_type:'Adult',age_from:13,age_to:'',counts_capacity:true}];
 return {service,dto,blueprint,prisma,tx,audit};
}
describe('JSON import write recovery',()=>{
 it.each(['USD','EUR','INR'])('sets product metadata from uniform %s rates',async currency=>{
  const {service,dto}=fixture();for(const row of dto.Rate_Plans)row.currency=currency;
  await service.importJson(vendor,dto);
  expect(service.createDraft).toHaveBeenCalledWith(vendor,expect.objectContaining({currency}),expect.anything(),undefined);
 });
 it('rejects mixed-currency imports without a deliberate product default before any writes',async()=>{
  const {service,dto}=fixture();dto.Rate_Plans[0].currency='USD';
  await expect(service.importJson(vendor,dto)).rejects.toMatchObject({response:{issues:expect.arrayContaining([expect.objectContaining({section:'Basic_Info',field:'currency',correction:expect.stringContaining('Set currency')})])}});
  expect(service.createDraft).not.toHaveBeenCalled();
 });
 it.each(['P9X','USD'])('rejects an invalid or conflicting explicit currency %s without creating a draft',async currency=>{
  const {service,dto}=fixture();dto.Basic_Info[0].currency=currency;
  await expect(service.importJson(vendor,dto)).rejects.toMatchObject({response:{issues:expect.arrayContaining([expect.objectContaining({field:'currency',correction:expect.any(String)})])}});
  expect(service.createDraft).not.toHaveBeenCalled();
 });
 it('retains an explicit default for a mixed-currency product without converting its rates',async()=>{
  const {service,dto}=fixture();dto.Rate_Plans[0].currency='USD';dto.Basic_Info[0].currency='usd';
  await service.importJson(vendor,dto);
  expect(service.createDraft).toHaveBeenCalledWith(vendor,expect.objectContaining({currency:'USD'}),expect.anything(),undefined);
 });
 it('initializes option booking defaults from the matching imported plan, not another option',async()=>{
  const {service,dto}=fixture();await service.importJson(vendor,dto);
  expect(service.createVariant).toHaveBeenCalledWith(vendor,'new-product',expect.objectContaining({variantCode:dto.Options[0].option_code,minPax:1,maxPax:15,cutOffMinutes:1440}));
  expect(service.createVariant).toHaveBeenCalledWith(vendor,'new-product',expect.objectContaining({variantCode:dto.Options[1].option_code,minPax:1,maxPax:6,cutOffMinutes:1440}));
 });
 it('does not choose conflicting plan limits as global option defaults',async()=>{
  const {service,dto}=fixture();dto.Rate_Plans.push({...dto.Rate_Plans[0],rate_plan_code:'OTHER-LIMITS',max_pax:30,cutoff_minutes:0});
  await service.importJson(vendor,dto);
  const option=(service.createVariant as jest.Mock).mock.calls[0][2];
  expect(option.minPax).toBe(1);expect(option).not.toHaveProperty('maxPax');expect(option).not.toHaveProperty('cutOffMinutes');
 });
 it.each([
  {kind:'IMAGE',external_url:'https://example.com/image.jpg'},
  {kind:'IMAGE',external_url:'https://example.com/image.jpg',file_asset_id:'owned-image'},
  {kind:'VIDEO',external_url:'file:///private/video.mp4'},
 ])('blocks unsupported media during both preflight and saving before creating any draft',async media=>{
  const {service,dto}=fixture();dto.Media=[media];
  for(const validateOnly of [true,false])await expect(service.importJson(vendor,dto,undefined,validateOnly)).rejects.toMatchObject({response:{code:'IMPORT_VALIDATION_FAILED',issues:expect.arrayContaining([expect.objectContaining({section:'Media',correction:expect.any(String)})])}});
  expect(service.createDraft).not.toHaveBeenCalled();
 });
 it.each([null,{mimeType:'video/mp4'}])('rejects foreign, private, archived or wrong-kind image references before writes',async asset=>{
  const {service,dto,prisma}=fixture();prisma.fileAsset={findFirst:jest.fn().mockResolvedValue(asset)};dto.Media=[{kind:'IMAGE',file_asset_id:'image'}];
  await expect(service.importJson(vendor,dto,undefined,true)).rejects.toMatchObject({response:{issues:expect.arrayContaining([expect.objectContaining({section:'Media',field:'file_asset_id'})])}});
  expect(prisma.fileAsset.findFirst).toHaveBeenCalledWith({where:{id:'image',tenantId:'tenant',purpose:'PRODUCT_MEDIA',visibility:'PUBLIC',archivedAt:null}});expect(service.createDraft).not.toHaveBeenCalled();
 });
 it('accepts an authorized uploaded image during preflight without creating a draft',async()=>{
  const {service,dto,prisma}=fixture();prisma.fileAsset={findFirst:jest.fn().mockResolvedValue({mimeType:'image/jpeg'})};dto.Media=[{kind:'IMAGE',file_asset_id:'owned'}];
  await expect(service.importJson(vendor,dto,undefined,true)).resolves.toMatchObject({valid:true});expect(service.createDraft).not.toHaveBeenCalled();
 });
 it('rejects duplicate schedule identities during preflight and save before creating a draft',async()=>{
  const {service,dto}=fixture();dto.Availability.push({...dto.Availability[0],default_capacity:6,operating_days:'MON|TUE'});
  for(const validateOnly of [true,false]) await expect(service.importJson(vendor,dto,undefined,validateOnly)).rejects.toMatchObject({response:{code:'IMPORT_VALIDATION_FAILED',issues:expect.arrayContaining([expect.objectContaining({section:'Availability',field:'schedule_code',correction:expect.stringContaining('one Availability row')})])}});
  expect(service.createDraft).not.toHaveBeenCalled();
 });
 it.each([
  ['Basic_Info','duration_value','-2'],['Basic_Info','duration_value','two'],
  ['Rate_Plans','adult_price','banana'],['Rate_Plans','adult_price','-1'],['Rate_Plans','adult_price','1.12345'],
  ['Rate_Plans','valid_from','not-a-date'],['Rate_Plans','valid_from','2026-02-30'],['Rate_Plans','valid_to','2020-01-01'],
  ['Availability','effective_to','2020-01-01'],['Availability','operating_days','FUNDAY'],['Availability','start_time','25:00'],
 ])('rejects invalid %s.%s=%s for both preflight and save without creating a draft',async(section,field,value)=>{
  const {service,dto}=fixture();dto[section][0][field]=value;
  for(const validateOnly of [true,false]) await expect(service.importJson(vendor,dto,undefined,validateOnly)).rejects.toMatchObject({response:{code:'IMPORT_VALIDATION_FAILED',issues:expect.arrayContaining([expect.objectContaining({section,field,correction:expect.any(String)})])}});
  expect(service.createDraft).not.toHaveBeenCalled();
 });
 it('preflights all product values before creating any draft in a batch',async()=>{
  const {service,dto}=fixture();const second=JSON.parse(JSON.stringify(dto));
  for(const rows of Object.values(second))if(Array.isArray(rows))for(const row of rows)if(row&&typeof row==='object')row.product_key='SECOND_PRODUCT';
  second.Rate_Plans[0].adult_price='banana';
  await expect(service.importBatch(vendor,{products:[dto,second]})).rejects.toMatchObject({response:{code:'IMPORT_BATCH_VALIDATION_FAILED'}});
  expect(service.createDraft).not.toHaveBeenCalled();
 });
 it.each([['Basic_Info','duration_unit'],['Basic_Info','type'],['Options','sharing'],['Rate_Plans','booking_mode'],['Availability','capacity_unit']])('rejects invalid %s.%s before writing drafts',async(section,field)=>{
  const {service,dto}=fixture();dto[section][0][field]='BANANAS';
  await expect(service.importJson(vendor,dto)).rejects.toMatchObject({response:{code:'IMPORT_VALIDATION_FAILED',issues:expect.arrayContaining([expect.objectContaining({section,field,value:'BANANAS',correction:expect.stringContaining('Choose ')})])}});
  expect(service.createDraft).not.toHaveBeenCalled();
 });
 it('normalizes imported duration before passing it to the ordinary product service',async()=>{
  const {service,dto}=fixture();dto.Basic_Info[0].duration_unit='hOur';dto.Basic_Info[0].duration_value='2';
  await service.importJson(vendor,dto);
  expect(service.updateRevision).toHaveBeenCalledWith(vendor,'revision',expect.objectContaining({durationUnit:'HOURS'}));
  expect(dto.Basic_Info[0].duration_unit).toBe('hOur');
 });
 it('preserves an unspecified adult upper age as unbounded',async()=>{
  const {service,dto,blueprint}=fixture();
  await expect(service.importJson(vendor,dto)).resolves.toMatchObject({productId:'new-product'});
  expect(blueprint.mock.calls[0][2]).toMatchObject({ticketTypes:[{name:'Adult',ageFrom:13,ageTo:undefined}]});
 });
 it('hides incomplete new drafts and releases import identities when a later write fails',async()=>{
  const {service,dto,blueprint,tx,audit}=fixture();blueprint.mockRejectedValueOnce(new Error('write failed'));
  await expect(service.importJson(vendor,dto)).rejects.toThrow('write failed');
  expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'new-product',tenantId:'tenant',status:'DRAFT',bookings:{none:{}}}),data:expect.objectContaining({deletedAt:expect.any(Date),sourceImportKey:null,importFingerprint:null,importIdempotencyKey:null})}));
  expect(audit.write).toHaveBeenCalledWith(tx,expect.objectContaining({action:'PRODUCT_IMPORT_FAILED',entityId:'new-product'}));
 });
});
