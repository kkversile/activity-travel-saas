ALTER TABLE "VendorProfile"
  ADD COLUMN "supplierType" TEXT,
  ADD COLUMN "accountManagerName" TEXT,
  ADD COLUMN "defaultSupplierModel" "SupplierCommercialModel",
  ADD COLUMN "defaultSupplierCommissionPercent" DECIMAL(7,4);
