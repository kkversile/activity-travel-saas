import { FulfilmentService } from './fulfilment.service';

describe('Vendor booking completion', () => {
  const vendor: any = { sub: 'vendor-user', tenantId: 'supplier-1', role: 'VENDOR' };
  function setup(status = 'REDEEMED', endsAt: string | null = '2026-01-01T10:00:00Z') {
    const booking: any = { id: 'booking-1', vendorTenantId: 'supplier-1', bookingCode: 'VY-1', status, operationalSnapshot: { sessionSnapshot: endsAt ? { endsAt } : {} } };
    const tx: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: booking.id }]), booking: { findFirst: jest.fn().mockImplementation(({ where }) => where.vendorTenantId === booking.vendorTenantId ? booking : null), update: jest.fn().mockImplementation(({ data }) => Object.assign(booking, { status: data.status })) }, bookingEvent: { create: jest.fn() } };
    const audit: any = { write: jest.fn() }, outbox: any = { enqueue: jest.fn() };
    const service = new FulfilmentService({ $transaction: (fn: any) => fn(tx) } as any, {} as any, audit, outbox, {} as any, {} as any);
    return { service, tx, booking, audit, outbox };
  }
  it('requires redemption before completion', async () => {
    const { service, tx } = setup('CONFIRMED');
    await expect(service.complete(vendor, 'booking-1', {})).rejects.toThrow('COMPLETION_REQUIRES_REDEEMED');
    expect(tx.booking.update).not.toHaveBeenCalled();
  });
  it('keeps the scheduled end-time guard', async () => {
    const { service, tx } = setup('REDEEMED', '2099-01-01T10:00:00Z');
    await expect(service.complete(vendor, 'booking-1', { reason: 'Try early' })).rejects.toThrow('SERVICE_NOT_ENDED');
    expect(tx.booking.update).not.toHaveBeenCalled();
  });
  it('requires a reason when the booked snapshot has no end time', async () => {
    const { service, tx } = setup('REDEEMED', null);
    await expect(service.complete(vendor, 'booking-1', { reason: ' ' })).rejects.toThrow('COMPLETION_REASON_REQUIRED_WITHOUT_END_TIME');
    expect(tx.booking.update).not.toHaveBeenCalled();
    await expect(service.complete(vendor, 'booking-1', { reason: 'Service delivered' })).resolves.toMatchObject({ status: 'COMPLETED' });
  });
  it('records completion once and safely returns a completed booking on retry', async () => {
    const { service, tx, audit, outbox } = setup();
    await expect(service.complete(vendor, 'booking-1', {})).resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(service.complete(vendor, 'booking-1', {})).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(tx.booking.update).toHaveBeenCalledTimes(1);
    expect(tx.bookingEvent.create).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });
  it('does not expose or complete another supplier’s booking', async () => {
    const { service, tx } = setup();
    await expect(service.complete({ ...vendor, tenantId: 'other-supplier' }, 'booking-1', {})).rejects.toThrow('Booking not found');
    expect(tx.booking.update).not.toHaveBeenCalled();
  });
});
