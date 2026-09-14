import { MarketplaceService } from '../marketplace/marketplace.service';
import { MarketplaceRankingService } from '../marketplace/marketplace-ranking.service';

describe('Marketplace demand instrumentation', () => {
  it('rejects a price range without an explicit currency', () => {
    const service = new MarketplaceService({} as any, {} as any, new MarketplaceRankingService());
    expect(() => (service as any).validatePriceCurrency({ priceMax: 1000 })).toThrow('MARKETPLACE_PRICE_CURRENCY_REQUIRED');
  });

  it('does not evaluate a USD offer as INR when an INR ceiling is requested', async () => {
    const plan: any = { id: 'rp-usd', ratePlanCode: 'USD', name: 'USD offer', variant: { id: 'v1', variantCode: 'V1', name: 'Variant', description: '', durationMinutes: 60, privateShared: 'SHARED', pickupIncluded: false, dropoffIncluded: false, mealIncluded: false, menu: [], pointsOfInterest: [], inclusions: [], exclusions: [], suitableFor: [], product: { id: 'p1', productCode: 'P1', status: 'LIVE', currentRevision: { id: 'rev1', status: 'PUBLISHED', productName: 'USD activity', shortDescription: '', type: 'ACTIVITY', subType: 'TREK', subCategory: 'OUTDOOR', cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', starRating: 4, media: [] } } }, travellerRules: [], scheduleMappings: [{ active: true, scheduleTemplateId: 'sch1', scheduleTemplate: { id: 'sch1', timezone: 'UTC', sessions: [{ id: 'session1', serviceDate: new Date('2026-10-10'), localStartTime: '09:00', localEndTime: '10:00', startsAt: new Date('2026-10-10T09:00:00Z'), status: 'OPEN', archivedAt: null }] } }] };
    const prisma: any = { tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'agent-1', kind: 'TRAVEL_AGENT', agentProfile: { verificationStatus: 'APPROVED' } }) }, ratePlan: { findMany: jest.fn().mockResolvedValue([plan]) } };
    const eligibility: any = { evaluate: jest.fn().mockResolvedValue({ eligible: true, bookingMode: 'INSTANT', commercial: { currency: 'USD', finalAmount: '100' }, inventory: {}, evaluatedAt: new Date().toISOString() }) };
    const service = new MarketplaceService(prisma, eligibility, new MarketplaceRankingService());
    const response = await service.search({ role: 'TRAVEL_AGENT', tenantId: 'agent-1' } as any, { serviceDate: '2026-10-10', travellers: [{ travellerType: 'ADULT', quantity: 1 }], currency: 'INR', priceMax: 1000 } as any);
    expect(response.count).toBe(0); expect(eligibility.evaluate).toHaveBeenCalledTimes(1);
  });
});
