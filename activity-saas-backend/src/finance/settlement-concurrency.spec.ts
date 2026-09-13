import { FinanceService } from './finance.service';

describe('settlement concurrency contracts', () => {
  it('rejects selecting only part of an atomic booking line', () => {
    const service = new FinanceService({} as any, {} as any, {} as any);
    expect(() => (service as any).selectPreview({ vendorTenantId: 'v', currency: 'INR', policy: { version: 1 }, eligibleLines: [{ sourceEventIds: ['base', 'adjustment'], netVendorPayable: '2', grossBookingValue: '8', vendorPayableBase: '8', adjustmentAmount: '-6' }] }, ['adjustment'])).toThrow('SETTLEMENT_SELECTED_LINE_INCOMPLETE');
  });
  it('accepts a complete source-event set for an atomic line', () => {
    const service = new FinanceService({} as any, {} as any, {} as any);
    expect((service as any).selectPreview({ vendorTenantId: 'v', currency: 'INR', policy: { version: 1 }, eligibleLines: [{ sourceEventIds: ['base', 'adjustment'], netVendorPayable: '2', grossBookingValue: '8', vendorPayableBase: '8', adjustmentAmount: '-6' }] }, ['base', 'adjustment']).totals.netPayable).toBe('2');
  });
});
