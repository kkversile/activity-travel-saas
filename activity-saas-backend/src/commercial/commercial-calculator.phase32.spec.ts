import { CommercialCalculatorService } from './commercial-calculator.service';

const calculator = new CommercialCalculatorService();
const version = (overrides: any = {}) => ({ id: 'v1', versionNumber: 1, currency: 'INR', supplierModel: 'NET_RATE', pricingUnit: 'PER_PERSON', supplierBaseAmount: '1', bookingMode: 'INSTANT', travellerPrices: [{ travellerType: 'ADULT', amount: '1' }], ...overrides });
const input = (overrides: any = {}) => ({ ratePlanId: 'rp', serviceDate: new Date('2026-09-11'), units: 1, travellers: [{ travellerType: 'ADULT', quantity: 1 }], ...overrides });
const rule = (kind: string, config: any) => ({ rule: { id: `${kind}-rule`, kind, scopeType: 'GLOBAL', versions: [{ id: `${kind}-v1`, priority: 0, stackingMode: 'EXCLUSIVE', effectiveFrom: new Date('2026-09-01'), effectiveTo: null }] }, config });
const tax = (roundingPolicy: string) => rule('TAX', { mode: 'EXCLUSIVE', rate: '12.5', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy });

describe('Phase 3.2 calculator integrity', () => {
  it.each([
    ['HALF_UP', '0.13'], ['HALF_EVEN', '0.12'], ['DOWN', '0.12'], ['UP', '0.13'],
  ])('applies %s tax rounding at currency precision', (policy, expected) => {
    const result = calculator.calculate(input(), version(), [rule('VOYA_REVENUE', { model: 'MARKUP_FIXED', fixedAmount: '0' }), tax(policy)]);
    expect(result.tax?.amount).toBe(expected);
    expect((result.calculationOutputs as any).taxAmount).toBe(expected);
  });

  it('does not treat unsupported FOC funders as supplier-funded', () => {
    const result = calculator.calculate(input({ travellers: [{ travellerType: 'ADULT', quantity: 10 }] }), version(), [rule('VOYA_REVENUE', { model: 'MARKUP_FIXED', fixedAmount: '0' }), rule('TAX', { mode: 'NONE', rate: '0', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy: 'HALF_UP' }), rule('FOC', { enabled: true, qualifyingQuantity: 10, freeQuantity: 1, appliesTo: 'ADULT', funder: 'VOYA' })]);
    expect(result.reasonCodes).toContain('FOC_FUNDING_MODEL_NOT_LOCKED');
    expect(result.ready).toBe(false);
    expect(result.foc).toMatchObject({ applied: false, freeChargeableQuantity: 0, discountAmount: '0.00', funder: 'VOYA' });
    expect(result.supplier?.grossBasis).toBe('10.00');
  });

  it('caps malformed persisted FOC quantity and never makes the basis negative', () => {
    const result = calculator.calculate(input({ travellers: [{ travellerType: 'ADULT', quantity: 2 }] }), version(), [rule('VOYA_REVENUE', { model: 'MARKUP_FIXED', fixedAmount: '0' }), rule('TAX', { mode: 'NONE', rate: '0', taxableBase: 'AGENT_PRE_TAX', accountableParty: 'NONE', roundingPolicy: 'HALF_UP' }), rule('FOC', { enabled: true, qualifyingQuantity: 1, freeQuantity: 99, appliesTo: 'ADULT', funder: 'SUPPLIER' })]);
    expect(result.foc.freeChargeableQuantity).toBe(2);
    expect(result.supplier?.grossBasis).toBe('0.00');
    expect(Number(result.finalAmount)).toBeGreaterThanOrEqual(0);
  });
});
