CREATE TYPE "FulfilmentMode" AS ENUM ('AUTO', 'AFTER_FULFILMENT', 'PNR_ONLY', 'TICKET_QR');
CREATE TYPE "FulfilmentEvidenceKind" AS ENUM ('PNR_REFERENCE', 'TICKET_FILE', 'QR_TOKEN', 'SUPPLIER_ATTACHMENT');
CREATE TYPE "EvidenceMatchMode" AS ENUM ('ALL', 'ANY');
CREATE TYPE "BookingFulfilmentStatus" AS ENUM ('AWAITING_CONFIRMATION', 'WAITING_EVIDENCE', 'READY_FOR_VOUCHER', 'VOUCHER_READY', 'VOIDED');
CREATE TYPE "VoucherGenerationStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'PROCESSING', 'FAILED', 'SUCCEEDED');
CREATE TYPE "FulfilmentEvidenceStatus" AS ENUM ('CURRENT', 'SUPERSEDED', 'ARCHIVED');
CREATE TYPE "VoucherVersionStatus" AS ENUM ('CURRENT', 'SUPERSEDED', 'VOID');
CREATE TYPE "VoucherShareChannel" AS ENUM ('DOWNLOAD', 'EMAIL', 'WHATSAPP');
CREATE TYPE "VoucherShareStatus" AS ENUM ('RECORDED', 'QUEUED', 'FAILED');
CREATE TYPE "RedemptionMethod" AS ENUM ('MANUAL');

ALTER TABLE "BookingSnapshot" ADD COLUMN "fulfilmentPolicySnapshot" JSONB;

CREATE TABLE "ProductFulfilmentPolicy" (
  "id" TEXT NOT NULL,
  "productRevisionId" TEXT NOT NULL,
  "mode" "FulfilmentMode",
  "requiredEvidenceKinds" "FulfilmentEvidenceKind"[] DEFAULT ARRAY[]::"FulfilmentEvidenceKind"[],
  "evidenceMatchMode" "EvidenceMatchMode" NOT NULL DEFAULT 'ALL',
  "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
  "emergencyContactName" TEXT,
  "emergencyContactPhone" TEXT,
  "emergencyContactEmail" TEXT,
  "operationsContactName" TEXT,
  "operationsContactPhone" TEXT,
  "operationsContactEmail" TEXT,
  "voucherNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "migrationMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFulfilmentPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingFulfilment" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "mode" "FulfilmentMode" NOT NULL,
  "status" "BookingFulfilmentStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
  "generationStatus" "VoucherGenerationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "generationAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastGenerationError" TEXT,
  "generationRequestedAt" TIMESTAMP(3),
  "generatedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingFulfilment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FulfilmentEvidence" (
  "id" TEXT NOT NULL,
  "fulfilmentId" TEXT NOT NULL,
  "kind" "FulfilmentEvidenceKind" NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "FulfilmentEvidenceStatus" NOT NULL DEFAULT 'CURRENT',
  "referenceValue" TEXT,
  "fileAssetId" TEXT,
  "travellerVisible" BOOLEAN NOT NULL DEFAULT false,
  "replacesEvidenceId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "FulfilmentEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoucherVersion" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "fulfilmentId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "VoucherVersionStatus" NOT NULL DEFAULT 'CURRENT',
  "voucherCode" TEXT NOT NULL,
  "fileAssetId" TEXT NOT NULL,
  "sourceEvidenceFingerprint" TEXT NOT NULL,
  "contentFingerprint" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "generatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoucherVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoucherShareEvent" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "fulfilmentId" TEXT NOT NULL,
  "voucherVersionId" TEXT NOT NULL,
  "channel" "VoucherShareChannel" NOT NULL,
  "status" "VoucherShareStatus" NOT NULL DEFAULT 'RECORDED',
  "recipientMasked" TEXT,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoucherShareEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingRedemption" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "fulfilmentId" TEXT NOT NULL,
  "voucherVersionId" TEXT,
  "method" "RedemptionMethod" NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductFulfilmentPolicy_productRevisionId_key" ON "ProductFulfilmentPolicy"("productRevisionId");
CREATE UNIQUE INDEX "BookingFulfilment_bookingId_key" ON "BookingFulfilment"("bookingId");
CREATE INDEX "BookingFulfilment_status_generationStatus_updatedAt_idx" ON "BookingFulfilment"("status", "generationStatus", "updatedAt");
CREATE UNIQUE INDEX "FulfilmentEvidence_fulfilmentId_kind_versionNumber_key" ON "FulfilmentEvidence"("fulfilmentId", "kind", "versionNumber");
CREATE INDEX "FulfilmentEvidence_fulfilmentId_kind_status_idx" ON "FulfilmentEvidence"("fulfilmentId", "kind", "status");
CREATE UNIQUE INDEX "VoucherVersion_voucherCode_key" ON "VoucherVersion"("voucherCode");
CREATE UNIQUE INDEX "VoucherVersion_bookingId_versionNumber_key" ON "VoucherVersion"("bookingId", "versionNumber");
CREATE INDEX "VoucherVersion_bookingId_status_idx" ON "VoucherVersion"("bookingId", "status");
CREATE INDEX "VoucherVersion_fulfilmentId_status_idx" ON "VoucherVersion"("fulfilmentId", "status");
CREATE INDEX "VoucherShareEvent_bookingId_createdAt_idx" ON "VoucherShareEvent"("bookingId", "createdAt");
CREATE INDEX "VoucherShareEvent_voucherVersionId_channel_idx" ON "VoucherShareEvent"("voucherVersionId", "channel");
CREATE UNIQUE INDEX "BookingRedemption_bookingId_key" ON "BookingRedemption"("bookingId");
CREATE UNIQUE INDEX "BookingRedemption_fulfilmentId_key" ON "BookingRedemption"("fulfilmentId");
CREATE UNIQUE INDEX "BookingRedemption_voucherVersionId_key" ON "BookingRedemption"("voucherVersionId");
CREATE UNIQUE INDEX "VoucherVersion_one_current_per_booking" ON "VoucherVersion"("bookingId") WHERE "status" = 'CURRENT';
CREATE UNIQUE INDEX "FulfilmentEvidence_one_current_per_kind" ON "FulfilmentEvidence"("fulfilmentId", "kind") WHERE "status" = 'CURRENT';

ALTER TABLE "ProductFulfilmentPolicy" ADD CONSTRAINT "ProductFulfilmentPolicy_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingFulfilment" ADD CONSTRAINT "BookingFulfilment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfilmentEvidence" ADD CONSTRAINT "FulfilmentEvidence_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FulfilmentEvidence" ADD CONSTRAINT "FulfilmentEvidence_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherVersion" ADD CONSTRAINT "VoucherVersion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherVersion" ADD CONSTRAINT "VoucherVersion_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherVersion" ADD CONSTRAINT "VoucherVersion_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherShareEvent" ADD CONSTRAINT "VoucherShareEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherShareEvent" ADD CONSTRAINT "VoucherShareEvent_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherShareEvent" ADD CONSTRAINT "VoucherShareEvent_voucherVersionId_fkey" FOREIGN KEY ("voucherVersionId") REFERENCES "VoucherVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingRedemption" ADD CONSTRAINT "BookingRedemption_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingRedemption" ADD CONSTRAINT "BookingRedemption_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingRedemption" ADD CONSTRAINT "BookingRedemption_voucherVersionId_fkey" FOREIGN KEY ("voucherVersionId") REFERENCES "VoucherVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
