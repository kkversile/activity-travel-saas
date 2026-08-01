CREATE TABLE "Tax" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ratePercent" INTEGER NOT NULL,
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Discount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "discountMinor" INTEGER,
  "discountPercent" INTEGER,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentCommission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "agentId" TEXT,
  "activityId" TEXT,
  "commissionPercent" INTEGER NOT NULL DEFAULT 0,
  "fixedMinor" INTEGER NOT NULL DEFAULT 0,
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentCommission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BlackoutDate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlackoutDate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tax_tenantId_name_key" ON "Tax"("tenantId", "name");
CREATE INDEX "Tax_tenantId_status_name_idx" ON "Tax"("tenantId", "status", "name");
CREATE UNIQUE INDEX "Discount_tenantId_name_key" ON "Discount"("tenantId", "name");
CREATE INDEX "Discount_tenantId_status_code_idx" ON "Discount"("tenantId", "status", "code");
CREATE INDEX "AgentCommission_tenantId_status_agentId_idx" ON "AgentCommission"("tenantId", "status", "agentId");
CREATE INDEX "AgentCommission_tenantId_activityId_idx" ON "AgentCommission"("tenantId", "activityId");
CREATE UNIQUE INDEX "BlackoutDate_activityId_date_key" ON "BlackoutDate"("activityId", "date");
CREATE INDEX "BlackoutDate_tenantId_date_idx" ON "BlackoutDate"("tenantId", "date");
ALTER TABLE "Tax" ADD CONSTRAINT "Tax_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlackoutDate" ADD CONSTRAINT "BlackoutDate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlackoutDate" ADD CONSTRAINT "BlackoutDate_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
