import { DemandAnalysisService } from './demand-analysis.service';

const futureDate = (days: number) => new Date(Date.now() + days * 86400000);
const row = (destination: string, days = 2, extra: any = {}) => ({ agentTenantId: 'agent-1', destinationNormalized: destination, category: 'activity', subType: 'trek', serviceDate: futureDate(days), durationMin: null, durationMax: null, currency: null, resultProductCount: 0, resultOfferCount: 0, zeroResult: true, soldOutSessionIds: [], priceDiagnostics: {}, eligibilityFailureCounts: {}, candidateRatePlanCount: 0, candidateSessionCount: 0, ...extra });
const policy = (rules: any[], futureHorizonDays = 60) => ({ id: 'policy-1', versionNumber: 1, measurementWindowDays: 30, futureHorizonDays, cooldownDays: 2, rules });
const serviceWith = (rows: any[], bookings: any[] = []) => new DemandAnalysisService({ marketplaceSearchObservation: { findMany: jest.fn().mockResolvedValue(rows) }, booking: { findMany: jest.fn().mockResolvedValue(bookings) } } as any, {} as any, {} as any, {} as any);

describe('DemandAnalysisService', () => {
  it('generates high-demand supply from a non-currency-fragmented scope', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => row('munnar', 2, { agentTenantId: `agent-${index % 4}`, resultProductCount: 1, resultOfferCount: 1, zeroResult: false, candidateRatePlanCount: 1, candidateSessionCount: 1, currency: index % 2 ? 'USD' : 'INR' }));
    const result = await serviceWith(rows).candidates(policy([{ type: 'HIGH_DEMAND_LOW_SUPPLY', enabled: true, defaultPriority: 'HIGH', minSearchCount: 10, minUniqueAgentCount: 3, maxAverageResultProducts: 2 }]));
    expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'HIGH_DEMAND_LOW_SUPPLY', metrics: expect.objectContaining({ searchCount: 12, uniqueAgentCount: 4 }) })]));
  });

  it('uses the future horizon for search signals but keeps out-of-horizon observations stored', async () => {
    const rows = [row('included', 30, { resultProductCount: 1, resultOfferCount: 1, zeroResult: false, candidateRatePlanCount: 1, candidateSessionCount: 1 }), row('excluded', 120, { resultProductCount: 1, resultOfferCount: 1, zeroResult: false, candidateRatePlanCount: 1, candidateSessionCount: 1 })];
    const result = await serviceWith(rows).candidates(policy([{ type: 'HIGH_DEMAND_LOW_SUPPLY', enabled: true, defaultPriority: 'HIGH', minSearchCount: 1, minUniqueAgentCount: 1, maxAverageResultProducts: 2 }], 60));
    expect(result.observationCount).toBe(2); expect(result.horizonObservationCount).toBe(1); expect(result.candidates.map((item) => item.destinationNormalized)).toEqual(['included']);
  });

  it('uses price-ceiling searches as the PRICE_GAP denominator and never mixes currencies', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => row('munnar', 2, index < 5 ? { currency: 'INR', priceMax: 1000, priceDiagnostics: { priceCeilingMiss: true, byCurrency: { INR: { minimum: 1200, median: 1400 } } }, resultProductCount: 1, resultOfferCount: 1, zeroResult: false, candidateRatePlanCount: 1, candidateSessionCount: 1 } : { resultProductCount: 1, resultOfferCount: 1, zeroResult: false, candidateRatePlanCount: 1, candidateSessionCount: 1 }));
    const result = await serviceWith(rows).candidates(policy([{ type: 'PRICE_GAP', enabled: true, defaultPriority: 'MEDIUM', minSearchCount: 5, minPriceCeilingMissCount: 5, minPriceCeilingMissRate: 1 }]));
    expect(result.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'PRICE_GAP', currency: 'INR', metrics: expect.objectContaining({ searchCount: 100, priceCeilingSearchCount: 5, priceCeilingMissCount: 5, priceCeilingMissRate: 1, averageRequestedCeiling: 1000, minimumAvailablePrice: 1200 }) })]));
  });

  it('classifies only no-candidate and no-dated supply as COVERAGE_GAP', async () => {
    const rows = [row('no-candidate', 2, { candidateRatePlanCount: 0, candidateSessionCount: 0 }), row('no-dated', 2, { candidateRatePlanCount: 1, candidateSessionCount: 0 }), row('sold-out', 2, { candidateRatePlanCount: 1, candidateSessionCount: 1, soldOutSessionIds: ['session-1'], eligibilityFailureCounts: { INSUFFICIENT_INVENTORY: 1 } }), row('cutoff', 2, { candidateRatePlanCount: 1, candidateSessionCount: 1, eligibilityFailureCounts: { CUTOFF_PASSED: 1 } })];
    const result = await serviceWith(rows).candidates(policy([{ type: 'COVERAGE_GAP', enabled: true, defaultPriority: 'MEDIUM', minSearchCount: 1, minUniqueAgentCount: 1, minZeroResultRate: 1 }]));
    expect(result.candidates.filter((item) => item.type === 'COVERAGE_GAP').map((item) => item.destinationNormalized).sort()).toEqual(['no-candidate', 'no-dated']);
  });

  it('enforces coverageGapRate against the configured zero-result threshold', async () => {
    const rows = [row('coverage', 2, { candidateRatePlanCount: 0, candidateSessionCount: 0 }), ...Array.from({ length: 9 }, () => row('coverage', 2, { zeroResult: false, candidateRatePlanCount: 1, candidateSessionCount: 1, resultProductCount: 1, resultOfferCount: 1 }))];
    const rule = { type: 'COVERAGE_GAP', enabled: true, defaultPriority: 'MEDIUM', minSearchCount: 1, minUniqueAgentCount: 1, minZeroResultRate: 0.5 };
    const service = serviceWith(rows); const below = await service.candidates(policy([rule]));
    expect(below.candidates).toHaveLength(0); expect((await service.candidates(policy([rule], 60))).candidates).toHaveLength(0);
    const above = await serviceWith([row('coverage', 2, { candidateRatePlanCount: 0, candidateSessionCount: 0 }), ...Array.from({ length: 5 }, () => row('coverage', 2, { candidateRatePlanCount: 0, candidateSessionCount: 0 })), ...Array.from({ length: 4 }, () => row('coverage', 2, { zeroResult: false, candidateRatePlanCount: 1, candidateSessionCount: 1, resultProductCount: 1, resultOfferCount: 1 }))]).candidates(policy([rule]));
    expect(above.candidates[0]).toEqual(expect.objectContaining({ type: 'COVERAGE_GAP', metrics: expect.objectContaining({ coverageGapCount: 6, coverageGapRate: 0.6 }) }));
  });

  it('keeps rolling cancellation identity stable while assessment windows move', async () => {
    const bookings = Array.from({ length: 2 }, (_, index) => ({ recordType: 'CANONICAL', confirmedAt: new Date('2026-09-10T00:00:00Z'), serviceDate: new Date('2026-09-15T00:00:00Z'), status: index ? 'CANCELLED' : 'COMPLETED', cancellation: index ? { initiator: 'VENDOR' } : null, operationalSnapshot: { productSnapshot: { destination: { city: 'munnar' }, type: 'ACTIVITY', subType: 'TREK' } } }));
    const service = serviceWith([], bookings); const rule = { type: 'HIGH_CANCELLATIONS', enabled: true, defaultPriority: 'HIGH', minConfirmedBookingCount: 2, minCancellationRate: 0.5 };
    const first = await service.candidates(policy([rule]), { windowStart: '2026-09-01T00:00:00Z', windowEnd: '2026-09-30T00:00:00Z' }); const second = await service.candidates(policy([rule]), { windowStart: '2026-09-02T00:00:00Z', windowEnd: '2026-10-01T00:00:00Z' });
    expect(first.candidates[0].opportunityKey).toBe(second.candidates[0].opportunityKey); expect(first.candidates[0].serviceDateFrom).toBeNull(); expect(second.candidates[0].serviceDateTo).toBeNull();
  });

  it('uses confirmed canonical bookings with confirmedAt for cancellation denominator', async () => {
    const bookings = Array.from({ length: 10 }, (_, index) => ({ recordType: 'CANONICAL', confirmedAt: futureDate(-2), serviceDate: futureDate(-1), status: index < 2 ? 'CANCELLED' : 'COMPLETED', cancellation: index < 2 ? { initiator: 'VENDOR' } : null, operationalSnapshot: { productSnapshot: { destination: { city: 'munnar' }, type: 'ACTIVITY', subType: 'TREK' } } }));
    const service = serviceWith([], bookings); const result = await service.candidates(policy([{ type: 'HIGH_CANCELLATIONS', enabled: true, defaultPriority: 'HIGH', minConfirmedBookingCount: 10, minCancellationRate: 0.2 }]));
    expect(result.candidates).toEqual([expect.objectContaining({ type: 'HIGH_CANCELLATIONS', metrics: expect.objectContaining({ confirmedBookingCount: 10, cancellationCount: 2, cancellationRate: 0.2 }) })]);
    expect((service as any).prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ recordType: 'CANONICAL', confirmedAt: { not: null } }) }));
  });
});
