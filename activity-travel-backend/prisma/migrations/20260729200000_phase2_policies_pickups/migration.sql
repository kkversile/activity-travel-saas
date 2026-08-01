CREATE TABLE "CancellationPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "rules" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PickupPoint" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PickupPoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CancellationPolicy_tenantId_name_key" ON "CancellationPolicy"("tenantId", "name");
CREATE INDEX "CancellationPolicy_tenantId_status_createdAt_idx" ON "CancellationPolicy"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "PickupPoint_tenantId_name_key" ON "PickupPoint"("tenantId", "name");
CREATE INDEX "PickupPoint_tenantId_status_name_idx" ON "PickupPoint"("tenantId", "status", "name");
ALTER TABLE "CancellationPolicy" ADD CONSTRAINT "CancellationPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
