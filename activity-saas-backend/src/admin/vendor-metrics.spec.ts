import { summarizeVendorCommercialTerms, summarizeVendorMetrics } from './vendor-metrics';

describe('vendor metrics', () => {
  it('calculates on-request acceptance from resolved requests only and reports vendor cancellations as a rate', () => {
    const result = summarizeVendorMetrics([
      { bookingMode: 'INSTANT', status: 'CONFIRMED', amount: 100 },
      { bookingMode: 'VENDOR_CONFIRMATION', status: 'CONFIRMED', amount: 200 },
      { bookingMode: 'MANUAL_ON_REQUEST', status: 'VENDOR_REJECTED', amount: 300 },
      { bookingMode: 'MANUAL_ON_REQUEST', status: 'PENDING_MANUAL_REVIEW', amount: 400 },
      { bookingMode: 'VENDOR_CONFIRMATION', status: 'CONFIRMATION_EXPIRED', amount: 500 },
      { bookingMode: 'VENDOR_CONFIRMATION', status: 'CANCELLED', confirmedAt: new Date(), amount: 600, cancellation: { initiator: 'VENDOR' } },
    ]);

    expect(result).toMatchObject({
      bookings: 6,
      gmv: 2100,
      acceptanceRate: 50,
      cancellationsByVendor: 16.7,
      cancellationsByVendorCount: 1,
      rating: null,
      ratingCount: 0,
      ratingAvailable: false,
    });
  });

  it('leaves on-request acceptance and cancellation rate unavailable with no denominator', () => {
    expect(summarizeVendorMetrics([])).toMatchObject({ acceptanceRate: null, cancellationsByVendor: null, cancellationsByVendorCount: 0 });
  });
});

describe('vendor commercial terms', () => {
  it('reports a single effective contract without averaging distinct commissions', () => {
    expect(summarizeVendorCommercialTerms([
      { supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: '18.0000' },
      { supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: 18 },
    ], { supplierModel: 'NET_RATE', supplierCommissionPercent: 12 })).toMatchObject({ model: 'COMMISSIONABLE', commissionPercent: 18, commissionValues: [18], commissionVaries: false });
  });

  it('reports mixed models and varying commissions instead of a misleading average', () => {
    expect(summarizeVendorCommercialTerms([
      { supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: 12 },
      { supplierModel: 'NET_RATE', supplierCommissionPercent: null },
      { supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: 20 },
    ], { supplierModel: 'NET_RATE', supplierCommissionPercent: null })).toMatchObject({ model: 'MIXED', commissionPercent: null, commissionValues: [12, 20], commissionVaries: true });
  });

  it('uses onboarding defaults only when no effective rate-plan contracts are present', () => {
    expect(summarizeVendorCommercialTerms([], { supplierModel: 'NET_RATE', supplierCommissionPercent: '12.5' })).toMatchObject({ model: 'NET_RATE', commissionPercent: 12.5, source: 'vendor onboarding defaults' });
    expect(summarizeVendorCommercialTerms([{ supplierModel: 'NET_RATE', supplierCommissionPercent: null }], { supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: 18 })).toMatchObject({ model: 'NET_RATE', commissionPercent: null, source: 'active rate-plan commercial versions' });
  });

  it('marks commission as varying when active contracts mix net-rate and commission models', () => {
    expect(summarizeVendorCommercialTerms([
      { supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: 18 },
      { supplierModel: 'NET_RATE', supplierCommissionPercent: null },
    ], { supplierModel: 'COMMISSIONABLE', supplierCommissionPercent: 18 })).toMatchObject({
      model: 'MIXED', commissionPercent: null, commissionVaries: true, commissionValues: [18],
    });
  });
});
