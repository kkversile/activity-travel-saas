import { FulfilmentLifecycleService } from './fulfilment-lifecycle.service';

describe('FulfilmentLifecycleService', () => {
  it('uses vendor tenant for terminal fulfilment events', async () => {
    const audit = { write: jest.fn() }; const outbox = { enqueue: jest.fn() }; const tx: any = { bookingFulfilment: { findUnique: jest.fn().mockResolvedValue({ id: 'f1', bookingId: 'b1', booking: { vendorTenantId: 'vendor-1' }, vouchers: [] }), update: jest.fn().mockResolvedValue({ id: 'f1' }) }, voucherVersion: { updateMany: jest.fn() }, $queryRaw: jest.fn() };
    await new FulfilmentLifecycleService(audit as any, outbox as any).voidForTerminalOutcomeInTransaction(tx, 'b1', { tenantId: 'agent-1', sub: 'u1', role: 'TRAVEL_AGENT' } as any, 'rejected', 'VENDOR_REJECTED');
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ tenantId: 'vendor-1', eventType: 'VOUCHER_VOIDED' }));
  });
});
