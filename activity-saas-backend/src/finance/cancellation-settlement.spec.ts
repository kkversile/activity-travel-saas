import { Prisma } from '@prisma/client';
import { FinanceService } from './finance.service';
const admin: any = { sub: 'admin-1', role: 'ADMIN', tenantId: null, email: 'admin@example.com' };
function setup(existing: any = null) {
  const row: any = { id: 'cancel-1', bookingId: 'booking-1', financialState: 'REFUNDED', vendorSettlementResolution: existing, booking: { vendorTenantId: 'vendor-1', outletId: 'outlet-a', agentTenantId: 'agent-1', currency: 'INR', amount: new Prisma.Decimal('2520'), economicsSnapshot: { id: 'economics-1', vendorPayable: new Prisma.Decimal('2400') } } };
  const tx: any = { $queryRawUnsafe: jest.fn(), bookingCancellation: { findUnique: jest.fn().mockResolvedValue(row) }, financialEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) }, cancellationVendorSettlementResolution: { create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'resolution-1', ...data })) } };
  const service = new FinanceService({ $transaction: (fn: any) => fn(tx) } as any, { write: jest.fn() } as any, {} as any);
  return { service, row, tx };
}
describe('Supplier cancellation vendor settlement', () => {
  it('records the signed adjustment from original vendor payable independently of the customer refund', async () => {
    const { service, row, tx } = setup();
    const result = await service.resolveCancellation(admin, 'cancel-1', { finalVendorPayable: '0', reason: 'Service not delivered', reference: 'LOCAL-CANCEL' });
    expect(result.vendorAdjustmentAmount.toString()).toBe('-2400');
    expect(result.finalVendorPayable.toString()).toBe('0');
    expect(tx.financialEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'VENDOR_ADJUSTMENT', outletId: 'outlet-a', eventKey: 'cancellation-vendor-adjustment:cancel-1', vendorAmount: new Prisma.Decimal('-2400') }) }));
    expect(row.booking.economicsSnapshot.vendorPayable.toString()).toBe('2400');
    expect(row.financialState).toBe('REFUNDED');
    expect(tx.$queryRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(tx.bookingCancellation.findUnique.mock.invocationCallOrder[0]);
  });
  it('rejects a payable above the original supplier amount even if it is below customer price', async () => {
    const { service, tx } = setup();
    await expect(service.resolveCancellation(admin, 'cancel-1', { finalVendorPayable: '2500', reason: 'Invalid amount', reference: 'LOCAL-CANCEL' })).rejects.toThrow('FINAL_VENDOR_PAYABLE_EXCEEDS_ORIGINAL');
    expect(tx.financialEvent.create).not.toHaveBeenCalled();
  });
  it('returns the saved resolution for a matching retry without a second adjustment', async () => {
    const existing = { finalVendorPayable: '0', reference: 'LOCAL-CANCEL' };
    const { service, tx } = setup(existing);
    await expect(service.resolveCancellation(admin, 'cancel-1', { finalVendorPayable: '0', reason: 'Retry', reference: 'LOCAL-CANCEL' })).resolves.toEqual(existing);
    expect(tx.financialEvent.create).not.toHaveBeenCalled();
    await expect(service.resolveCancellation(admin, 'cancel-1', { finalVendorPayable: '100', reason: 'Overwrite', reference: 'LOCAL-OTHER' })).rejects.toThrow('CANCELLATION_SETTLEMENT_RESOLUTION_IMMUTABLE');
  });
});
