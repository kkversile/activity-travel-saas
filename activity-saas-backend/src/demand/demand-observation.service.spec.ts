import { DemandObservationService } from './demand-observation.service';

describe('DemandObservationService', () => {
  it('persists aggregate privacy-safe fields and never stores raw query text', async () => {
    const prisma: any = { marketplaceSearchObservation: { create: jest.fn().mockResolvedValue({ id: 'obs-1' }) } };
    await new DemandObservationService(prisma).record({ tenantId: 'agent-1' } as any, { serviceDate: '2026-10-10', destination: ' Munnar ', query: 'secret traveller name', travellers: [{ travellerType: 'ADULT', quantity: 2 }] } as any, { candidateRatePlanCount: 1, candidateSessionCount: 2, eligibleOfferCountBeforePrice: 0, resultProductCount: 0, resultOfferCount: 0, eligibilityFailureCounts: { INSUFFICIENT_INVENTORY: 1 }, soldOutSessionIds: ['session-1'], priceDiagnostics: {} });
    const data = prisma.marketplaceSearchObservation.create.mock.calls[0][0].data;
    expect(data.queryPresent).toBe(true); expect(data.queryHash).toHaveLength(64); expect(data).not.toHaveProperty('query'); expect(data.travellerSummary).toEqual({ quantities: { ADULT: 2 } });
  });

  it('treats a duplicate searchAttemptId as a successful no-op', async () => {
    const prisma: any = { marketplaceSearchObservation: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) } };
    await expect(new DemandObservationService(prisma).record({ tenantId: 'agent-1' } as any, { serviceDate: '2026-10-10', searchAttemptId: '9a7b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', travellers: [] } as any, { candidateRatePlanCount: 0, candidateSessionCount: 0, eligibleOfferCountBeforePrice: 0, resultProductCount: 0, resultOfferCount: 0, eligibilityFailureCounts: {}, soldOutSessionIds: [], priceDiagnostics: {} })).resolves.toBeUndefined();
  });
});

