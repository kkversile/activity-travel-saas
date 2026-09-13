import { PayoutRecordType, PayoutStatus } from '@prisma/client';
import { FinanceService } from './finance.service';

describe('payout state machine', () => {
  it('does not record a failure against a released payout', async () => {
    const tx: any = { $queryRawUnsafe: jest.fn(), payout: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', recordType: PayoutRecordType.CANONICAL, status: PayoutStatus.RELEASED, settlementBatchId: 'b1', tenantId: 'v', amount: '10', currency: 'INR' }) } };
    const prisma: any = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new FinanceService(prisma, {} as any, {} as any);
    await expect(service.recordFailure({ sub: 'a', role: 'ADMIN', tenantId: null } as any, 'p1', { failureReason: 'late evidence' } as any)).rejects.toThrow('PAYOUT_NOT_READY_FOR_FAILURE_RECORD');
    expect(tx.payout.findUnique).toHaveBeenCalled();
  });
});
