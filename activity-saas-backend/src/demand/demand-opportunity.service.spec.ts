import { DemandOpportunityService } from './demand-opportunity.service';

describe('DemandOpportunityService', () => {
  it('enforces expected version and records lifecycle events transactionally', async () => {
    const current = { id: 'opp-1', status: 'OPEN', version: 4 };
    const tx: any = { demandOpportunity: { findUnique: jest.fn().mockResolvedValue(current), update: jest.fn().mockResolvedValue({ ...current, status: 'ACKNOWLEDGED', version: 5 }) }, demandOpportunityEvent: { create: jest.fn() } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new DemandOpportunityService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    await service.acknowledge({ sub: 'admin-1' } as any, 'opp-1', { expectedVersion: 4, reason: 'Reviewed' });
    expect(tx.demandOpportunity.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'opp-1', version: 4 }, data: expect.objectContaining({ status: 'ACKNOWLEDGED' }) }));
    expect(tx.demandOpportunityEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'ACKNOWLEDGED' }) }));
  });

  it('revokes vendor detail access for a removed target and separates active/history projections', async () => {
    const prisma: any = { demandOpportunityVendorTarget: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) } };
    const service = new DemandOpportunityService(prisma, {} as any, {} as any, {} as any); const vendor = { sub: 'vendor-user', tenantId: 'vendor-1' } as any;
    await expect(service.vendorDetail(vendor, 'opp-1')).rejects.toMatchObject({ status: 403 });
    await service.vendorList(vendor, {}); expect(prisma.demandOpportunityVendorTarget.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { vendorTenantId: 'vendor-1', status: { in: ['TARGETED', 'VIEWED'] } } }));
    await service.vendorList(vendor, { history: true }); expect(prisma.demandOpportunityVendorTarget.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { vendorTenantId: 'vendor-1', status: { in: ['INTERESTED', 'DECLINED', 'ACTION_TAKEN'] } } }));
  });

  it('retargets a removed row with a new target cycle and clears prior response data', async () => {
    const tx: any = { tenant: { findUnique: jest.fn().mockResolvedValue({ kind: 'VENDOR', vendorProfile: { verificationStatus: 'VERIFIED' } }) }, demandOpportunity: { findUnique: jest.fn().mockResolvedValue({ id: 'opp-1', status: 'OPEN' }) }, demandOpportunityVendorTarget: { findUnique: jest.fn().mockResolvedValue({ id: 'target-1', status: 'REMOVED', version: 3 }), update: jest.fn().mockResolvedValue({ id: 'target-1', status: 'TARGETED', version: 4 }), create: jest.fn() }, demandOpportunityEvent: { create: jest.fn() } };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) }; const service = new DemandOpportunityService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    await service.target({ sub: 'admin-2' } as any, 'opp-1', { vendorTenantId: 'vendor-1' });
    expect(tx.demandOpportunityVendorTarget.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetedById: 'admin-2', viewedAt: null, respondedById: null, respondedAt: null, responseNote: null, removedAt: null, removedById: null, removalReason: null, version: { increment: 1 } }) }));
  });
});
