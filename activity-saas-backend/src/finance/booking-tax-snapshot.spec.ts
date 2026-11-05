import { Prisma } from '@prisma/client';
import { snapshotBookingTaxDeductions } from './booking-tax-snapshot';

describe('booking finance tax snapshot', () => {
  it('calculates and freezes configured deductions against the correct bases', () => {
    const snapshot = snapshotBookingTaxDeductions(
      {
        supplierGrossBasis: new Prisma.Decimal('1000'),
        supplierCommission: new Prisma.Decimal('100'),
        vendorPayable: new Prisma.Decimal('800'),
      },
      {
        version: 4,
        gstOnCommissionPercent: '18',
        tds194OPercent: '0.1',
        gstTcsPercent: '0.5',
      },
    );

    expect(snapshot).toMatchObject({
      financeConfigurationVersion: 4,
      gstOnCommissionAmount: new Prisma.Decimal('18.00'),
      tds194OAmount: new Prisma.Decimal('1.00'),
      gstTcsAmount: new Prisma.Decimal('5.00'),
      netVendorPayable: new Prisma.Decimal('776.00'),
    });
  });

  it('leaves the payable unchanged when tax rates are not configured', () => {
    const snapshot = snapshotBookingTaxDeductions(
      { supplierGrossBasis: '1000', supplierCommission: '100', vendorPayable: '800' },
      { version: 1 },
    );

    expect(snapshot.gstOnCommissionAmount).toBeNull();
    expect(snapshot.tds194OAmount).toBeNull();
    expect(snapshot.gstTcsAmount).toBeNull();
    expect(snapshot.netVendorPayable.toString()).toBe('800');
  });
});
