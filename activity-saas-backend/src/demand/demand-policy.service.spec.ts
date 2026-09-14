import { DemandPolicyService } from './demand-policy.service';

describe('DemandPolicyService', () => {
  it('requires type-specific thresholds and does not activate by default', async () => {
    const prisma: any = { demandIntelligencePolicy: { aggregate: jest.fn(), create: jest.fn() } };
    const service = new DemandPolicyService(prisma, {} as any, {} as any);
    await expect(service.create({ sub: 'admin-1' } as any, { name: 'bad', measurementWindowDays: 30, futureHorizonDays: 7, cooldownDays: 2, rules: [{ type: 'PRICE_GAP', defaultPriority: 'HIGH' }] } as any)).rejects.toThrow('MINSEARCHCOUNT_REQUIRED');
    expect(prisma.demandIntelligencePolicy.create).not.toHaveBeenCalled();
  });

  it('rejects a blank trimmed name on policy update', async () => {
    const prisma: any = { demandIntelligencePolicy: { findUnique: jest.fn() } };
    const service = new DemandPolicyService(prisma, {} as any, {} as any);
    await expect(service.update({ sub: 'admin-1' } as any, 'policy-1', { name: '   ', expectedLockVersion: 1, measurementWindowDays: 30, futureHorizonDays: 7, cooldownDays: 2, rules: [{ type: 'HIGH_CANCELLATIONS', defaultPriority: 'HIGH', minConfirmedBookingCount: 1, minCancellationRate: 0.2 }] } as any)).rejects.toThrow('DEMAND_POLICY_NAME_REQUIRED');
    expect(prisma.demandIntelligencePolicy.findUnique).not.toHaveBeenCalled();
  });

  it('does not emit a second retirement audit when the conditional transition loses a race', async () => {
    const tx: any = { demandIntelligencePolicy: { findUnique: jest.fn().mockResolvedValue({ id: 'policy-1', status: 'ACTIVE' }), updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit: any = { write: jest.fn() }; const service = new DemandPolicyService(prisma, audit, {} as any);
    await expect(service.retire({ sub: 'admin-1' } as any, 'policy-1')).rejects.toThrow('DEMAND_POLICY_NOT_ACTIVE');
    expect(audit.write).not.toHaveBeenCalled();
  });
});
