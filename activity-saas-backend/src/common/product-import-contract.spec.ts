import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductRevisionDto, CreateProductDraftDto } from '../catalogue/catalogue.dto';
import { canonicalDuration, importChoices, normalizeImportChoices, isMoneyAmount, MAX_MONEY_AMOUNT } from './product-import-contract';
import { BookingMode, CapacityUnit, MeetingModel, OperatingModel, PricingUnit, ProductType, SupplierCommercialModel } from '@prisma/client';

describe('shared product import contract', () => {
  it.each(['0','0.0000','0000000.0001',MAX_MONEY_AMOUNT])('accepts non-negative decimal money %s',value=>expect(isMoneyAmount(value)).toBe(true));
  it.each(['-1','1.00001','1e14','100000000000000','99999999999999.99999','Infinity','NaN','',null,undefined])('rejects invalid or overflowing money %s',value=>expect(isMoneyAmount(value)).toBe(false));
  it('applies the exact storage bound to product-import prices as well as rate updates',()=>{
    expect(normalizeImportChoices('Rate_Plans',{adult_price:'100000000000000'}).issues[0]).toMatchObject({field:'adult_price',correction:expect.stringContaining(MAX_MONEY_AMOUNT)});
    expect(normalizeImportChoices('Rate_Plans',{adult_price:'0',mrp_amount:MAX_MONEY_AMOUNT}).issues).toEqual([]);
  });
  it.each(['hour', 'Hour', 'hOur', 'hr', 'hrs'])('canonicalizes %s', (value) => expect(canonicalDuration(value)).toBe('HOURS'));
  it('normalizes enum case and supported boolean aliases without accepting arbitrary text', () => {
    expect(normalizeImportChoices('Options', { sharing: 'private', pickup_included: 'YES', meal_included: 'n' })).toEqual({ row: { sharing: 'Private', pickup_included: true, meal_included: false }, issues: [] });
    expect(normalizeImportChoices('Options', { pickup_included: 'sometimes' }).issues[0]).toMatchObject({ field: 'pickup_included', correction: 'Choose true, false.' });
  });
  it('keeps dropdown enum choices consistent with the database', () => {
    for (const [section, field, values] of [
      ['Basic_Info', 'type', ProductType], ['Basic_Info', 'meeting_model', MeetingModel],
      ['Rate_Plans', 'pricing_unit', PricingUnit], ['Rate_Plans', 'booking_mode', BookingMode], ['Rate_Plans', 'supplier_model', SupplierCommercialModel],
      ['Availability', 'capacity_unit', CapacityUnit], ['Availability', 'operating_model', OperatingModel],
    ] as const) expect([...importChoices[section][field]].sort()).toEqual(Object.values(values).sort());
  });
  it.each([ProductRevisionDto, CreateProductDraftDto])('normalizes and validates duration for ordinary product APIs too', async (Dto) => {
    const Constructor: new () => { durationUnit?: string } = Dto;
    const valid = plainToInstance(Constructor, { durationUnit: 'hour' });
    expect(valid.durationUnit).toBe('HOURS');
    expect((await validate(valid)).some((error) => error.property === 'durationUnit')).toBe(false);
    expect((await validate(plainToInstance(Constructor, { durationUnit: 'BANANAS' }))).some((error) => error.property === 'durationUnit')).toBe(true);
    expect((await validate(plainToInstance(Constructor, { durationUnit: '' }))).some((error) => error.property === 'durationUnit')).toBe(false);
  });
});
