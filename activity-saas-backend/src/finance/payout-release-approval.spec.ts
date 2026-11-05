import { PaymentCollectionMode, PayoutRecordType, PayoutReleaseApprovalStatus, PayoutStatus, UserRole } from '@prisma/client';
import { FinanceService } from './finance.service';

const maker: any = { sub: 'admin-maker', role: UserRole.ADMIN };
const checker: any = { sub: 'admin-checker', role: UserRole.ADMIN };

function service(payoutReleaseApprovalRequest: any, payout: any = {}) {
  const tx: any = {
    $queryRawUnsafe: jest.fn(),
    payout: { findUnique: jest.fn().mockResolvedValue({ id: 'payout-1', tenantId: 'vendor-1', settlementBatchId: 'batch-1', amount: '1250', currency: 'INR', recordType: PayoutRecordType.CANONICAL, status: PayoutStatus.READY_TO_RELEASE, ...payout }), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({ id: 'payout-1', status: PayoutStatus.RELEASED }) },
    payoutAttempt: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
    settlementBatch: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: 'batch-1', vendorTenantId: 'vendor-1', netPayable: '1250', lines: [{ id: 'line-1', bookingId: 'booking-1', netVendorPayable: '1250', vendorPayableBase: '1250', adjustmentAmount: '0', allocations: [{ financialEventId: 'event-1', financialEvent: { amount: '1250', vendorAmount: '1250' } }] }] }) },
    settlementEventAllocation: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    settlementHold: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
    financialEvent: { create: jest.fn() },
    financeConfiguration: { findUnique: jest.fn().mockResolvedValue({ paymentCollectionMode: PaymentCollectionMode.VOYA_COLLECTS }) },
    payoutReleaseApprovalRequest,
  };
  const prisma: any = { $transaction: jest.fn((work: any) => work(tx)), payoutReleaseApprovalRequest: { findUnique: jest.fn().mockResolvedValue({ payoutId: 'payout-1' }) } };
  const audit: any = { write: jest.fn() };
  const outbox: any = { enqueue: jest.fn() };
  return { service: new FinanceService(prisma, audit, outbox), prisma, tx, audit, outbox };
}

