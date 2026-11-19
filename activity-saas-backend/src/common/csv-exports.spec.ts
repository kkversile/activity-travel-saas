import { BookingsService } from '../bookings/bookings.service';
import { FulfilmentService } from '../fulfilment/fulfilment.service';
import { FinanceService } from '../finance/finance.service';
import { VendorToolsService } from '../vendor-tools/vendor-tools.service';
import ExcelJS from 'exceljs';

const owner = { role:'VENDOR', organizationRole:'OWNER', tenantId:'vendor-1', sub:'owner-1' } as any;
describe('CSV protection at every export surface',()=>{
  it('protects persisted reports without changing stored rows or negative amounts',async()=>{
    const rows=[['Name','Amount'],['=2+3','-100.00']];
    const saved={id:'report-1',type:'BOOKINGS',name:'Bookings',format:'CSV',status:'READY',createdAt:new Date(),rows};
    const service=new VendorToolsService({vendorReportExport:{findFirst:jest.fn().mockResolvedValue(saved)}} as any);
    const result=await service.downloadReport(owner,'report-1');
    expect(result.body).toContain('"\t=2+3","-100.00"');expect(rows[1]).toEqual(['=2+3','-100.00']);
  });
  it('retains native XLSX text cells without CSV prefixes or formula objects',async()=>{
    const saved={id:'xlsx-1',type:'PRODUCTS',name:'Products',format:'XLSX',status:'READY',createdAt:new Date(),rows:[['Name','Amount'],['=2+3','-100.00']]};
    const service=new VendorToolsService({vendorReportExport:{findFirst:jest.fn().mockResolvedValue(saved)}} as any);
    const result=await service.downloadReport(owner,'xlsx-1');
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(result.body as any);
    expect(workbook.worksheets[0].getCell('A2').value).toBe('=2+3');
    expect(workbook.worksheets[0].getCell('B2').value).toBe('-100.00');
  });
  it('protects booking names and agency text while preserving pagination/amounts',async()=>{
    const service=new BookingsService(...Array(10).fill({}) as [any,any,any,any,any,any,any,any,any,any]);
    jest.spyOn(service,'vendorPage').mockResolvedValue({items:[{bookingCode:'BK-1',snapshot:{productSnapshot:{productName:'=2+3'}},serviceDate:'2026-11-20',agent:{name:'@SUM(1,2)'},status:'CONFIRMED',travellers:[],amount:-100,currency:'INR'}],pagination:{totalPages:1}} as any);
    const csv=await service.vendorCsv(owner,{} as any);
    expect(csv).toContain('"\t=2+3"');expect(csv).toContain('"\t@SUM(1,2)"');expect(csv).toContain(',-100,INR');
  });
  it('protects manifest products, guest names and PNR references',async()=>{
    const service=new FulfilmentService({} as any,{} as any,{} as any,{} as any,{} as any,{} as any);
    jest.spyOn(service,'manifest').mockResolvedValue({sessions:[{localStartTime:'09:00',sessionId:'session-1',product:{productName:'+2+3'},variant:{name:'Walk'},pickupGroups:[{bookings:[{bookingCode:'BK-1',pax:1,leadTravellerName:'＝2+3',pnrReference:'@SUM(1,2)',voucherStatus:'READY',checkInStatus:'PENDING'}]}]}]} as any);
    const csv=await service.manifestCsv(owner,'2026-11-20');
    expect(csv).toContain('"\t+2+3"');expect(csv).toContain('"\t＝2+3"');expect(csv).toContain('"\t@SUM(1,2)"');
  });
  it('protects settlement references and preserves signed financial decimals',async()=>{
    const batch={id:'batch-1',batchCode:'PB-1',createdAt:new Date('2026-11-20'),status:'RECONCILED',payout:{id:'payout-1',status:'RECONCILED',reference:'=2+3'},lines:[{lineType:'ADJUSTMENT',currency:'INR',grossBookingValue:'0',vendorPayableBase:'0',adjustmentAmount:'-25.50',taxInformational:'0',netVendorPayable:'-25.50',components:{}}]};
    const service=new FinanceService({settlementBatch:{findFirst:jest.fn().mockResolvedValue(batch)},publicIdentifier:{findMany:jest.fn().mockResolvedValue([])}} as any,{} as any,{} as any);
    const csv=await service.vendorSettlementStatement(owner,'batch-1');
    expect(csv).toContain('"\t=2+3"');expect(csv).toContain('"-25.50"');expect(csv).not.toContain('"\t-25.50"');expect(batch.payout.reference).toBe('=2+3');
  });
});
