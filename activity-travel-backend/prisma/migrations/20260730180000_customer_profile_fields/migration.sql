ALTER TABLE "Customer" ADD COLUMN "country" TEXT;
ALTER TABLE "Customer" ADD COLUMN "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX "Customer_tenantId_status_createdAt_idx" ON "Customer"("tenantId", "status", "createdAt");
