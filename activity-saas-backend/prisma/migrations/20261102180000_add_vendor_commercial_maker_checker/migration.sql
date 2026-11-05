CREATE TYPE "VendorCommercialChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "VendorCommercialChangeRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proposedSupplierModel" "SupplierCommercialModel" NOT NULL,
  "proposedCommissionPercent" DECIMAL(7,4),
  "requestReason" TEXT NOT NULL,
  "status" "VendorCommercialChangeStatus" NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewReason" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VendorCommercialChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorCommercialChangeRequest_tenantId_status_createdAt_idx"
  ON "VendorCommercialChangeRequest"("tenantId", "status", "createdAt");
CREATE INDEX "VendorCommercialChangeRequest_createdById_status_idx"
  ON "VendorCommercialChangeRequest"("createdById", "status");

ALTER TABLE "VendorCommercialChangeRequest"
  ADD CONSTRAINT "VendorCommercialChangeRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorCommercialChangeRequest"
  ADD CONSTRAINT "VendorCommercialChangeRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorCommercialChangeRequest"
  ADD CONSTRAINT "VendorCommercialChangeRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
