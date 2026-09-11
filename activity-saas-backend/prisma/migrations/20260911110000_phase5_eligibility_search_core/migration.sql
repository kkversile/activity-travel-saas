-- Phase 5: dynamic marketplace eligibility source-of-truth data.
CREATE TYPE "AgentVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

ALTER TABLE "RatePlan" ADD COLUMN "dateLevelCutoffTime" TEXT;

CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalBusinessName" TEXT NOT NULL,
    "verificationStatus" "AgentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DistributionChannel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DistributionChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RatePlanChannelMapping" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RatePlanChannelMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentProfile_tenantId_key" ON "AgentProfile"("tenantId");
CREATE INDEX "AgentProfile_verificationStatus_idx" ON "AgentProfile"("verificationStatus");
CREATE UNIQUE INDEX "DistributionChannel_code_key" ON "DistributionChannel"("code");
CREATE UNIQUE INDEX "RatePlanChannelMapping_ratePlanId_channelId_key" ON "RatePlanChannelMapping"("ratePlanId", "channelId");
CREATE INDEX "RatePlanChannelMapping_channelId_enabled_idx" ON "RatePlanChannelMapping"("channelId", "enabled");

ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RatePlanChannelMapping" ADD CONSTRAINT "RatePlanChannelMapping_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RatePlanChannelMapping" ADD CONSTRAINT "RatePlanChannelMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
