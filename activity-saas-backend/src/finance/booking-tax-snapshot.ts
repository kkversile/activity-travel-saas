import { Prisma } from '@prisma/client';

type AmountLike = Prisma.Decimal | string | number | null | undefined;

function decimal(value: AmountLike) {
  return new Prisma.Decimal(value == null ? 0 : value);
}

function taxAmount(base: AmountLike, percent: AmountLike) {
  if (percent == null) return null;
  return decimal(base).mul(decimal(percent)).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function snapshotBookingTaxDeductions(
  economics: { supplierGrossBasis: AmountLike; supplierCommission: AmountLike; vendorPayable: AmountLike },
  configuration: { version: number; gstOnCommissionPercent?: AmountLike; tds194OPercent?: AmountLike; gstTcsPercent?: AmountLike },
) {
  const gstOnCommissionAmount = taxAmount(economics.supplierCommission, configuration.gstOnCommissionPercent);
  const tds194OAmount = taxAmount(economics.supplierGrossBasis, configuration.tds194OPercent);
  const gstTcsAmount = taxAmount(economics.supplierGrossBasis, configuration.gstTcsPercent);
  const deductions = [gstOnCommissionAmount, tds194OAmount, gstTcsAmount]
    .filter((amount): amount is Prisma.Decimal => amount !== null)
    .reduce((total, amount) => total.plus(amount), new Prisma.Decimal(0));

  return {
    financeConfigurationVersion: configuration.version,
    gstOnCommissionPercent: configuration.gstOnCommissionPercent == null ? null : decimal(configuration.gstOnCommissionPercent),
    tds194OPercent: configuration.tds194OPercent == null ? null : decimal(configuration.tds194OPercent),
    gstTcsPercent: configuration.gstTcsPercent == null ? null : decimal(configuration.gstTcsPercent),
    gstOnCommissionAmount,
    tds194OAmount,
    gstTcsAmount,
    netVendorPayable: decimal(economics.vendorPayable).minus(deductions).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  };
}
