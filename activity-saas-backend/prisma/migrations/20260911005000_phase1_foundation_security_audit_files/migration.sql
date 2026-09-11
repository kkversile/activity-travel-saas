-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'CATALOGUE', 'OPERATIONS', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('PRODUCT_MEDIA', 'VENDOR_DOCUMENT', 'BOOKING_VOUCHER', 'FULFILMENT_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('GSTIN', 'PAN', 'BANK_PROOF', 'TRADE_LICENSE');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'SUB_ADMIN', 'VENDOR', 'TRAVEL_AGENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

-- Reconcile schema drift that pre-dates the Phase 1 migration without dropping manual data.
ALTER TABLE "ActivityMedia" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "ActivityMedia" ADD COLUMN IF NOT EXISTS "seoTitle" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN IF NOT EXISTS "payoutAccountHolder" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN IF NOT EXISTS "payoutAccountType" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN IF NOT EXISTS "payoutBankName" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN IF NOT EXISTS "payoutBranch" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN IF NOT EXISTS "payoutCurrency" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN IF NOT EXISTS "payoutIfsc" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN IF NOT EXISTS "payoutSwift" TEXT;
CREATE TABLE IF NOT EXISTS "PricingRule" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "adjustmentType" "ChargeType" NOT NULL DEFAULT 'PERCENTAGE',
    "adjustment" DECIMAL(10,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PricingRule_activityId_active_idx" ON "PricingRule"("activityId", "active");
CREATE INDEX IF NOT EXISTS "PricingRule_startsAt_endsAt_idx" ON "PricingRule"("startsAt", "endsAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PricingRule_activityId_fkey') THEN
    ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorRole" "UserRole",
ADD COLUMN     "afterState" JSONB,
ADD COLUMN     "beforeState" JSONB,
ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationRole" "OrganizationRole";

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "visibility" "FileVisibility" NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "VendorDocumentType" NOT NULL,
    "currentStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDocumentVersion" (
    "id" TEXT NOT NULL,
    "vendorDocumentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "status" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_tenantId_visibility_idx" ON "FileAsset"("tenantId", "visibility");

-- CreateIndex
CREATE INDEX "FileAsset_purpose_entityId_idx" ON "FileAsset"("purpose", "entityId");

-- CreateIndex
CREATE INDEX "FileAsset_createdAt_idx" ON "FileAsset"("createdAt");

-- CreateIndex
CREATE INDEX "VendorDocument_tenantId_currentStatus_idx" ON "VendorDocument"("tenantId", "currentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDocument_tenantId_type_key" ON "VendorDocument"("tenantId", "type");

-- CreateIndex
CREATE INDEX "VendorDocumentVersion_vendorDocumentId_status_idx" ON "VendorDocumentVersion"("vendorDocumentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDocumentVersion_vendorDocumentId_versionNumber_key" ON "VendorDocumentVersion"("vendorDocumentId", "versionNumber");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_tenantId_createdAt_idx" ON "OutboxEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_vendorDocumentId_fkey" FOREIGN KEY ("vendorDocumentId") REFERENCES "VendorDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