describe('payout release maker-checker', () => {
  it('records release evidence as a pending request without changing payout status', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'request-1', status: PayoutReleaseApprovalStatus.PENDING });
    const s = service({ findFirst: jest.fn().mockResolvedValue(null), create });
    await expect(s.service.requestRelease(maker, 'payout-1', { externalReference: 'bank-ref-1', note: 'Paid externally' } as any)).resolves.toMatchObject({ status: PayoutReleaseApprovalStatus.PENDING });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ payoutId: 'payout-1', requestedById: maker.sub, externalReference: 'bank-ref-1' }) });
    expect(s.tx.payout.update).not.toHaveBeenCalled();
    expect(s.audit.write).toHaveBeenCalledWith(s.tx, expect.objectContaining({ action: 'PAYOUT_RELEASE_REQUESTED' }));
  });

  it('prevents the maker from approving their own payout release request', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'request-1', payoutId: 'payout-1', requestedById: maker.sub, status: PayoutReleaseApprovalStatus.PENDING });
    const s = service({ findUnique });
    await expect(s.service.approveRelease(maker, 'request-1')).rejects.toThrow('PAYOUT_RELEASE_MAKER_CANNOT_APPROVE');
    expect(s.tx.payout.update).not.toHaveBeenCalled();
  });

  it('allows a different Admin to pass the maker-checker boundary', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'request-1', payoutId: 'payout-1', requestedById: maker.sub, status: PayoutReleaseApprovalStatus.PENDING, externalReference: 'bank-ref-1', requestedAmount: '1250', note: null });
    const update = jest.fn().mockResolvedValue({ status: PayoutReleaseApprovalStatus.APPROVED });
    const s = service({ findUnique, update });
    await expect(s.service.approveRelease(checker, 'request-1')).resolves.toMatchObject({ status: PayoutStatus.RELEASED });
    expect(update).toHaveBeenCalledWith({ where: { id: 'request-1' }, data: expect.objectContaining({ status: PayoutReleaseApprovalStatus.APPROVED, reviewedById: checker.sub }) });
    expect(s.tx.payout.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: PayoutStatus.RELEASED, releasedById: checker.sub }) }));
  });

  it('deducts active event holds from the maker-checker requested payout amount', async () => {
    const createRequest = jest.fn();
    const s = service({ findFirst: jest.fn().mockResolvedValue(null), create: createRequest });
    s.tx.settlementBatch.findUnique.mockResolvedValue({ id: 'batch-1', vendorTenantId: 'vendor-1', netPayable: '1250', lines: [{ id: 'line-1', bookingId: 'booking-1', netVendorPayable: '1250', vendorPayableBase: '1250', adjustmentAmount: '0', allocations: [{ financialEventId: 'event-1', financialEvent: { amount: '1000', vendorAmount: '1000' } }] }] });
    s.tx.settlementHold.findMany.mockResolvedValue([
      { id: 'hold-1', scope: 'FINANCIAL_EVENT', vendorTenantId: 'vendor-1', bookingId: null, financialEventId: 'event-1' },
    ]);

    createRequest.mockResolvedValue({ id: 'request-1', status: PayoutReleaseApprovalStatus.PENDING });
    await expect(s.service.requestRelease(maker, 'payout-1', { externalReference: 'bank-ref-1' } as any))
      .resolves.toMatchObject({ status: PayoutReleaseApprovalStatus.PENDING });
    expect(createRequest.mock.calls[0][0].data.requestedAmount.toString()).toBe('250');
    expect(s.tx.payout.update).not.toHaveBeenCalled();
  });

  it('records only the unheld balance on payout release and carries the hold forward', async () => {
    const s = service({
      findUnique: jest.fn().mockResolvedValue({ id: 'request-1', payoutId: 'payout-1', requestedById: maker.sub, status: PayoutReleaseApprovalStatus.PENDING, externalReference: 'bank-ref-1', requestedAmount: '250', note: null }),
      update: jest.fn().mockResolvedValue({ status: PayoutReleaseApprovalStatus.APPROVED }),
    });
    s.tx.settlementBatch.findUnique.mockResolvedValue({ id: 'batch-1', vendorTenantId: 'vendor-1', netPayable: '1250', lines: [{ id: 'line-1', bookingId: 'booking-1', netVendorPayable: '1250', vendorPayableBase: '1250', adjustmentAmount: '0', allocations: [{ financialEventId: 'event-1', financialEvent: { amount: '1000', vendorAmount: '1000' } }] }] });
    s.tx.settlementHold.findMany.mockResolvedValue([
      { id: 'hold-1', scope: 'FINANCIAL_EVENT', vendorTenantId: 'vendor-1', bookingId: null, financialEventId: 'event-1' },
    ]);

    await expect(s.service.approveRelease(checker, 'request-1')).resolves.toMatchObject({ status: PayoutStatus.RELEASED });

    const payoutUpdate = s.tx.payout.update.mock.calls[0][0].data;
    expect(payoutUpdate.amount.toString()).toBe('250');
    expect(payoutUpdate.heldAmount.toString()).toBe('1000');
    expect(payoutUpdate.heldHoldIds).toEqual(['hold-1']);
    const releaseEvent = s.tx.financialEvent.create.mock.calls[0][0].data;
    expect(releaseEvent.type).toBe('PAYOUT_RELEASED');
    expect(releaseEvent.amount.toString()).toBe('250');
  });

  it('rechecks active holds when a checker approves a previously requested payout', async () => {
    const s = service({
      findUnique: jest.fn().mockResolvedValue({ id: 'request-1', payoutId: 'payout-1', requestedById: maker.sub, status: PayoutReleaseApprovalStatus.PENDING, requestedAmount: '1250' }),
    });
    s.tx.settlementBatch.findUnique.mockResolvedValue({ id: 'batch-1', vendorTenantId: 'vendor-1', netPayable: '1250', lines: [{ id: 'line-1', bookingId: 'booking-1', netVendorPayable: '1250', vendorPayableBase: '1250', adjustmentAmount: '0', allocations: [{ financialEventId: 'event-1', financialEvent: { amount: '1000', vendorAmount: '1000' } }] }] });
    s.tx.settlementHold.findMany.mockResolvedValue([
      { scope: 'FINANCIAL_EVENT', vendorTenantId: 'vendor-1', bookingId: null, financialEventId: 'event-1' },
    ]);

    await expect(s.service.approveRelease(checker, 'request-1'))
      .rejects.toThrow('PAYOUT_RELEASE_AMOUNT_CHANGED');
    expect(s.tx.payout.update).not.toHaveBeenCalled();
    expect(s.tx.financialEvent.create).not.toHaveBeenCalled();
  });

  it('returns the withheld amount to settlement once the hold is released after a partial payout', async () => {
    const releasedHold = { id: 'hold-1', scope: 'FINANCIAL_EVENT', vendorTenantId: 'vendor-1', bookingId: 'booking-1', financialEventId: 'event-1', status: 'RELEASED', releasedById: checker.sub, releaseReason: 'Dispute resolved', reference: 'case-22' };
    const batch = { id: 'batch-1', vendorTenantId: 'vendor-1', netPayable: '1000', lines: [{ id: 'line-1', bookingId: 'booking-1', netVendorPayable: '100', vendorPayableBase: '100', adjustmentAmount: '0', allocations: [{ financialEventId: 'event-1', financialEvent: { amount: '100', vendorAmount: '100' } }] }] };
    const payoutRow = { id: 'payout-1', tenantId: 'vendor-1', settlementBatchId: 'batch-1', amount: '900', heldAmount: '100', heldHoldIds: ['hold-1'], currency: 'INR', status: PayoutStatus.RELEASED, settlementBatch: batch };
    const s = service({ findUnique: jest.fn().mockResolvedValue({ id: 'request-1' }) });
    s.tx.settlementHold.findUnique.mockResolvedValue({ id: 'hold-1', status: 'ACTIVE' });
    s.tx.settlementHold.update.mockResolvedValue(releasedHold);
    s.tx.payout.findMany.mockResolvedValue([payoutRow]);
    s.tx.payout.findUnique.mockResolvedValue(payoutRow);
    s.tx.settlementHold.findMany.mockResolvedValue([releasedHold]);

    await s.service.releaseHold(checker, 'hold-1', 'Dispute resolved');

    const adjustment = s.tx.financialEvent.create.mock.calls[0][0].data;
    expect(adjustment).toEqual(expect.objectContaining({
      eventKey: 'payout-hold-release:payout-1:hold-1:line-1',
      type: 'VENDOR_ADJUSTMENT',
      components: expect.objectContaining({ kind: 'PAYOUT_HOLD_RELEASE', holdId: 'hold-1' }),
    }));
    expect(adjustment.amount.toString()).toBe('100');
    expect(adjustment.vendorAmount.toString()).toBe('100');
    const payoutUpdate = s.tx.payout.update.mock.calls[0][0];
    expect(payoutUpdate.data.heldAmount.toString()).toBe('0');
    expect(payoutUpdate.data.heldHoldIds).toEqual([]);
  });
});
