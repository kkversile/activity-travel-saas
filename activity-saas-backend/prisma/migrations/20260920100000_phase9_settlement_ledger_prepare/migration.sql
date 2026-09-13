-- Phase 9 prepare: add canonical finance dimensions and settlement tables.
CREATE TYPE "PayoutRecordType" AS ENUM ('LEGACY', 'CANONICAL');
CREATE TYPE "PaymentCollectionMode" AS ENUM ('UNCONFIGURED', 'VOYA_COLLECTS', 'AGENT_COLLECTS', 'VENDOR_COLLECTS', 'EXTERNAL');
CREATE TYPE "SettlementCycleMode" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY', 'POST_SERVICE');
CREATE TYPE "SettlementEligibilityTrigger" AS ENUM ('BOOKING_CONFIRMED', 'SERVICE_REDEEMED', 'SERVICE_COMPLETED');
CREATE TYPE "SettlementHoldScope" AS ENUM ('VENDOR', 'BOOKING', 'FINANCIAL_EVENT');
CREATE TYPE "SettlementHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "SettlementBatchStatus" AS ENUM ('READY_FOR_PAYOUT', 'PAYOUT_BLOCKED', 'RELEASED', 'RECONCILIATION_REQUIRED', 'RECONCILED', 'CLOSED_NO_PAYOUT');
CREATE TYPE "SettlementAllocationStatus" AS ENUM ('ALLOCATED', 'RELEASED', 'SETTLED');
CREATE TYPE "PayoutAttemptStatus" AS ENUM ('RELEASE_RECORDED', 'FAILED');
ALTER TYPE "FinancialEventType" ADD VALUE IF NOT EXISTS 'VENDOR_ADJUSTMENT';
ALTER TYPE "FinancialEventType" ADD VALUE IF NOT EXISTS 'PROMOTION_FUNDED';
ALTER TYPE "FinancialEventType" ADD VALUE IF NOT EXISTS 'SETTLEMENT_BATCH_CREATED';
ALTER TYPE "FinancialEventType" ADD VALUE IF NOT EXISTS 'PAYOUT_RELEASED';
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'READY_TO_RELEASE';
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'RELEASED';
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'RELEASE_FAILED';
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'RECONCILIATION_REQUIRED';
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'RECONCILED';

ALTER TABLE "FinancialEvent" ALTER COLUMN "bookingId" DROP NOT NULL;
ALTER TABLE "FinancialEvent" ADD COLUMN "vendorTenantId" TEXT;
ALTER TABLE "FinancialEvent" ADD COLUMN "agentTenantId" TEXT;
ALTER TABLE "FinancialEvent" ADD COLUMN "settlementBatchId" TEXT;
ALTER TABLE "FinancialEvent" ADD COLUMN "payoutId" TEXT;
ALTER TABLE "FinancialEvent" ADD COLUMN "vendorAmount" DECIMAL(18,4);
UPDATE "FinancialEvent" AS fe SET "vendorTenantId" = b."vendorTenantId", "agentTenantId" = b."agentTenantId" FROM "Booking" AS b WHERE fe."bookingId" = b."id";
UPDATE "FinancialEvent" AS fe SET "vendorAmount" = e."vendorPayable" FROM "BookingEconomicsSnapshot" AS e WHERE fe."bookingId" = e."bookingId" AND fe."type" = 'BOOKING_CONFIRMED';

ALTER TABLE "Payout" ALTER COLUMN "amount" TYPE DECIMAL(18,4);
ALTER TABLE "Payout" ADD COLUMN "recordType" "PayoutRecordType" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "Payout" ADD COLUMN "settlementBatchId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Payout" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Payout" ADD COLUMN "releasedAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "releasedById" TEXT;
ALTER TABLE "Payout" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "Payout" ADD COLUMN "reconciledAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "reconciledById" TEXT;
ALTER TABLE "Payout" ADD COLUMN "reconciledAmount" DECIMAL(18,4);
ALTER TABLE "Payout" ADD COLUMN "reconciliationReference" TEXT;
ALTER TABLE "Payout" ADD COLUMN "reconciliationNote" TEXT;

CREATE TABLE "FinanceConfiguration" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "paymentCollectionMode" "PaymentCollectionMode" NOT NULL DEFAULT 'UNCONFIGURED',
  "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VendorSettlementPolicy" (
  "id" TEXT NOT NULL,
  "vendorTenantId" TEXT NOT NULL,
  "cycleMode" "SettlementCycleMode" NOT NULL DEFAULT 'MANUAL',
  "eligibilityTrigger" "SettlementEligibilityTrigger" NOT NULL DEFAULT 'SERVICE_COMPLETED',
  "settlementDelayDays" INTEGER NOT NULL DEFAULT 0,
  "weeklyDay" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorSettlementPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CancellationVendorSettlementResolution" (
  "id" TEXT NOT NULL,
  "cancellationId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "vendorTenantId" TEXT NOT NULL,
  "originalVendorPayable" DECIMAL(18,4) NOT NULL,
  "finalVendorPayable" DECIMAL(18,4) NOT NULL,
  "vendorAdjustmentAmount" DECIMAL(18,4) NOT NULL,
  "financialEventId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "resolvedById" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CancellationVendorSettlementResolution_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SettlementHold" (
  "id" TEXT NOT NULL,
  "vendorTenantId" TEXT NOT NULL,
  "scope" "SettlementHoldScope" NOT NULL,
  "bookingId" TEXT,
  "financialEventId" TEXT,
  "status" "SettlementHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedById" TEXT,
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  CONSTRAINT "SettlementHold_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SettlementBatch" (
  "id" TEXT NOT NULL,
  "batchCode" TEXT NOT NULL,
  "vendorTenantId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "policySnapshot" JSONB NOT NULL,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "status" "SettlementBatchStatus" NOT NULL,
  "grossBookingValue" DECIMAL(18,4) NOT NULL,
  "vendorBasePayable" DECIMAL(18,4) NOT NULL,
  "adjustmentTotal" DECIMAL(18,4) NOT NULL,
  "netPayable" DECIMAL(18,4) NOT NULL,
  "eventCount" INTEGER NOT NULL,
  "lineCount" INTEGER NOT NULL,
  "previewFingerprint" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SettlementLine" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "bookingId" TEXT,
  "lineType" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "grossBookingValue" DECIMAL(18,4) NOT NULL,
  "vendorPayableBase" DECIMAL(18,4) NOT NULL,
  "adjustmentAmount" DECIMAL(18,4) NOT NULL,
  "netVendorPayable" DECIMAL(18,4) NOT NULL,
  "taxInformational" DECIMAL(18,4) NOT NULL,
  "components" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SettlementEventAllocation" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "financialEventId" TEXT NOT NULL,
  "status" "SettlementAllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "SettlementEventAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PayoutAttempt" (
  "id" TEXT NOT NULL,
  "payoutId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "PayoutAttemptStatus" NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "externalReference" TEXT,
  "failureReason" TEXT,
  "actorUserId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);
