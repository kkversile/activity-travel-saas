-- Phase 4.1: final inventory, schedule and resource integrity corrections.
CREATE TYPE "ResourceAllocationStatus" AS ENUM ('ACTIVE', 'RELEASED');

ALTER TABLE "InventoryAllocation" ADD COLUMN "sourceHoldId" TEXT;
ALTER TABLE "ScheduleResourceRequirement"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ScheduleTemplate"
  ADD COLUMN "capacityUnitReviewRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionResourceAllocation"
  ADD COLUMN "releasedAt" TIMESTAMP(3),
  ADD COLUMN "status" "ResourceAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "InventoryAllocation_sourceHoldId_key"
  ON "InventoryAllocation"("sourceHoldId");
CREATE UNIQUE INDEX "InventoryHold_state_reference_nonnull_key"
  ON "InventoryHold"("inventoryStateId", "referenceKey")
  WHERE "referenceKey" IS NOT NULL;
CREATE UNIQUE INDEX "InventoryAllocation_state_reference_nonnull_key"
  ON "InventoryAllocation"("inventoryStateId", "referenceKey")
  WHERE "referenceKey" IS NOT NULL;

ALTER TABLE "InventoryAllocation"
  ADD CONSTRAINT "InventoryAllocation_sourceHoldId_fkey"
  FOREIGN KEY ("sourceHoldId") REFERENCES "InventoryHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleResourceRequirement"
  ADD CONSTRAINT "ScheduleResourceRequirement_specificResourceId_fkey"
  FOREIGN KEY ("specificResourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AvailabilitySlot-derived schedules were created from legacy capacity semantics
-- and must be explicitly reviewed before a later booking/eligibility phase.
UPDATE "ScheduleTemplate"
SET "capacityUnitReviewRequired" = true
WHERE COALESCE("sourcePayload"->>'migratedFrom', '') = 'AvailabilitySlot'
   OR ("sourcePayload"->'migrationReviewRequired') ? 'CAPACITY_UNIT_INFERRED';

