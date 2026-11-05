ALTER TABLE "ExperienceSelectionRuleSet"
  ADD COLUMN "pendingConfiguration" JSONB,
  ADD COLUMN "pendingUpdatedById" TEXT,
  ADD COLUMN "pendingUpdatedAt" TIMESTAMP(3);

-- Older submissions overwrote the live configuration and changed its status,
-- which removed it from runtime selection. Preserve the available configuration
-- and restore the row to active while new proposals use the pending columns.
UPDATE "ExperienceSelectionRuleSet"
SET "status" = 'LIVE'
WHERE "status" = 'PENDING_APPROVAL';
