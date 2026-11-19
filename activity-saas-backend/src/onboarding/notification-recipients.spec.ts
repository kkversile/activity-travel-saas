import nodemailer from 'nodemailer';
import { OnboardingEmailService } from './onboarding-email.service';
import { CatalogueEmailService } from '../catalogue/catalogue-email.service';
jest.mock('nodemailer',()=>({__esModule:true,default:{createTransport:jest.fn()}}));
describe('Administrative email recipient isolation',()=>{
  const env={...process.env},sendMail=jest.fn();
  beforeEach(()=>{
    jest.resetAllMocks();Object.assign(process.env,{SMTP_HOST:'loopback.invalid',SMTP_USER:'sender@fixture.invalid',SMTP_PASSWORD:'fixture-only'});
    delete process.env.ONBOARDING_ADMIN_EMAIL;delete process.env.PRODUCT_ADMIN_EMAIL;
    (nodemailer.createTransport as jest.Mock).mockReturnValue({sendMail});
  });
  afterAll(()=>{process.env=env;});
  it('addresses onboarding decisions only to an active workspace owner',async()=>{
    const findFirst=jest.fn().mockResolvedValue({name:'Vendor',users:[{email:'owner@fixture.invalid',fullName:'Owner'}]});
    await new OnboardingEmailService({tenant:{findFirst}} as any).notifyReview('tenant-1','APPROVED' as any,'APPROVED');
    expect(findFirst.mock.calls[0][0]).toMatchObject({where:{id:'tenant-1',kind:'VENDOR'},select:{users:{where:{role:'VENDOR',organizationRole:'OWNER',active:true}}}});
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({to:'owner@fixture.invalid'}));
  });
  it('does not fall back to an employee when a workspace has no active owner',async()=>{
    const service=new OnboardingEmailService({tenant:{findFirst:jest.fn().mockResolvedValue({users:[]})}} as any);
    await expect(service.notifyReview('tenant-1','APPROVED' as any,'APPROVED')).rejects.toThrow('Vendor email is not available');expect(sendMail).not.toHaveBeenCalled();
  });
  it('uses active administrators and explicitly configured onboarding recipients, deduplicated',async()=>{
    process.env.ONBOARDING_ADMIN_EMAIL=' designated@fixture.invalid, admin@fixture.invalid ';
    const findMany=jest.fn().mockResolvedValue([{email:'admin@fixture.invalid'}]);
    await new OnboardingEmailService({user:{findMany}} as any).notifySubmitted('tenant-1','Vendor');
    expect(findMany).toHaveBeenCalledWith({where:{role:{in:['ADMIN','SUPER_ADMIN']},active:true},select:{email:true}});
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({to:['designated@fixture.invalid','admin@fixture.invalid']}));
  });
  it('refuses onboarding submission mail rather than using a hardcoded outside mailbox',async()=>{
    await expect(new OnboardingEmailService({user:{findMany:jest.fn().mockResolvedValue([])}} as any).notifySubmitted('tenant-1','Vendor')).rejects.toThrow('No active administrator');expect(sendMail).not.toHaveBeenCalled();
  });
  it('honors an explicit onboarding recipient list without adding other administrator mailboxes',async()=>{
    process.env.ONBOARDING_ADMIN_EMAIL='designated@fixture.invalid';
    await new OnboardingEmailService({user:{findMany:jest.fn().mockResolvedValue([{email:'other-admin@fixture.invalid'}])}} as any).notifySubmitted('tenant-1','Vendor');
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({to:['designated@fixture.invalid']}));
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({connectionTimeout:15000,greetingTimeout:10000,socketTimeout:30000}));
  });
  const revision=(users:any[])=>({id:'revision-1',versionNumber:1,productName:'Walk',product:{productCode:'PRD-1',tenant:{name:'Vendor',users}}});
  it('addresses admin product-edit notices only to an active owner',async()=>{
    const findUnique=jest.fn().mockResolvedValue(revision([{email:'owner@fixture.invalid',fullName:'Owner'}]));
    await new CatalogueEmailService({productRevision:{findUnique}} as any).notifyAdminEdited('revision-1','Administrator');
    expect(findUnique.mock.calls[0][0].select.product.select.tenant.select.users.where).toEqual({role:'VENDOR',organizationRole:'OWNER',active:true});
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({to:['owner@fixture.invalid']}));
  });
  it('refuses catalogue submission mail when no authorized admin recipient exists',async()=>{
    const service=new CatalogueEmailService({productRevision:{findUnique:jest.fn().mockResolvedValue(revision([]))},user:{findMany:jest.fn().mockResolvedValue([])}} as any);
    await expect(service.notifySubmitted('revision-1')).rejects.toThrow('No active administrator');expect(sendMail).not.toHaveBeenCalled();
  });
});
