import { FinanceService } from './finance.service';

describe('settlement concurrency contracts', () => {
  it('locks the vendor row before checking the weekly payout slot', async () => {
    const service = new FinanceService({} as any, {} as any, {} as any);
    const tx: any = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      payout: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const week = { start: new Date('2026-11-02T00:00:00Z'), end: new Date('2026-11-09T00:00:00Z') };

    await (service as any).assertNoWeeklyVendorPayout(tx, 'vendor-tenant-1', week);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT "id" FROM "Tenant" WHERE "id" = $1 FOR UPDATE',
      'vendor-tenant-1',
    );
    expect(tx.$queryRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(tx.payout.findFirst.mock.invocationCallOrder[0]);
    expect(tx.payout.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'vendor-tenant-1', recordType: 'CANONICAL', createdAt: { gte: week.start, lt: week.end } },
      select: { id: true },
    });
  });
  it('rejects a second weekly payout after the vendor lock is acquired', async () => {
    const service = new FinanceService({} as any, {} as any, {} as any);
    const tx: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([]), payout: { findFirst: jest.fn().mockResolvedValue({ id: 'payout-existing' }) } };
    await expect((service as any).assertNoWeeklyVendorPayout(tx, 'vendor-tenant-1', { start: new Date(), end: new Date() })).rejects.toThrow('WEEKLY_VENDOR_PAYOUT_ALREADY_EXISTS');
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
  it('rejects selecting only part of an atomic booking line', () => {
    const service = new FinanceService({} as any, {} as any, {} as any);
    expect(() => (service as any).selectPreview({ vendorTenantId: 'v', currency: 'INR', policy: { version: 1 }, eligibleLines: [{ sourceEventIds: ['base', 'adjustment'], netVendorPayable: '2', grossBookingValue: '8', vendorPayableBase: '8', adjustmentAmount: '-6' }] }, ['adjustment'])).toThrow('SETTLEMENT_SELECTED_LINE_INCOMPLETE');
  });
  it('accepts a complete source-event set for an atomic line', () => {
    const service = new FinanceService({} as any, {} as any, {} as any);
    expect((service as any).selectPreview({ vendorTenantId: 'v', currency: 'INR', policy: { version: 1 }, eligibleLines: [{ sourceEventIds: ['base', 'adjustment'], netVendorPayable: '2', grossBookingValue: '8', vendorPayableBase: '8', adjustmentAmount: '-6' }] }, ['base', 'adjustment']).totals.netPayable).toBe('2');
  });
});
