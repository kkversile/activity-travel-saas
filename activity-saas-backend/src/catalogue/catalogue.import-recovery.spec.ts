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
