import { AgentCommercialChangeStatus, UserRole } from '@prisma/client';
import { AdminService } from './admin.service';

const maker = { sub: 'admin-maker', email: 'maker@test', role: UserRole.ADMIN, tenantId: null } as any;
const checker = { sub: 'admin-checker', email: 'checker@test', role: UserRole.ADMIN, tenantId: null } as any;

function setup() {
  const request = { id: 'commercial-request-1', tenantId: 'agent-1', proposedConfiguration: { commissionPercent: 12 }, requestReason: 'Agreed annual rate', status: AgentCommercialChangeStatus.PENDING, createdById: maker.sub, tenant: { id: 'agent-1', kind: 'TRAVEL_AGENT', name: 'Demo Agent' } };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    publicIdentifier: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
    agentCommercialChangeRequest: { create: jest.fn().mockResolvedValue(request), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(request), update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...request, ...data })) },
    agentCommercialProfile: { findUnique: jest.fn().mockResolvedValue({ tenantId: 'agent-1', commissionPercent: '5.00' }), upsert: jest.fn().mockResolvedValue({ tenantId: 'agent-1', commissionPercent: '12.00' }) },
  };
  const prisma: any = { tenant: { findFirst: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Demo Agent' }) }, $transaction: jest.fn((callback: any) => callback(tx)) };
  const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
  return { service: new AdminService(prisma, audit, {} as any), prisma, tx, audit };
}

describe('Admin agent commercial maker-checker', () => {
  it('queues a proposal without changing currently effective terms', async () => {
    const s = setup();
    await expect(s.service.updateAgentCommercials(maker, 'agent-1', { commissionPercent: 12, reason: 'Agreed annual rate' })).resolves.toMatchObject({ status: AgentCommercialChangeStatus.PENDING, publicCode: 'APR-000001' });
    expect(s.tx.agentCommercialChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'agent-1', proposedConfiguration: { commissionPercent: 12 }, createdById: maker.sub }) });
    expect(s.tx.agentCommercialProfile.upsert).not.toHaveBeenCalled();
  });

  it('prevents the maker from approving their own commercial proposal', async () => {
    const s = setup();
    await expect(s.service.approveAgentCommercialChange(maker, 'commercial-request-1')).rejects.toThrow('AGENT_COMMERCIAL_MAKER_CANNOT_APPROVE');
    expect(s.tx.agentCommercialProfile.upsert).not.toHaveBeenCalled();
  });

  it('applies the proposal only after a different Admin approves it', async () => {
    const s = setup();
    await expect(s.service.approveAgentCommercialChange(checker, 'commercial-request-1')).resolves.toMatchObject({ status: AgentCommercialChangeStatus.APPROVED, profile: { commissionPercent: '12.00' } });
    expect(s.tx.agentCommercialProfile.upsert).toHaveBeenCalledWith({ where: { tenantId: 'agent-1' }, update: { commissionPercent: 12 }, create: { tenantId: 'agent-1', commissionPercent: 12 } });
    expect(s.tx.agentCommercialChangeRequest.update).toHaveBeenCalledWith({ where: { id: 'commercial-request-1' }, data: expect.objectContaining({ status: AgentCommercialChangeStatus.APPROVED, reviewedById: checker.sub }) });
  });

  it('requires a reason and an independent reviewer to reject', async () => {
    const s = setup();
    await expect(s.service.rejectAgentCommercialChange(checker, 'commercial-request-1', ' ')).rejects.toThrow('A rejection reason');
    await expect(s.service.rejectAgentCommercialChange(maker, 'commercial-request-1', 'Needs revision')).rejects.toThrow('AGENT_COMMERCIAL_MAKER_CANNOT_REJECT');
  });
});
