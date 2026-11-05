import { MarketplaceService } from './marketplace.service';
import { MarketplaceRankingService } from './marketplace-ranking.service';
import { MarketplaceSearchDto } from '../eligibility/eligibility.dto';
import { validate } from 'class-validator';

const user: any = { sub: 'u1', role: 'TRAVEL_AGENT', tenantId: 'agent1' };
function plan(sessionIds = ['ss1'], rules: any[] = [{ type: 'ADULT', minCount: 1, maxCount: 10 }]) {
  return { id: 'rp1', ratePlanCode: 'RP1', name: 'Public offer', status: 'ACTIVE', variant: { id: 'v1', variantCode: 'V1', name: 'Shared', description: 'Guided activity', durationMinutes: 120, privateShared: 'SHARED', pickupIncluded: true, pickupType: 'CITY', pickupInput: 'Munnar', pickupTimings: '08:00', dropoffIncluded: true, dropoffTimings: '10:00', mealIncluded: false, menu: [], pointsOfInterest: [], inclusions: ['Guide'], exclusions: ['Insurance'], suitableFor: ['ADULT'], status: 'ACTIVE', archivedAt: null, product: { id: 'p1', productCode: 'P1', status: 'LIVE', currentRevision: { id: 'rev1', status: 'PUBLISHED', productName: 'Munnar walk', shortDescription: 'A guided walk', type: 'ACTIVITY', subType: 'TREK', subCategory: 'OUTDOOR', cityName: 'Munnar', stateName: 'Kerala', countryName: 'India', starRating: 4.5, media: [] } } }, travellerRules: rules, scheduleMappings: [{ active: true, scheduleTemplateId: 's1', scheduleTemplate: { id: 's1', timezone: 'Asia/Kolkata', sessions: sessionIds.map((id) => ({ id, serviceDate: new Date('2026-10-10'), localStartTime: '08:00', localEndTime: '10:00', startsAt: new Date('2026-10-10T02:30:00Z'), status: 'OPEN', archivedAt: null })) } }] };
}

function make(plans: any[] = [plan()]) {
  const prisma: any = { tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'agent1', kind: 'TRAVEL_AGENT', agentProfile: { verificationStatus: 'APPROVED' } }) }, ratePlan: { findMany: jest.fn().mockResolvedValue(plans), findFirst: jest.fn() }, product: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', tenantId: 'vendor1', productCode: 'P1', status: 'LIVE', currentRevision: plans[0].variant.product.currentRevision }) }, productViewEvent: { create: jest.fn().mockResolvedValue({ id: 'view-1' }) }, booking: { groupBy: jest.fn().mockResolvedValue([]) } };
  const eligibility: any = { evaluate: jest.fn().mockResolvedValue({ eligible: true, bookingMode: 'INSTANT', commercial: { currency: 'INR', finalAmount: '100.00', tax: { mode: 'NONE', amount: '0.00' }, promotion: { amount: '0.00', funder: null } }, inventory: { availableCapacity: 5 }, evaluatedAt: new Date().toISOString() }) };
  return { service: new MarketplaceService(prisma, eligibility, new MarketplaceRankingService()), prisma, eligibility };
}

