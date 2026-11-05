ALTER TABLE "BookingEconomicsSnapshot"
  ADD COLUMN "financeConfigurationVersion" INTEGER,
  ADD COLUMN "gstOnCommissionPercent" DECIMAL(7,4),
  ADD COLUMN "tds194OPercent" DECIMAL(7,4),
  ADD COLUMN "gstTcsPercent" DECIMAL(7,4),
  ADD COLUMN "gstOnCommissionAmount" DECIMAL(18,4),
  ADD COLUMN "tds194OAmount" DECIMAL(18,4),
  ADD COLUMN "gstTcsAmount" DECIMAL(18,4),
  ADD COLUMN "netVendorPayable" DECIMAL(18,4);
