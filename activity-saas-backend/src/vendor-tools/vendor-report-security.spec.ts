import { ForbiddenException } from '@nestjs/common';
import { VendorToolsService } from './vendor-tools.service';
import { vendorReportTypesFor } from '../common/vendor-report-permissions';

const user = (organizationRole: string) => ({ role: 'VENDOR', organizationRole, tenantId: 'tenant-1', sub: 'employee-1' } as any);
describe('Vendor report role isolation and recovery', () => {
  it.each(['CATALOGUE', 'OPERATIONS', 'VIEWER'])('denies %s financial generation and queued exports before touching report data', async role => {
    const create = jest.fn(), query = jest.fn();
    const service = new VendorToolsService({ vendorReportExport: { create }, settlementBatch: { findMany: query } } as any);
    for (const type of ['PAYOUTS','COMMISSION_INVOICES','TDS_TCS_CERTIFICATES']) {
      await expect(service.enqueueReport(user(role), { type })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.createReport(user(role), { type })).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(create).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it.each(['OWNER','FINANCE'])('preserves %s access to financial reports through existing permissions', role => {
    expect(vendorReportTypesFor(user(role))).toEqual(expect.arrayContaining(['PAYOUTS','COMMISSION_INVOICES','TDS_TCS_CERTIFICATES']));
  });
  it.each(['CATALOGUE','OPERATIONS','FINANCE','VIEWER'])('prevents %s from setting recipients, resuming or reading saved schedules', async role => {
    const create=jest.fn(), update=jest.fn(), findMany=jest.fn();
    const service=new VendorToolsService({ reportSchedule: { create,update,findMany } } as any);
    await expect(service.createReportSchedule(user(role), {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateReportSchedule(user(role),'schedule-1',{status:'ACTIVE'})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listReportSchedules(user(role))).resolves.toEqual({items:[],deliveryAvailable:false});
    expect(create).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();expect(findMany).not.toHaveBeenCalled();
  });
  it('filters financial metadata and legacy files, including guessed download IDs', async()=>{
    const rows=[{ id:'finance',type:'PAYOUTS',name:'Private finance report',rows:[['confidential']] },{id:'products',type:'PRODUCTS',rows:[]}];
    const findMany=jest.fn().mockResolvedValue([]), findFirst=jest.fn().mockResolvedValue(null);
    const service=new VendorToolsService({vendorReportExport:{findMany,findFirst},globalSetting:{findFirst:jest.fn().mockResolvedValue({value:{reports:rows}})}} as any);
    expect((await service.listReports(user('CATALOGUE'))).map(row=>row.id)).toEqual(['products']);
    expect(findMany.mock.calls[0][0].where.type.in).not.toContain('PAYOUTS');
    await expect(service.downloadReport(user('CATALOGUE'),'finance')).rejects.toMatchObject({status:404});
    expect(findFirst.mock.calls[0][0].where.type.in).not.toContain('PAYOUTS');
  });
  it('keeps outlet and tenant filters on report history and guessed downloads', async()=>{
    const findMany=jest.fn().mockResolvedValue([]),findFirst=jest.fn().mockResolvedValue(null);
    const resolve=jest.fn().mockResolvedValue({tenantId:'tenant-1',outletIds:['assigned'],aggregate:false});
    const service=new VendorToolsService({vendorReportExport:{findMany,findFirst}} as any,{resolve} as any);
    await service.listReports(user('FINANCE'),'assigned');
    await expect(service.downloadReport(user('FINANCE'),'foreign','assigned')).rejects.toMatchObject({status:404});
    for(const call of [findMany.mock.calls[0][0],findFirst.mock.calls[0][0]])expect(call.where).toMatchObject({tenantId:'tenant-1',outletId:{in:['assigned']}});
  });
  it('terminates interrupted exports without affecting recent processing or pending work',async()=>{
    const updateMany=jest.fn().mockResolvedValue({count:1}),findMany=jest.fn().mockResolvedValue([]);
    await new VendorToolsService({vendorReportExport:{updateMany,findMany}} as any).resumePendingReportExports();
    expect(updateMany).toHaveBeenCalledWith({where:{status:'PROCESSING',OR:[{startedAt:{lt:expect.any(Date)}},{startedAt:null}]},data:{status:'FAILED',error:expect.stringContaining('interrupted'),completedAt:expect.any(Date)}});
    expect(findMany.mock.calls[0][0].where).toEqual({status:'PENDING'});
  });
  it('does not let a late worker overwrite an interrupted export state',async()=>{
    const updateMany=jest.fn().mockResolvedValue({count:1});
    const service=new VendorToolsService({vendorReportExport:{updateMany,findFirst:jest.fn().mockResolvedValue({type:'PRODUCTS',format:'CSV'})}} as any);
    jest.spyOn(service,'createReport').mockResolvedValue({id:'snapshot',rows:[['Product']]} as any);
    await (service as any).processReportExport('report-1','tenant-1');
    const claimed=updateMany.mock.calls[0][0].data.startedAt;
    expect(updateMany.mock.calls[1][0]).toMatchObject({where:{id:'report-1',tenantId:'tenant-1',status:'PROCESSING',startedAt:claimed},data:{status:'READY'}});
  });
});
