import { AdminService } from './admin.service';

const maker = { sub: 'maker-1', email: 'maker@test', role: 'ADMIN', tenantId: null } as any;
const checker = { sub: 'checker-1', email: 'checker@test', role: 'ADMIN', tenantId: null } as any;
const tiers = [{ name: 'Silver', threshold: 'Up to 5L', commissionPercent: 6, creditLimit: 50000, creditDays: 7 }];

function setup() {
  const pending = { id: 'tier-change-1', key: 'admin.agent-tiers.pending', adminId: maker.sub, value: { tiers, reason: 'Updated partner agreement' }, updatedAt: new Date() };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    publicIdentifier: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
    globalSetting: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue(pending), update: jest.fn().mockResolvedValue({ value: tiers, adminId: checker.sub, updatedAt: new Date() }), delete: jest.fn().mockResolvedValue(pending) },
  };
  const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
  return { service: new AdminService(prisma, { write: jest.fn() } as any, {} as any), tx };
}

describe('Agent tier defaults maker-checker', () => {
  it('queues requested defaults without updating live settings', async () => {
    const s = setup();
    s.tx.globalSetting.findFirst.mockResolvedValue(null);
    await expect(s.service.updateAgentTiers(maker, tiers, 'Updated partner agreement')).resolves.toMatchObject({ status: 'PENDING', publicCode: 'APR-000001' });
    expect(s.tx.globalSetting.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: 'admin.agent-tiers.pending', adminId: maker.sub }) });
    expect(s.tx.globalSetting.update).not.toHaveBeenCalled();
  });

  it('applies live defaults only for an independent approver', async () => {
    const s = setup();
    s.tx.globalSetting.findFirst.mockResolvedValueOnce({ ...(({} as any)), ...{ id: 'tier-change-1', key: 'admin.agent-tiers.pending', adminId: maker.sub, value: { tiers, reason: 'Updated partner agreement' } } }).mockResolvedValueOnce({ id: 'live-tiers', value: { tiers: [] } });
    await expect(s.service.approveAgentTiers(checker, 'tier-change-1')).resolves.toMatchObject({ tiers });
    expect(s.tx.globalSetting.update).toHaveBeenCalledWith({ where: { id: 'live-tiers' }, data: { value: tiers, adminId: checker.sub } });
    expect(s.tx.globalSetting.update).toHaveBeenCalledWith({ where: { id: 'tier-change-1' }, data: expect.objectContaining({ key: 'admin.agent-tiers.change.tier-change-1', value: expect.objectContaining({ status: 'APPROVED', reviewedById: checker.sub }) }) });
  });

  it('prevents makers from approving their own defaults', async () => {
    const s = setup();
    s.tx.globalSetting.findFirst.mockResolvedValue({ id: 'tier-change-1', key: 'admin.agent-tiers.pending', adminId: maker.sub, value: { tiers, reason: 'Updated partner agreement' } });
    await expect(s.service.approveAgentTiers(maker, 'tier-change-1')).rejects.toThrow('AGENT_TIER_MAKER_CANNOT_APPROVE');
    expect(s.tx.globalSetting.update).not.toHaveBeenCalled();
  });
});