describe('MarketplaceService Phase 5.1', () => {
  const dto: any = { serviceDate: '2026-10-10', destination: 'Munnar', travellers: [{ travellerType: 'ADULT', quantity: 2 }] };
  it('uses the authenticated agent tenant and never accepts a browser tenant id', async () => { const f = make(); await f.service.search({ ...user, tenantId: 'agent1' }, dto); expect(f.prisma.tenant.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'agent1' } })); expect(f.eligibility.evaluate).toHaveBeenCalledWith(expect.objectContaining({ agentTenantId: 'agent1' })); });
  it('filters unrelated query text before ranking', async () => { const f = make(); const result = await f.service.search(user, { ...dto, query: 'no-such-marketplace-term-xyz' }); expect(result.count).toBe(0); expect(result.products).toHaveLength(0); expect(f.eligibility.evaluate).not.toHaveBeenCalled(); });
  it('keeps only eligible offers and applies agent-facing filters', async () => { const f = make([plan(['ss1', 'ss2'], [{ type: 'ADULT', minCount: 1, maxCount: 10 }, { type: 'CHILD', minCount: 0, maxCount: 4 }])]); f.eligibility.evaluate.mockResolvedValueOnce({ eligible: true, bookingMode: 'INSTANT', commercial: { currency: 'INR', finalAmount: '100.00', tax: null, promotion: null }, inventory: {}, evaluatedAt: '' }).mockResolvedValueOnce({ eligible: false }); const result = await f.service.search(user, { ...dto, priceMin: 50, priceMax: 150, currency: 'INR', bookingMode: 'INSTANT', minRating: 4, durationMin: 60, durationMax: 180, privateShared: 'SHARED', pickupIncluded: true, childSuitable: true }); expect(result.count).toBe(1); expect(result.products[0].variants[0].offers).toHaveLength(1); expect(result.products[0].variants[0].offers[0].price.finalAmount).toBe('100.00'); });
  it('uses a product-specific candidate query, persists successful views, and returns safe variant content', async () => { const f = make(); const result = await f.service.productView(user, 'p1', { serviceDate: '2026-10-10', travellers: [{ travellerType: 'ADULT', quantity: 2 }], units: 2 }); expect(f.prisma.ratePlan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ variant: expect.objectContaining({ product: expect.objectContaining({ id: 'p1' }) }) }) })); expect(f.eligibility.evaluate).toHaveBeenCalledWith(expect.objectContaining({ units: 2 })); expect(f.prisma.productViewEvent.create).toHaveBeenCalledWith({ data: { productId: 'p1', vendorTenantId: 'vendor1', viewerTenantId: 'agent1' } }); expect(result.variants[0]).toMatchObject({ inclusions: ['Guide'], exclusions: ['Insurance'], pickupInput: 'Munnar' }); expect(result).not.toHaveProperty('supplierNet'); expect(result).not.toHaveProperty('sourcePayload'); });
  it('does not record product views when there is no eligible offer', async () => { const f = make(); f.eligibility.evaluate.mockResolvedValue({ eligible: false }); await expect(f.service.productView(user, 'p1', { serviceDate: '2026-10-10', travellers: [{ travellerType: 'ADULT', quantity: 2 }] })).rejects.toMatchObject({ status: 404 }); expect(f.prisma.productViewEvent.create).not.toHaveBeenCalled(); });
  it('treats category and subtype as different filters and applies subtype to the current revision', async () => { const trek = plan(); const boat = plan(); boat.id = 'rp2'; boat.ratePlanCode = 'RP2'; boat.variant = { ...boat.variant, product: { ...boat.variant.product, id: 'p2', productCode: 'P2', currentRevision: { ...boat.variant.product.currentRevision, id: 'rev2', productName: 'Munnar boat', subType: 'BOAT' } } }; const f = make([trek, boat]); const result = await f.service.search(user, { ...dto, category: 'ACTIVITY', subType: 'TREK' }); expect(result.count).toBe(1); expect(result.products[0].name).toBe('Munnar walk'); });
  it('excludes an offer when EligibilityService reports a missing cutoff reference', async () => { const f = make(); f.eligibility.evaluate.mockResolvedValue({ eligible: false, gates: [{ gate: 'CUTOFF', status: 'FAIL', code: 'CUTOFF_REFERENCE_MISSING' }] }); const result = await f.service.search(user, dto); expect(result.count).toBe(0); expect(result.products).toHaveLength(0); });
  it('evaluates every candidate across deterministic pages before applying the product result limit', async () => { const candidates = Array.from({ length: 351 }, (_, index) => { const item = plan(); item.id = `rp${String(index + 1).padStart(3, '0')}`; item.ratePlanCode = item.id; return item; }); const f = make(candidates.slice(0, 1)); f.prisma.ratePlan.findMany.mockReset().mockResolvedValueOnce(candidates.slice(0, 100)).mockResolvedValueOnce(candidates.slice(100, 200)).mockResolvedValueOnce(candidates.slice(200, 300)).mockResolvedValueOnce(candidates.slice(300)); f.eligibility.evaluate.mockImplementation(async (input: any) => ({ eligible: input.ratePlanId === 'rp351', bookingMode: 'INSTANT', commercial: { currency: 'INR', finalAmount: '100.00', tax: null, promotion: null }, inventory: { availableCapacity: 5 }, evaluatedAt: '' })); const result = await f.service.search(user, { ...dto, limit: 1 }); expect(f.prisma.ratePlan.findMany).toHaveBeenCalledTimes(4); expect(f.eligibility.evaluate).toHaveBeenCalledTimes(351); expect(f.prisma.product.findFirst).not.toHaveBeenCalled(); expect(result.count).toBe(1); expect(result.products).toHaveLength(1); });
  it('rejects inverted duration and price ranges', async () => { const f = make(); await expect(f.service.search(user, { ...dto, durationMin: 180, durationMax: 60 })).rejects.toMatchObject({ status: 400 }); await expect(f.service.search(user, { ...dto, priceMin: 200, priceMax: 100 })).rejects.toMatchObject({ status: 400 }); });
  it('requires a UUID v4 searchAttemptId at the API validation boundary', async () => { const request = Object.assign(new MarketplaceSearchDto(), { serviceDate: '2026-10-10', travellers: [{ travellerType: 'ADULT', quantity: 1 }] }); const errors = await validate(request); expect(errors.some((error) => error.property === 'searchAttemptId')).toBe(true); });
  it('returns the selected offer with persisted failover and allocation context', async () => {
    const f = make();
    const collapse = (f.service as any).collapseLinkedOffers.bind(f.service);
    const items = ['p1', 'p2'].map((productId, index) => ({
      product: { id: productId, experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [] }, starRating: 4 }, _supplierId: productId,
      offer: { ratePlanId: `rp${index + 1}`, sessionId: `s${index + 1}`, price: { finalAmount: String(100 + index * 20) }, bookingMode: 'INSTANT', availability: { availableCapacity: 5 } },
      _commissionScore: 10,
      _ranking: { score: 1 },
    }));
    const result = await collapse(items, { id: 'rules-1', scope: 'VOYA_AGENT', status: 'LIVE', allocation: 'SPLIT_70_30', autoFailover: true, absorbPriceGap: '100', lockMinutes: 15 });
    expect(result).toHaveLength(1);
    expect(result[0].selection).toMatchObject({ experienceMasterId: 'master-1', ruleSetId: 'rules-1', allocation: 'SPLIT_70_30', autoFailover: true, absorbPriceGap: '100' });
    expect(result[0].selection.fallbackOffers).toEqual([{ productId: 'p2', ratePlanId: 'rp2', sessionId: 's2' }]);
  });

  it('chooses the least-allocated eligible supplier for ROUND_ROBIN', async () => {
    const f = make(); f.prisma.booking.groupBy.mockResolvedValue([{ vendorTenantId: 'supplier-a', _count: { _all: 4 } }, { vendorTenantId: 'supplier-b', _count: { _all: 3 } }]);
    const items = ['supplier-a', 'supplier-b'].map((supplierId, index) => ({ product: { id: `p${index + 1}`, experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [] } }, _supplierId: supplierId, offer: { ratePlanId: `rp${index + 1}`, sessionId: `s${index + 1}`, price: { finalAmount: String(100 + index) } }, _ranking: { score: 1 } }));
    const result = await (f.service as any).collapseLinkedOffers(items, { status: 'LIVE', allocation: 'ROUND_ROBIN' });
    expect(result[0].product.id).toBe('p2');
    expect(f.prisma.booking.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['vendorTenantId'], where: expect.objectContaining({ productId: { in: ['p1', 'p2'] } }) }));
  });

  it('sends three of each ten SPLIT_70_30 allocations to the next-ranked supplier', async () => {
    const f = make(); f.prisma.booking.groupBy.mockResolvedValue([{ vendorTenantId: 'supplier-a', _count: { _all: 6 } }, { vendorTenantId: 'supplier-b', _count: { _all: 1 } }]);
    const items = ['supplier-a', 'supplier-b'].map((supplierId, index) => ({ product: { id: `p${index + 1}`, experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [] } }, _supplierId: supplierId, offer: { ratePlanId: `rp${index + 1}`, sessionId: `s${index + 1}`, price: { finalAmount: String(100 + index) } }, _ranking: { score: 1 } }));
    const result = await (f.service as any).collapseLinkedOffers(items, { status: 'LIVE', allocation: 'SPLIT_70_30' });
    expect(result[0].product.id).toBe('p2');
  });

  it('keeps the highest-scoring supplier when the gap exceeds the five-point allocation window', async () => {
    const f = make();
    const items = ['supplier-a', 'supplier-b'].map((supplierId, index) => ({
      product: { id: `p${index + 1}`, experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [] } },
      _supplierId: supplierId,
      _commissionScore: 0,
      offer: { ratePlanId: `rp${index + 1}`, sessionId: `s${index + 1}`, price: { finalAmount: String(index === 0 ? 100 : 125) }, availability: { availableCapacity: 5 } },
      _ranking: { score: 1 },
    }));
    const result = await (f.service as any).collapseLinkedOffers(items, {
      status: 'LIVE', objective: 'LOWEST_PRICE', priceWeight: 100, ratingWeight: 0,
      reliabilityWeight: 0, inventoryWeight: 0, contractWeight: 0, allocation: 'ROUND_ROBIN',
    });
    expect(result[0].product.id).toBe('p1');
    expect(f.prisma.booking.groupBy).not.toHaveBeenCalled();
  });

  it('honors an active eligible supplier pin ahead of automated allocation', async () => {
    const f = make();
    const items = ['supplier-a', 'supplier-b'].map((supplierId, index) => ({
      product: { id: `p${index + 1}`, experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [{ productId: 'p2', pinnedById: 'admin-1', pinnedUntil: null }] } },
      _supplierId: supplierId,
      offer: { ratePlanId: `rp${index + 1}`, sessionId: `s${index + 1}`, price: { finalAmount: String(100 + index * 20) }, availability: { availableCapacity: 5 } },
      _ranking: { score: 1 },
    }));
    const result = await (f.service as any).collapseLinkedOffers(items, { status: 'LIVE', allocation: 'ROUND_ROBIN' });
    expect(result[0].product.id).toBe('p2');
    expect(result[0].selection.pin).toMatchObject({ productId: 'p2', applied: true });
    expect(f.prisma.booking.groupBy).not.toHaveBeenCalled();
  });

  it('keeps a still-eligible search selection stable even if a pin or allocation changes', async () => {
    const f = make();
    const items = ['supplier-a', 'supplier-b'].map((supplierId, index) => ({
      product: { id: `p${index + 1}`, experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [{ productId: 'p1', pinnedById: 'admin-1', pinnedUntil: null }] } },
      _supplierId: supplierId,
      offer: { ratePlanId: `rp${index + 1}`, sessionId: `s${index + 1}`, price: { finalAmount: String(100 + index * 20) }, availability: { availableCapacity: 5 } },
      _ranking: { score: 1 },
    }));
    const locks = new Map([['master-1', { productId: 'p2', ratePlanId: 'rp2', sessionId: 's2' }]]);
    const result = await (f.service as any).collapseLinkedOffers(items, { status: 'LIVE', allocation: 'ROUND_ROBIN' }, locks);
    expect(result[0].product.id).toBe('p2');
    expect(result[0].selection.searchSelectionLocked).toBe(true);
    expect(f.prisma.booking.groupBy).not.toHaveBeenCalled();
  });

  it('falls back to eligible offers when a pinned supplier is unavailable', async () => {
    const f = make();
    const items = [{
      product: { id: 'p1', experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [{ productId: 'p2', pinnedById: 'admin-1', pinnedUntil: null }] } },
      _supplierId: 'supplier-a', offer: { ratePlanId: 'rp1', sessionId: 's1', price: { finalAmount: '100' } }, _ranking: { score: 1 },
    }];
    const result = await (f.service as any).collapseLinkedOffers(items, { status: 'LIVE', allocation: 'WINNER_TAKES_ALL' });
    expect(result[0].product.id).toBe('p1');
    expect(result[0].selection.pin).toMatchObject({ productId: 'p2', applied: false });
  });

  it('keeps the selected winner and fallback metadata in the marketplace search response', async () => {
    const f = make();
    f.prisma.experienceSelectionRuleSet = { findFirst: jest.fn().mockResolvedValue({ id: 'rules-1', scope: 'VOYA_AGENT', status: 'LIVE', allocation: 'ROUND_ROBIN', autoFailover: true, absorbPriceGap: '100', lockMinutes: 15, objective: 'MARGIN', priceWeight: 40, ratingWeight: 20, reliabilityWeight: 20, inventoryWeight: 10, contractWeight: 10 }) };
    const first: any = plan();
    const second: any = plan();
    second.id = 'rp2';
    second.variant = { ...second.variant, product: { ...second.variant.product, id: 'p2', experienceMaster: { id: 'master-1', displayMode: 'SINGLE_OFFER', selectionPolicy: 'CHEAPEST', placements: [] } } };
    first.variant.product.experienceMaster = { id: 'master-1', displayMode: 'SINGLE_OFFER', selectionPolicy: 'CHEAPEST', placements: [] };
    f.prisma.ratePlan.findMany.mockResolvedValue([first, second]);
    const result = await f.service.search(user, { ...dto, searchAttemptId: '11111111-1111-4111-8111-111111111111' });
    expect(result.products[0].variants[0].offers[0].selection).toMatchObject({ experienceMasterId: 'master-1', allocation: 'ROUND_ROBIN', autoFailover: true });
  });

  it('applies sampled rating, reliability, and supplier API connection weights in live supplier selection', async () => {
    const f = make();
    f.prisma.supplierQualitySnapshot = { findFirst: jest.fn(({ where }: any) => Promise.resolve({
      vendorTenantId: where.vendorTenantId,
      metricSnapshots: where.vendorTenantId === 'supplier-a'
        ? [{ metricCode: 'CUSTOMER_RATING', rawValue: 5, sampleSize: 20, status: 'PASS' }, { metricCode: 'CONFIRMATION_WITHIN_SLA_RATE', rawValue: 100, sampleSize: 20, status: 'PASS' }]
        : [{ metricCode: 'CUSTOMER_RATING', rawValue: 3.5, sampleSize: 20, status: 'WARN' }, { metricCode: 'CONFIRMATION_WITHIN_SLA_RATE', rawValue: 80, sampleSize: 20, status: 'WARN' }],
    })) };
    const items = ['supplier-a', 'supplier-b'].map((supplierId, index) => ({
      product: { id: `p${index + 1}`, experienceMaster: { id: 'master-1', selectionPolicy: 'CHEAPEST', displayMode: 'SINGLE_OFFER', placements: [] } },
      _supplierId: supplierId,
      _connectionType: supplierId === 'supplier-a' ? 'SUPPLIER_API' : 'NONE',
      offer: { ratePlanId: `rp${index + 1}`, sessionId: `s${index + 1}`, price: { finalAmount: String(100 + index) } },
      _ranking: { score: 1 },
    }));
    const result = await (f.service as any).collapseLinkedOffers(items, {
      status: 'LIVE', objective: 'MARGIN', priceWeight: 0, ratingWeight: 40,
      reliabilityWeight: 30, inventoryWeight: 30, contractWeight: 0,
    });
    expect(result[0].product.id).toBe('p1');
    expect(f.prisma.supplierQualitySnapshot.findFirst).toHaveBeenCalledTimes(2);
  });
});
