CREATE TABLE "Supplier" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "company" TEXT NOT NULL, "contactPerson" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT, "taxDetails" TEXT, "address" TEXT, "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Agent" ("id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "company" TEXT NOT NULL, "contactPerson" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT, "commissionPercent" INTEGER NOT NULL DEFAULT 0, "creditLimitMinor" INTEGER NOT NULL DEFAULT 0, "outstandingBalanceMinor" INTEGER NOT NULL DEFAULT 0, "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Agent_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Supplier_tenantId_company_key" ON "Supplier"("tenantId", "company");
CREATE UNIQUE INDEX "Agent_tenantId_company_key" ON "Agent"("tenantId", "company");
CREATE INDEX "Supplier_tenantId_status_company_idx" ON "Supplier"("tenantId", "status", "company");
CREATE INDEX "Agent_tenantId_status_company_idx" ON "Agent"("tenantId", "status", "company");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
