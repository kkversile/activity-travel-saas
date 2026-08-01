ALTER TABLE "Booking"
  ADD COLUMN "supplierId" TEXT,
  ADD COLUMN "agentId" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DIRECT';

CREATE TABLE "SupplierActivity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "costMinor" INTEGER NOT NULL DEFAULT 0,
  "commissionPercent" INTEGER NOT NULL DEFAULT 0,
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierActivity_tenantId_supplierId_activityId_key" ON "SupplierActivity"("tenantId", "supplierId", "activityId");
CREATE INDEX "SupplierActivity_tenantId_supplierId_status_idx" ON "SupplierActivity"("tenantId", "supplierId", "status");
CREATE INDEX "SupplierActivity_tenantId_activityId_status_idx" ON "SupplierActivity"("tenantId", "activityId", "status");
CREATE INDEX "Booking_tenantId_agentId_createdAt_idx" ON "Booking"("tenantId", "agentId", "createdAt");
CREATE INDEX "Booking_tenantId_supplierId_createdAt_idx" ON "Booking"("tenantId", "supplierId", "createdAt");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierActivity" ADD CONSTRAINT "SupplierActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierActivity" ADD CONSTRAINT "SupplierActivity_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierActivity" ADD CONSTRAINT "SupplierActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
