import { PaymentCollectionMode, PayoutStatus, SettlementBatchStatus, UserRole } from '@prisma/client';
import { FinanceService } from './finance.service';
import { vendorPayoutPublicCode } from '../common/public-identifiers';

function setup(existingWeeklyPayout: any = null) {
  const batch = { id: 'batch-1', vendorTenantId: 'vendor-1', status: SettlementBatchStatus.PAYOUT_BLOCKED, netPayable: '2998', currency: 'INR', payout: null };
  const tx: any = {
    $queryRawUnsafe: jest.fn(),
    settlementBatch: { findUnique: jest.fn().mockResolvedValue(batch), update: jest.fn().mockResolvedValue({ ...batch, status: SettlementBatchStatus.READY_FOR_PAYOUT }) },
    financeConfiguration: { findUniqueOrThrow: jest.fn().mockResolvedValue({ paymentCollectionMode: PaymentCollectionMode.VOYA_COLLECTS }) },
    publicIdentifier: { findUnique: jest.fn().mockResolvedValue({ publicCode: 'SUP-0007' }), upsert: jest.fn() },
    payout: { findFirst: jest.fn().mockResolvedValue(existingWeeklyPayout), create: jest.fn().mockResolvedValue({ id: 'payout-1' }) },
  };
  const service = new FinanceService({ $transaction: jest.fn((work) => work(tx)) } as any, { write: jest.fn() } as any, { enqueue: jest.fn() } as any);
  return { service, tx };
}

describe('blocked settlement payout readiness', () => {
  it('creates a public payout reference and checks weekly uniqueness under the Vendor lock', async () => {
    const { service, tx } = setup();
    await service.reEvaluatePayoutReadiness({ sub: 'admin-1', role: UserRole.ADMIN } as any, 'batch-1');
    const data = tx.payout.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ settlementBatchId: 'batch-1', amount: '2998', status: PayoutStatus.READY_TO_RELEASE });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"Tenant"'), 'vendor-1');
    expect(tx.payout.findFirst.mock.invocationCallOrder[0]).toBeGreaterThan(tx.$queryRawUnsafe.mock.invocationCallOrder[1]);
    expect(tx.publicIdentifier.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ entityType: 'PAYOUT', entityId: 'payout-1', publicCode: vendorPayoutPublicCode('SUP-0007', data.createdAt) }) }));
  });

  it('does not create or promote a second payout for the same Vendor week', async () => {
    const { service, tx } = setup({ id: 'existing-payout' });
    await expect(service.reEvaluatePayoutReadiness({ sub: 'admin-1', role: UserRole.ADMIN } as any, 'batch-1')).rejects.toThrow('WEEKLY_VENDOR_PAYOUT_ALREADY_EXISTS');
    expect(tx.payout.create).not.toHaveBeenCalled();
    expect(tx.settlementBatch.update).not.toHaveBeenCalled();
  });

  it('keeps collection-unconfigured batches blocked', async () => {
    const { service, tx } = setup();
    tx.financeConfiguration.findUniqueOrThrow.mockResolvedValue({ paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED });
    await expect(service.reEvaluatePayoutReadiness({ sub: 'admin-1', role: UserRole.ADMIN } as any, 'batch-1')).rejects.toThrow('PAYOUT_BLOCKED_COLLECTION_MODEL');
    expect(tx.payout.create).not.toHaveBeenCalled();
  });
});
