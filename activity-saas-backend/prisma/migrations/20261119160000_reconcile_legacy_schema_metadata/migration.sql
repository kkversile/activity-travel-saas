-- Forward-only alignment of the historical live schema and frozen fresh baseline.
-- No business row, financial amount, approval or encryption key is rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL TIME ZONE 'UTC';

-- Match historical PostgreSQL-truncated names without dropping indexes.
DO $$ BEGIN
  IF to_regclass('public."AgentWalletCreditApprovalRequest_agentTenantId_status_createdAt"') IS NULL THEN
    IF to_regclass('public."AgentWalletCreditApprovalRequest_agentTenantId_status_creat_idx"') IS NOT NULL THEN
      ALTER INDEX "AgentWalletCreditApprovalRequest_agentTenantId_status_creat_idx" RENAME TO "AgentWalletCreditApprovalRequest_agentTenantId_status_createdAt";
    ELSE
      CREATE INDEX "AgentWalletCreditApprovalRequest_agentTenantId_status_createdAt" ON "AgentWalletCreditApprovalRequest" ("agentTenantId", "status", "createdAt");
    END IF;
  END IF;
  IF to_regclass('public."BookingFulfilment_status_generationStatus_generationLeaseExpire"') IS NULL THEN
    IF to_regclass('public."BookingFulfilment_status_generationStatus_generationLeaseEx_idx"') IS NOT NULL THEN
      ALTER INDEX "BookingFulfilment_status_generationStatus_generationLeaseEx_idx" RENAME TO "BookingFulfilment_status_generationStatus_generationLeaseExpire";
    ELSE
      CREATE INDEX "BookingFulfilment_status_generationStatus_generationLeaseExpire" ON "BookingFulfilment" ("status", "generationStatus", "generationLeaseExpiresAt", "generationRequestedAt");
    END IF;
  END IF;
  IF to_regclass('public."ExperienceSelectionLock_agentTenantId_searchAttemptId_experienc"') IS NULL THEN
    IF to_regclass('public."ExperienceSelectionLock_agentTenantId_searchAttemptId_exper_key"') IS NOT NULL THEN
      ALTER INDEX "ExperienceSelectionLock_agentTenantId_searchAttemptId_exper_key" RENAME TO "ExperienceSelectionLock_agentTenantId_searchAttemptId_experienc";
    ELSE
      CREATE UNIQUE INDEX "ExperienceSelectionLock_agentTenantId_searchAttemptId_experienc" ON "ExperienceSelectionLock" ("agentTenantId", "searchAttemptId", "experienceMasterId");
    END IF;
  END IF;
  IF to_regclass('public."SupplierQualitySnapshot_vendorTenantId_windowStart_windowEnd_id"') IS NULL THEN
    IF to_regclass('public."SupplierQualitySnapshot_vendorTenantId_windowStart_windowEn_idx"') IS NOT NULL THEN
      ALTER INDEX "SupplierQualitySnapshot_vendorTenantId_windowStart_windowEn_idx" RENAME TO "SupplierQualitySnapshot_vendorTenantId_windowStart_windowEnd_id";
    ELSE
      CREATE INDEX "SupplierQualitySnapshot_vendorTenantId_windowStart_windowEnd_id" ON "SupplierQualitySnapshot" ("vendorTenantId", "windowStart", "windowEnd");
    END IF;
  END IF;
END $$;

