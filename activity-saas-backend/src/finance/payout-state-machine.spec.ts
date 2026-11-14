import { PayoutRecordType, PayoutStatus, PayoutReleaseApprovalStatus, SettlementBatchStatus } from '@prisma/client';
import { FinanceService } from './finance.service';

describe('payout state machine', () => {
  it('does not record a failure against a released payout', async () => {
    const tx: any = { $queryRawUnsafe: jest.fn(), payout: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', recordType: PayoutRecordType.CANONICAL, status: PayoutStatus.RELEASED, settlementBatchId: 'b1', tenantId: 'v', amount: '10', currency: 'INR' }) } };
    const prisma: any = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new FinanceService(prisma, {} as any, {} as any);
    await expect(service.recordFailure({ sub: 'a', role: 'SUPER_ADMIN', tenantId: null } as any, 'p1', { failureReason: 'late evidence' } as any)).rejects.toThrow('PAYOUT_NOT_READY_FOR_FAILURE_RECORD');
    expect(tx.payout.findUnique).toHaveBeenCalled();
  });
});

function retryFixture(status: PayoutStatus = PayoutStatus.READY_TO_RELEASE) {
  const payout: any = { id: 'p1', tenantId: 'v', settlementBatchId: 'b1', recordType: PayoutRecordType.CANONICAL, status, amount: '100', currency: 'INR' };
  const approval: any = { id: 'old-request', payoutId: 'p1', requestedById: 'maker', status: PayoutReleaseApprovalStatus.PENDING };
  const attempts: any[] = [];
  const tx: any = {
    $queryRawUnsafe: jest.fn(),
    payout: { findUnique: jest.fn(async () => payout), update: jest.fn(async ({ data }) => { Object.assign(payout, data); return payout; }) },
    payoutReleaseApprovalRequest: { updateMany: jest.fn(async ({ data }) => { const count = approval.status === PayoutReleaseApprovalStatus.PENDING ? 1 : 0; if (count) Object.assign(approval, data); return { count }; }) },
    payoutAttempt: { findFirst: jest.fn(async () => attempts.at(-1) || null), create: jest.fn(async ({ data }) => { const row = { id: `attempt-${data.attemptNumber}`, ...data }; attempts.push(row); return row; }) },
    settlementBatch: { update: jest.fn() },
  };
  const audit: any = { write: jest.fn() }, outbox: any = { enqueue: jest.fn() };
  return { payout, approval, attempts, tx, audit, service: new FinanceService({ $transaction: jest.fn((work) => work(tx)) } as any, audit, outbox) };
}
const operator: any = { sub: 'super-admin', role: 'SUPER_ADMIN' };

describe('payout failure and retry evidence', () => {
  it('invalidates concurrent approval evidence atomically with a failed attempt, then retries without duplicating it', async () => {
    const f = retryFixture();
    await f.service.recordFailure(operator, 'p1', { failureReason: 'Provider declined', reference: 'failed-1' } as any);
    expect(f.payout.status).toBe(PayoutStatus.RELEASE_FAILED);
    expect(f.approval).toMatchObject({ status: PayoutReleaseApprovalStatus.REJECTED, reviewedById: 'super-admin' });
    expect(f.approval.reviewReason).toContain('Submit fresh evidence after retry');
    expect(f.attempts).toHaveLength(1);
    expect(f.attempts[0]).toMatchObject({ attemptNumber: 1, status: 'FAILED', amount: '100', externalReference: 'failed-1' });
    await f.service.retry(operator, 'p1');
    expect(f.payout).toMatchObject({ status: PayoutStatus.READY_TO_RELEASE, failureReason: null, amount: '100' });
    expect(f.attempts).toHaveLength(1);
    expect(f.tx.settlementBatch.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: SettlementBatchStatus.READY_FOR_PAYOUT }) }));
    await expect(f.service.retry(operator, 'p1')).rejects.toThrow('PAYOUT_NOT_FAILED');
    expect(f.attempts).toHaveLength(1);
  });

  it('expires stale pending evidence when retrying a failure recorded by an older build', async () => {
    const f = retryFixture(PayoutStatus.RELEASE_FAILED);
    await f.service.retry(operator, 'p1');
    expect(f.approval.status).toBe(PayoutReleaseApprovalStatus.REJECTED);
    expect(f.audit.write).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: 'PAYOUT_RETRY_READY', metadata: { supersededApprovalCount: 1 } }));
  });

  it('does not offer approval against a failed payout with a stale pending request', async () => {
    const row: any = { id: 'p1', tenantId: 'v', status: PayoutStatus.RELEASE_FAILED, amount: '100', releaseApprovalRequests: [{ status: 'PENDING', requestedById: 'maker' }] };
    const prisma: any = { payout: { findMany: jest.fn().mockResolvedValue([row]) }, settlementHold: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new FinanceService(prisma, {} as any, {} as any);
    expect((await service.payouts(undefined, 'checker', true))[0].canApproveRelease).toBe(false);
    row.status = PayoutStatus.READY_TO_RELEASE;
    expect((await service.payouts(undefined, 'checker', true))[0].canApproveRelease).toBe(true);
  });
});
