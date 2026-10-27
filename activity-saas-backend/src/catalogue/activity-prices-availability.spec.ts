import { PricingUnit, UserRole } from '@prisma/client';
import { buildActivityEditorSourcePayload, CatalogueService } from './catalogue.service';

const vendor = { sub: 'u1', email: 'vendor@test', role: UserRole.VENDOR, tenantId: 't1' } as any;

function makeService() {
  const prisma: any = {
    product: { findFirst: jest.fn() },
    productVariant: { findMany: jest.fn() },
    ratePlan: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new CatalogueService(prisma, {} as any, {} as any, {} as any), prisma };
}

describe('simplified prices and availability editor', () => {
  it('clears stale visitor pricing when the feature is disabled', () => {
    const payload = buildActivityEditorSourcePayload({
      createdFromActivityEditor: true,
      visitorPrices: [{ travellerType: 'ADULT', indian: '100', foreign: '150' }],
      visitorEligibilityBasis: 'RESIDENCY',
      visitorVerificationMode: 'DOCUMENT_AT_BOOKING',
    }, false, { timezone: 'Asia/Kolkata', pricingDays: ['MON'] });
    expect(payload).not.toHaveProperty('visitorPrices');
    expect(payload).not.toHaveProperty('visitorEligibilityBasis');
    expect(payload).not.toHaveProperty('visitorVerificationMode');
  });

  it('rejects duplicate options before any apply write can be attempted', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'STD', name: 'Standard' }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      options: [
        { variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, travellerPrices: [{ travellerType: 'ADULT', amount: '100' }] },
        { variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, travellerPrices: [{ travellerType: 'ADULT', amount: '110' }] },
      ],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('options[1]: each option can be included only once');
  });

  it('accepts per-booking prices without inventing traveller prices', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'PRIVATE', name: 'Private group' }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_BOOKING, supplierBaseAmount: '2500' }],
    } as any);
    expect(result).toMatchObject({ valid: true, options: [{ pricingUnit: PricingUnit.PER_BOOKING, travellerPrices: 0 }] });
  });

  it('requires visitor prices when differential visitor pricing is enabled', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'STD', name: 'Standard' }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      hasDifferentialVisitorPricing: true,
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, travellerPrices: [{ travellerType: 'ADULT', amount: '100' }] }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Standard: enter the foreign adult price or turn off visitor pricing (the Indian price comes from the option price)');
  });

  it('requires resource passenger limits and a response SLA for non-instant booking', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'JEEP', name: 'Private jeep' }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_UNIT, supplierBaseAmount: '3500', bookingMode: 'MANUAL_ON_REQUEST' }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'options[0]: add maximum passengers per resource for per-resource pricing',
      'options[0]: add a confirmation SLA for non-instant booking',
    ]));
  });

  it('rejects an empty half-open date range', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'STD', name: 'Standard' }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, effectiveFrom: '2026-11-01', effectiveTo: '2026-11-01', travellerPrices: [{ travellerType: 'ADULT', amount: '100' }] }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('options[0]: selling end must be after selling start (the end date is exclusive)');
  });

  it('requires both Indian and foreign adult prices for differential visitor pricing', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'STD', name: 'Standard' }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      hasDifferentialVisitorPricing: true,
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, travellerPrices: [{ travellerType: 'ADULT', amount: '100' }], visitorPrices: [{ travellerType: 'ADULT', indian: '100', foreign: '' }] }],
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Standard: enter the foreign adult price or turn off visitor pricing (the Indian price comes from the option price)');
  });

  it('counts only selected pricing weekdays in the preview', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'STD', name: 'Standard' }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, effectiveFrom: '2026-11-02', effectiveTo: '2026-11-09', pricingDays: ['MON', 'WED'], travellerPrices: [{ travellerType: 'ADULT', amount: '100' }] }],
    } as any);
    expect(result.summary.affectedDates).toBe(2);
    expect(result.options[0].pricingDays).toEqual(['MON', 'WED']);
  });

  it('keeps existing cancellation rules in the preview so edits are explainable', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'STD', name: 'Standard' }]);
    s.prisma.ratePlan.findMany.mockResolvedValue([{
      variantId: 'v1',
      ratePlanCode: 'ACTIVITY-STD',
      name: 'Activity price · Standard',
      cancellationRules: [{ minDaysBefore: 7, maxDaysBefore: null, chargeValue: 0, chargeType: 'PERCENTAGE' }],
      commercialVersions: [{ id: 'cv1', status: 'ACTIVE', effectiveFrom: new Date('2026-11-01'), effectiveTo: new Date('2026-12-01'), pricingUnit: PricingUnit.PER_PERSON, travellerPrices: [], sourcePayload: {} }],
    }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, travellerPrices: [{ travellerType: 'ADULT', amount: '100' }] }],
    } as any);
    expect(result.previousRates[0].cancellationRules).toEqual([{ minDaysBefore: 7, maxDaysBefore: null, chargeValue: 0, chargeType: 'PERCENTAGE' }]);
  });

  it('reports editor-history overlap resolution before apply', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{ id: 'v1', variantCode: 'STD', name: 'Standard' }]);
    s.prisma.ratePlan.findMany.mockResolvedValue([{
      variantId: 'v1',
      ratePlanCode: 'ACTIVITY-STD',
      name: 'Activity price · Standard',
      sourcePayload: { createdFromActivityEditor: true },
      cancellationRules: [],
      commercialVersions: [{ id: 'cv1', versionNumber: 4, status: 'ACTIVE', effectiveFrom: new Date('2026-11-01'), effectiveTo: new Date('2026-12-01'), pricingUnit: PricingUnit.PER_PERSON, travellerPrices: [{ travellerType: 'ADULT', amount: '100' }], sourcePayload: { createdFromActivityEditor: true } }],
    }]);
    const result = await s.service.previewActivityPricesAvailability(vendor, 'p1', {
      options: [{ variantId: 'v1', pricingUnit: PricingUnit.PER_PERSON, effectiveFrom: '2026-11-15', effectiveTo: '2026-11-20', travellerPrices: [{ travellerType: 'ADULT', amount: '125' }] }],
    } as any);
    expect(result.valid).toBe(true);
    expect(result.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'EFFECTIVE_HISTORY_OVERLAP', resolution: 'SPLIT_EXISTING_HISTORY', existingVersionId: 'cv1' })]));
  });

  it('returns cancellation rules and marks protected legacy plans as non-editable', async () => {
    const s = makeService();
    s.prisma.product.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    s.prisma.productVariant.findMany.mockResolvedValue([{
      id: 'v1',
      variantCode: 'PRIVATE-JEEP',
      name: 'Private Jeep',
      ratePlans: [{
        id: 'rp1',
        ratePlanCode: 'SPECIAL-JEEP',
        name: 'Preferred agent contract',
        sourcePayload: { specialContract: true },
        channelMappings: [{ status: 'ACTIVE', enabled: true }],
        cancellationRules: [{ minDaysBefore: 7, chargeValue: 0, chargeType: 'PERCENTAGE' }],
        commercialVersions: [{ id: 'cv1', status: 'ACTIVE', versionNumber: 1, pricingUnit: PricingUnit.PER_UNIT, sourcePayload: { maxPassengersPerResource: 7 }, travellerPrices: [] }],
        scheduleMappings: [],
      }],
    }]);
    const result = await s.service.activityPricesAvailability(vendor, 'p1');
    expect(result.options[0].ratePlans[0]).toMatchObject({ editable: false, advanced: true, protected: true, cancellationRules: [{ minDaysBefore: 7 }] });
  });
});