-- Preserve historical read indexes on existing and fresh installations.
CREATE INDEX IF NOT EXISTS "BookingFulfilment_status_generationStatus_updatedAt_idx" ON "BookingFulfilment" ("status", "generationStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "ExperienceOfferPlacement_experienceMasterId_pinnedUntil_idx" ON "ExperienceOfferPlacement" ("experienceMasterId", "pinnedUntil");
CREATE INDEX IF NOT EXISTS "FinancialEvent_vendorTenantId_currency_status_idx" ON "FinancialEvent" ("vendorTenantId", "currency", "status");
CREATE INDEX IF NOT EXISTS "InventoryAllocation_bookingId_status_idx" ON "InventoryAllocation" ("bookingId", "status");
CREATE INDEX IF NOT EXISTS "InventoryHold_bookingId_status_idx" ON "InventoryHold" ("bookingId", "status");
CREATE INDEX IF NOT EXISTS "ProductChannelMapping_channelId_activatedAt_idx" ON "ProductChannelMapping" ("channelId", "activatedAt");
CREATE INDEX IF NOT EXISTS "ReportSchedule_tenantId_outletId_status_idx" ON "ReportSchedule" ("tenantId", "outletId", "status");
CREATE INDEX IF NOT EXISTS "Resource_tenantId_active_type_idx" ON "Resource" ("tenantId", "active", "type");
CREATE INDEX IF NOT EXISTS "SettlementBatch_vendorTenantId_currency_status_idx" ON "SettlementBatch" ("vendorTenantId", "currency", "status");
CREATE INDEX IF NOT EXISTS "VariantChannelMapping_channelId_activatedAt_idx" ON "VariantChannelMapping" ("channelId", "activatedAt");
CREATE INDEX IF NOT EXISTS "VendorReportExport_tenantId_outletId_createdAt_idx" ON "VendorReportExport" ("tenantId", "outletId", "createdAt");
CREATE INDEX IF NOT EXISTS "VendorSettlementPolicy_vendorTenantId_active_idx" ON "VendorSettlementPolicy" ("vendorTenantId", "active");
CREATE INDEX IF NOT EXISTS "ExperienceOfferPlacement_experienceMasterId_priority_idx" ON "ExperienceOfferPlacement" ("experienceMasterId", "priority");

-- Existing duplicate policy versions require review, never silent deduplication.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "SupplierQualityPolicy" GROUP BY "versionNumber" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate supplier-quality versions require explicit review; no rows changed';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierQualityPolicy_versionNumber_key" ON "SupplierQualityPolicy" ("versionNumber");

-- Defaults affect future inserts; existing values remain untouched.
ALTER TABLE "PublicIdentifierSequence" ALTER COLUMN "lastValue" SET DEFAULT 0;
ALTER TABLE "CommercialGuardrailConfiguration" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DistributionProjectionCursor" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmailAuthChallenge" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PublicIdentifierSequence" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "VendorOnboardingApplication" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Live reviews already use timestamptz(6). Interpret timestamp(3) from the frozen
-- fresh baseline as UTC; never reinterpret an existing timestamptz value.
DO $$ DECLARE column_name text; BEGIN
  FOREACH column_name IN ARRAY ARRAY['reviewedAt','repliedAt','createdAt','updatedAt'] LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '"VendorReview"'::regclass AND attname = column_name AND atttypid = 'timestamp without time zone'::regtype AND NOT attisdropped) THEN
      EXECUTE format('ALTER TABLE "VendorReview" ALTER COLUMN %I TYPE timestamptz(6) USING %I AT TIME ZONE ''UTC''', column_name, column_name);
    END IF;
  END LOOP;
END $$;

-- Validate the restrictive reference before replacing the historical cascade.
-- This protects payout history without changing payments or collection policy.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Payout"'::regclass AND conname = 'Payout_tenantId_fkey' AND confdeltype <> 'r') THEN
    ALTER TABLE "Payout" ADD CONSTRAINT "Payout_tenantId_restrict_pending_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
    ALTER TABLE "Payout" VALIDATE CONSTRAINT "Payout_tenantId_restrict_pending_fkey";
    ALTER TABLE "Payout" DROP CONSTRAINT "Payout_tenantId_fkey";
    ALTER TABLE "Payout" RENAME CONSTRAINT "Payout_tenantId_restrict_pending_fkey" TO "Payout_tenantId_fkey";
  END IF;
END $$;
COMMIT;
