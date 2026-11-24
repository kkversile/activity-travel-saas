import { bulkRateHistory, bulkRateSegments } from './bulk-rate-update';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VendorBulkRateUpdateDto } from './catalogue.dto';

const plan:any = {pricingUnit:'PER_PERSON',currency:'INR',minPax:1,maxPax:15,cutOffMinutes:60,cancellationRules:[{minDaysBefore:0,chargeType:'PERCENT',chargeValue:'100'}]};
const row:any = {productCode:'PRD',optionCode:'STD',validFrom:'2026-12-01',validTo:'2027-01-01',childSellInr:'950'};
const version = (id:string,from:string,to:string,adult:string,child='900',extra:any={}) => ({id,versionNumber:Number(id),status:'DRAFT',effectiveFrom:from,effectiveTo:to,pricingUnit:'PER_PERSON',currency:'INR',supplierModel:'NET_RATE',bookingMode:'INSTANT',supplierBaseAmount:'500',travellerPrices:[{travellerType:'ADULT',amount:adult},{travellerType:'CHILD',amount:child},{travellerType:'SENIOR',amount:'1400'}],sourcePayload:{mrpMode:'YES',mrpAmount:'2500',pricingDays:['MON'],pricingTimezone:'Asia/Kolkata'},...extra});
const amount = (segment:any,type='ADULT') => segment.option.travellerPrices.find((price:any)=>price.travellerType===type).amount;

describe('bulk rate date-segment inheritance',()=>{
  it('ignores an older incomplete draft left behind when an imported version was activated',()=>{
    const active=version('2','2026-11-01','2027-02-01','1800','900',{status:'ACTIVE'}),empty=version('1','2026-11-01','2027-02-01','0','0',{status:'DRAFT',pricingUnit:null,travellerPrices:[]});
    const [segment]=bulkRateSegments([empty,active],plan,row,'variant');expect(segment.version.id).toBe('2');expect(amount(segment)).toBe('1800');expect(segment.option.pricingUnit).toBe('PER_PERSON');
  });
  it('retains the edited December adult price when a later version represents January',()=>{
    const versions=[version('7','2027-01-01','2027-10-24','1800'),version('5','2026-12-01','2027-01-01','1900'),version('4','2026-10-24','2026-12-01','1800')];
    const segments=bulkRateSegments(versions,plan,row,'variant');
    expect(segments).toHaveLength(1);expect(amount(segments[0])).toBe('1900');expect(amount(segments[0],'CHILD')).toBe('950');expect(amount(segments[0],'SENIOR')).toBe('1400');
    expect(segments[0].option).toMatchObject({mrpAmount:'2500',timezone:'Asia/Kolkata',pricingDays:['MON'],supplierBaseAmount:'500'});
  });
  it('preserves different omitted prices, MRP and policies across every existing date boundary',()=>{
    const versions=[version('1','2026-11-01','2026-12-15','1800','800'),version('2','2026-12-15','2027-02-01','2000','1000',{sourcePayload:{mrpMode:'YES',mrpAmount:'2700',bookingRules:{cancellationRules:[]}}})];
    const segments=bulkRateSegments(versions,plan,row,'variant');
    expect(segments.map(item=>[item.option.effectiveFrom,item.option.effectiveTo,amount(item),amount(item,'CHILD'),item.option.mrpAmount])).toEqual([['2026-12-01','2026-12-15','1800','950','2500'],['2026-12-15','2027-01-01','2000','950','2700']]);
    expect(segments[1].option.cancellationRules).toEqual([]);
  });
  it('retains child prices when adult-only updates cross existing periods',()=>{
    const versions=[version('1','2026-11-01','2026-12-15','1800','800'),version('2','2026-12-15','2027-02-01','2000','1000')];
    const segments=bulkRateSegments(versions,plan,{...row,childSellInr:undefined,adultSellInr:'2100'},'variant');
    expect(segments.map(item=>[amount(item),amount(item,'CHILD')])).toEqual([['2100','800'],['2100','1000']]);
  });
  it('shadows approved history only within draft dates, irrespective of array order',()=>{
    const approved=version('10','2026-11-01','2027-02-01','1800','900',{status:'ACTIVE'}),draft=version('11','2026-12-01','2027-01-01','1900');
    expect(bulkRateHistory([draft,approved]).map(item=>[item.effectiveFrom.toISOString().slice(0,10),item.effectiveTo.toISOString().slice(0,10),item.value.id])).toEqual([['2026-11-01','2026-12-01','10'],['2026-12-01','2027-01-01','11'],['2027-01-01','2027-02-01','10']]);
  });
  it.each(['PER_BOOKING','GROUP','PER_UNIT'])('preserves %s resource, request and commission settings',unit=>{
    const existing=version('1','2026-11-01','2027-02-01','1800','900',{pricingUnit:unit,bookingMode:'MANUAL_ON_REQUEST',confirmationSlaMinutes:120,supplierCommissionPercent:'12.5',sourcePayload:{maxPassengersPerResource:4,mrpMode:'YES',mrpAmount:'3000'}});
    const [segment]=bulkRateSegments([existing],plan,{...row,childSellInr:undefined,baseSellInr:'2500'},'variant');
    expect(segment.option).toMatchObject({pricingUnit:unit,supplierBaseAmount:'2500',confirmationSlaMinutes:120,maxPassengersPerResource:4,supplierCommissionPercent:'12.5'});
    expect(segment.option.travellerPrices).toBeUndefined();
  });
  it('extends dates from the nearest existing terms',()=>{
    const versions=[version('1','2026-10-01','2026-11-01','1800')];
    expect(amount(bulkRateSegments(versions,plan,row,'variant')[0])).toBe('1800');
  });
});

describe('rate import DTO calendar validation',()=>{
  it.each(['2026-02-30','2026-02-29','2026-12-01T12:00:00Z','not-a-date'])('rejects %s before service writes',async value=>{
    const dto=plainToInstance(VendorBulkRateUpdateDto,{rows:[{...row,validFrom:value}]});expect(await validate(dto)).not.toHaveLength(0);
  });
  it('accepts a real leap day and a submission UUID',async()=>{
    const dto=plainToInstance(VendorBulkRateUpdateDto,{submissionId:'e950419d-cdad-4a51-8e22-a35c14b21dde',rows:[{...row,validFrom:'2028-02-29',validTo:'2028-03-01'}]});expect(await validate(dto)).toHaveLength(0);
  });
});
