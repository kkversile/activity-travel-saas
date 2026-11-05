CREATE TABLE "AgentCommercialProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'Silver',
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "walletBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditOutstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "markupAllowedPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "categoryOverrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommercialProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCommercialProfile_tenantId_key" ON "AgentCommercialProfile"("tenantId");
ALTER TABLE "AgentCommercialProfile" ADD CONSTRAINT "AgentCommercialProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentWalletLedger" (
    "id" TEXT NOT NULL,
    "agentTenantId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentWalletLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentWalletLedger_agentTenantId_createdAt_idx" ON "AgentWalletLedger"("agentTenantId", "createdAt");
ALTER TABLE "AgentWalletLedger" ADD CONSTRAINT "AgentWalletLedger_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
