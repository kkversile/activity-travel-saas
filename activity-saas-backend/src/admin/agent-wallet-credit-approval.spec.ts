import { AgentWalletCreditApprovalStatus, UserRole } from '@prisma/client';
import { AdminService } from './admin.service';

const maker = { sub: 'admin-maker', email: 'maker@test', role: UserRole.ADMIN, tenantId: null } as any;
const checker = { sub: 'admin-checker', email: 'checker@test', role: UserRole.ADMIN, tenantId: null } as any;

function setup() {
  const request = { id: 'credit-request-1', agentTenantId: 'agent-1', amount: '250.00', paymentMethod: 'NEFT', reference: 'UTR-1', reason: 'Verified receipt', status: AgentWalletCreditApprovalStatus.PENDING, requestedById: maker.sub, agentTenant: { id: 'agent-1', kind: 'TRAVEL_AGENT', name: 'Demo Agent' } };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    agentWalletCreditApprovalRequest: { create: jest.fn().mockResolvedValue(request), findUnique: jest.fn().mockResolvedValue(request), update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...request, ...data })) },
    agentCommercialProfile: { upsert: jest.fn().mockResolvedValue({ tenantId: 'agent-1', walletBalance: '350.00' }) },
    agentWalletLedger: { create: jest.fn().mockResolvedValue({ id: 'ledger-1', agentTenantId: 'agent-1', amount: '250.00', balanceAfter: '350.00' }) },
  };
  const prisma: any = { tenant: { findFirst: jest.fn().mockResolvedValue({ id: 'agent-1' }) }, $transaction: jest.fn((callback: any) => callback(tx)) };
  const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
  const outbox: any = { enqueue: jest.fn() };
  return { service: new AdminService(prisma, audit, outbox), prisma, tx, audit };
}

describe('Admin agent wallet credit maker-checker', () => {
  it('records a pending request without changing the wallet balance', async () => {
    const s = setup();
    await expect(s.service.creditAgentWallet(maker, 'agent-1', 250, 'Verified receipt', 'UTR-1', 'NEFT')).resolves.toMatchObject({ status: AgentWalletCreditApprovalStatus.PENDING });
    expect(s.tx.agentWalletCreditApprovalRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ agentTenantId: 'agent-1', amount: 250, requestedById: maker.sub }) });
    expect(s.tx.agentCommercialProfile.upsert).not.toHaveBeenCalled();
    expect(s.tx.agentWalletLedger.create).not.toHaveBeenCalled();
  });

  it('prevents the maker approving their own wallet credit', async () => {
    const s = setup();
    await expect(s.service.approveAgentWalletCredit(maker, 'credit-request-1')).rejects.toThrow('WALLET_CREDIT_MAKER_CANNOT_APPROVE');
    expect(s.tx.agentCommercialProfile.upsert).not.toHaveBeenCalled();
    expect(s.tx.agentWalletLedger.create).not.toHaveBeenCalled();
  });

  it('credits the wallet and creates the ledger row atomically for a different Admin', async () => {
    const s = setup();
    await expect(s.service.approveAgentWalletCredit(checker, 'credit-request-1')).resolves.toMatchObject({ status: AgentWalletCreditApprovalStatus.APPROVED, ledger: { id: 'ledger-1' } });
    expect(s.tx.agentCommercialProfile.upsert).toHaveBeenCalledWith({ where: { tenantId: 'agent-1' }, update: { walletBalance: { increment: 250 } }, create: { tenantId: 'agent-1', walletBalance: 250 } });
    expect(s.tx.agentWalletLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entryType: 'MANUAL_CREDIT', createdById: maker.sub, balanceAfter: '350.00' }) });
    expect(s.tx.agentWalletCreditApprovalRequest.update).toHaveBeenCalledWith({ where: { id: 'credit-request-1' }, data: expect.objectContaining({ status: AgentWalletCreditApprovalStatus.APPROVED, reviewedById: checker.sub, ledgerEntryId: 'ledger-1' }) });
  });

  it('requires a reason and a different Admin when rejecting', async () => {
    const s = setup();
    await expect(s.service.rejectAgentWalletCredit(checker, 'credit-request-1', ' ')).rejects.toThrow('A rejection reason is required');
    await expect(s.service.rejectAgentWalletCredit(maker, 'credit-request-1', 'Not supported')).rejects.toThrow('WALLET_CREDIT_MAKER_CANNOT_REJECT');
  });
});
