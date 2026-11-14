import { FulfilmentService } from './fulfilment.service';

describe('Vendor voucher lookup', () => {
  const vendor: any = { sub: 'vendor-user', tenantId: 'supplier-1', role: 'VENDOR' };
  function setup(status = 'CURRENT', bookingStatus = 'CONFIRMED') {
    const booking = { id: 'booking-1', bookingCode: 'VY-1', status: bookingStatus, customerName: 'Arun Menon', serviceDate: new Date('2026-11-16'), redemption: null, product: { currentRevision: { productName: 'Sunset walk' } } };
    const findFirst = jest.fn().mockResolvedValue({ status, booking });
    const service = new FulfilmentService({ voucherVersion: { findFirst } } as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, findFirst };
  }
  it('looks up current vouchers within the authenticated supplier only', async () => {
    const { service, findFirst } = setup();
    await expect(service.lookupVendorVoucher(vendor, ' VOY-1 ')).resolves.toMatchObject({ bookingId: 'booking-1', status: 'CONFIRMED', redeemed: false });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { voucherCode: 'VOY-1', booking: { vendorTenantId: 'supplier-1', recordType: 'CANONICAL' } } }));
  });
  it('explains that a cancelled booking cannot be used for entry', async () => {
    const { service } = setup('VOID', 'CANCELLED');
    await expect(service.lookupVendorVoucher(vendor, 'VOY-1')).rejects.toThrow('This booking was cancelled. Its voucher is void and cannot be used for entry.');
  });
  it('requires the latest voucher after replacement', async () => {
    const { service } = setup('SUPERSEDED');
    await expect(service.lookupVendorVoucher(vendor, 'VOY-1')).rejects.toThrow('Ask the guest for their latest voucher.');
  });
  it('blocks void vouchers even when the booking is not cancelled', async () => {
    const { service } = setup('VOID');
    await expect(service.lookupVendorVoucher(vendor, 'VOY-1')).rejects.toThrow('This voucher is void and cannot be used for entry.');
  });
  it('does not disclose vouchers absent from the supplier-scoped lookup', async () => {
    const { service, findFirst } = setup(); findFirst.mockResolvedValue(null);
    await expect(service.lookupVendorVoucher(vendor, 'OTHER-SUPPLIER')).rejects.toThrow('Voucher not found for this supplier account');
  });
});
