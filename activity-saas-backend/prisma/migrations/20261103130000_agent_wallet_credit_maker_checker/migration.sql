CREATE TYPE "AgentWalletCreditApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AgentWalletCreditApprovalRequest" (
    "id" TEXT NOT NULL,
    "agentTenantId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "status" "AgentWalletCreditApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentWalletCreditApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentWalletCreditApprovalRequest_ledgerEntryId_key"
    ON "AgentWalletCreditApprovalRequest"("ledgerEntryId");
CREATE INDEX "AgentWalletCreditApprovalRequest_status_createdAt_idx"
    ON "AgentWalletCreditApprovalRequest"("status", "createdAt");
CREATE INDEX "AgentWalletCreditApprovalRequest_agentTenantId_status_createdAt_idx"
    ON "AgentWalletCreditApprovalRequest"("agentTenantId", "status", "createdAt");
CREATE INDEX "AgentWalletCreditApprovalRequest_requestedById_status_idx"
    ON "AgentWalletCreditApprovalRequest"("requestedById", "status");

ALTER TABLE "AgentWalletCreditApprovalRequest"
    ADD CONSTRAINT "AgentWalletCreditApprovalRequest_agentTenantId_fkey"
    FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentWalletCreditApprovalRequest"
    ADD CONSTRAINT "AgentWalletCreditApprovalRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentWalletCreditApprovalRequest"
    ADD CONSTRAINT "AgentWalletCreditApprovalRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentWalletCreditApprovalRequest"
    ADD CONSTRAINT "AgentWalletCreditApprovalRequest_ledgerEntryId_fkey"
    FOREIGN KEY ("ledgerEntryId") REFERENCES "AgentWalletLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
