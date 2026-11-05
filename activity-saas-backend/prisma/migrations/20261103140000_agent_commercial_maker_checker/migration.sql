CREATE TYPE "AgentCommercialChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AgentCommercialChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposedConfiguration" JSONB NOT NULL,
    "requestReason" TEXT NOT NULL,
    "status" "AgentCommercialChangeStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentCommercialChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentCommercialChangeRequest_tenantId_status_createdAt_idx" ON "AgentCommercialChangeRequest"("tenantId", "status", "createdAt");
CREATE INDEX "AgentCommercialChangeRequest_createdById_status_idx" ON "AgentCommercialChangeRequest"("createdById", "status");
ALTER TABLE "AgentCommercialChangeRequest" ADD CONSTRAINT "AgentCommercialChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCommercialChangeRequest" ADD CONSTRAINT "AgentCommercialChangeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentCommercialChangeRequest" ADD CONSTRAINT "AgentCommercialChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
