CREATE TYPE "ImpersonationSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');

CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "originalAdminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" "ImpersonationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImpersonationSession_originalAdminId_createdAt_idx" ON "ImpersonationSession"("originalAdminId", "createdAt");
CREATE INDEX "ImpersonationSession_targetUserId_status_idx" ON "ImpersonationSession"("targetUserId", "status");
CREATE INDEX "ImpersonationSession_status_expiresAt_idx" ON "ImpersonationSession"("status", "expiresAt");
