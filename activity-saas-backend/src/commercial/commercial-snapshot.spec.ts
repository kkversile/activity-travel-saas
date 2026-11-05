import { CommercialService } from './commercial.service';

describe('commercial snapshot conversion', () => {
  it('returns every required BookingEconomicsSnapshot field except bookingId', () => {
    const service = Object.create(CommercialService.prototype) as CommercialService;
    const quote = { ratePlanCommercialVersionId: 'cv1', currency: 'INR', pricingUnit: 'PER_PERSON', supplier: { model: 'NET_RATE', grossBasis: '100.00', commission: '0.00', vendorPayable: '100.00' }, voya: { model: 'MARKUP_FIXED', revenue: '10.00' }, agent: { model: 'NET_PLUS_MARKUP', commission: '0.00' }, agentFacingAmount: '110.00', tax: { mode: 'NONE', amount: '0.00', context: { rate: '0' } }, promotionAmount: '5.00', promotionFunder: 'SUPPLIER', promotionApplicationStage: 'POST_TAX', promotionFundingBreakdown: { SUPPLIER: '5.00' }, foc: { applied: false, freeChargeableQuantity: 0, discountAmount: '0.00' }, commercialEligibility: 'ALLOWED', focAmount: '0.00', finalAmount: '105.00', calculationInputs: {}, calculationOutputs: {}, appliedRules: [{ ruleId: 'r1', ruleVersionId: 'rv1', kind: 'TAX', scope: 'GLOBAL', priority: 1, stackingMode: 'EXCLUSIVE', effectiveFrom: '2026-09-01', effectiveTo: null }, { ruleId: 'vendor-promotion:promo-1', ruleVersionId: 'vendor-promotion:promo-1', kind: 'PROMOTION', scope: 'PRODUCT', priority: 0, stackingMode: 'STACK', effectiveFrom: '2026-09-01', effectiveTo: null, config: { vendorPromotionId: 'promo-1' } }] };
    const snapshot = (service as any).toBookingSnapshotData(quote);
    expect(snapshot).toMatchObject({ ratePlanCommercialVersionId: 'cv1', agentFacingAmount: '110.00', taxContext: { rate: '0' }, commercialEligibility: { decision: 'ALLOWED' } });
    expect(snapshot.ruleTrace[0]).toMatchObject({ ruleId: 'r1', ruleVersionId: 'rv1', effectiveFrom: '2026-09-01', effectiveTo: null });
    expect(snapshot.promotionContext).toMatchObject({ vendorPromotionId: 'promo-1' });
    expect(snapshot).not.toHaveProperty('bookingId');
  });
  it('rejects an incomplete quote rather than producing a partial snapshot', () => { const service = Object.create(CommercialService.prototype) as CommercialService; expect(() => (service as any).toBookingSnapshotData({ finalAmount: '0' })).toThrow('Quote is not snapshot-ready'); });
});
