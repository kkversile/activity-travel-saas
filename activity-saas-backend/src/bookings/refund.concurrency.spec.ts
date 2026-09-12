import { BookingStatus, CancellationFinancialState, FinancialEventStatus, RefundStatus, UserRole } from '@prisma/client';
import { CancellationService } from './cancellation.service';

const admin: any = { sub: 'admin-1', email: 'admin@test.local', role: UserRole.ADMIN, tenantId: null, organizationRole: 'OWNER' };
const pending = (status: RefundStatus = RefundStatus.PENDING, externalReference: string | null = null): any => ({ id: 'refund-1', bookingId: 'booking-1', cancellationId: 'cancel-1', amount: '100.00', currency: 'INR', status, externalReference, version: 1, cancellation: { id: 'cancel-1', financialState: CancellationFinancialState.REFUND_PENDING }, booking: { id: 'booking-1', vendorTenantId: 'vendor-1' } });

function serviceWith(refund: any) {
  const tx: any = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'refund-1' }]),
    refund: { findUniqueOrThrow: jest.fn().mockResolvedValue(refund), update: jest.fn().mockResolvedValue({ ...refund, status: RefundStatus.CONFIRMED }) },
    bookingCancellation: { update: jest.fn() },
    financialEvent: { upsert: jest.fn() },
    bookingEvent: { create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
  const service = new CancellationService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
  return { service, tx };
}

describe('Refund transition locking and evidence safety', () => {
  it('locks the Refund row before reading its status and writes one terminal event', async () => {
    const { service, tx } = serviceWith(pending());
    await service.confirmRefund(admin, 'refund-1', { externalReference: 'bank-ref-1' });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('Refund'), 'refund-1');
    expect(tx.refund.update).toHaveBeenCalled();
    expect(tx.financialEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: FinancialEventStatus.POSTED }) }));
  });

  it('accepts the same confirmation reference idempotently', async () => {
    const row = pending(RefundStatus.CONFIRMED, 'bank-ref-1'); const { service, tx } = serviceWith(row);
    await expect(service.confirmRefund(admin, 'refund-1', { externalReference: 'bank-ref-1' })).resolves.toEqual(row);
    expect(tx.refund.update).not.toHaveBeenCalled();
  });

  it('rejects a conflicting confirmation reference', async () => {
    const { service } = serviceWith(pending(RefundStatus.CONFIRMED, 'bank-ref-1'));
    await expect(service.confirmRefund(admin, 'refund-1', { externalReference: 'bank-ref-2' })).rejects.toThrow('REFUND_ALREADY_CONFIRMED_DIFFERENT_REFERENCE');
  });

  it('rejects a loser that observes the terminal state after the lock', async () => {
    const { service } = serviceWith(pending(RefundStatus.CONFIRMED, 'bank-ref-1'));
    await expect(service.failRefund(admin, 'refund-1', { reason: 'processor failure' })).rejects.toThrow('REFUND_CONFIRMED');
  });
});
