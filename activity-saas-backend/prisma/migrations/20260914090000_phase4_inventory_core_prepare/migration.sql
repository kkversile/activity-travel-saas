-- CreateEnum
CREATE TYPE "OperatingModel" AS ENUM ('ALL_DAY', 'FIXED_SLOT', 'MULTIPLE_SLOTS', 'DATE_CAPACITY', 'ON_REQUEST_DATE');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CapacityUnit" AS ENUM ('PERSON', 'BOOKING', 'UNIT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED', 'BLACKOUT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleExceptionType" AS ENUM ('BLACKOUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "InventoryHoldStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryAllocationStatus" AS ENUM ('CONFIRMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('VEHICLE', 'GUIDE', 'BOAT', 'EQUIPMENT', 'INSTRUCTOR', 'VENUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ResourceAllocationMode" AS ENUM ('EXCLUSIVE', 'SHARED', 'CAPACITY');

-- CreateTable
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "scheduleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "operatingModel" "OperatingModel",
    "timezone" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "operatingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacityUnit" "CapacityUnit" NOT NULL,
    "defaultCapacity" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSlotTemplate" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "slotCode" TEXT NOT NULL,
    "label" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSlotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlanSchedule" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlanSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "slotTemplateId" TEXT,
    "type" "ScheduleExceptionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "exceptionKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSession" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "slotTemplateId" TEXT,
    "serviceDate" DATE NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "localStartTime" TEXT,
    "localEndTime" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "totalCapacity" INTEGER NOT NULL,
    "blockedCapacity" INTEGER NOT NULL DEFAULT 0,
    "heldCapacity" INTEGER NOT NULL DEFAULT 0,
    "confirmedCapacity" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryHold" (
    "id" TEXT NOT NULL,
    "inventoryStateId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "referenceKey" TEXT,
    "bookingId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAllocation" (
    "id" TEXT NOT NULL,
    "inventoryStateId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryAllocationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "referenceKey" TEXT,
    "bookingId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "allocationMode" "ResourceAllocationMode" NOT NULL,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleResourceRequirement" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "specificResourceId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "requirementKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleResourceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionResourceAllocation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionResourceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleTemplate_variantId_status_idx" ON "ScheduleTemplate"("variantId", "status");

-- CreateIndex
CREATE INDEX "ScheduleTemplate_variantId_effectiveFrom_effectiveTo_idx" ON "ScheduleTemplate"("variantId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTemplate_variantId_scheduleCode_key" ON "ScheduleTemplate"("variantId", "scheduleCode");

-- CreateIndex
CREATE INDEX "ScheduleSlotTemplate_scheduleTemplateId_active_rank_idx" ON "ScheduleSlotTemplate"("scheduleTemplateId", "active", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSlotTemplate_scheduleTemplateId_slotCode_key" ON "ScheduleSlotTemplate"("scheduleTemplateId", "slotCode");

-- CreateIndex
CREATE INDEX "RatePlanSchedule_scheduleTemplateId_active_idx" ON "RatePlanSchedule"("scheduleTemplateId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanSchedule_ratePlanId_scheduleTemplateId_key" ON "RatePlanSchedule"("ratePlanId", "scheduleTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleException_exceptionKey_key" ON "ScheduleException"("exceptionKey");

-- CreateIndex
CREATE INDEX "ScheduleException_scheduleTemplateId_serviceDate_slotTempla_idx" ON "ScheduleException"("scheduleTemplateId", "serviceDate", "slotTemplateId");

-- CreateIndex
CREATE INDEX "ServiceSession_serviceDate_status_idx" ON "ServiceSession"("serviceDate", "status");

-- CreateIndex
CREATE INDEX "ServiceSession_scheduleTemplateId_serviceDate_idx" ON "ServiceSession"("scheduleTemplateId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSession_scheduleTemplateId_serviceDate_sessionKey_key" ON "ServiceSession"("scheduleTemplateId", "serviceDate", "sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryState_sessionId_key" ON "InventoryState"("sessionId");

-- CreateIndex
CREATE INDEX "InventoryHold_inventoryStateId_status_idx" ON "InventoryHold"("inventoryStateId", "status");

-- CreateIndex
CREATE INDEX "InventoryHold_inventoryStateId_referenceKey_idx" ON "InventoryHold"("inventoryStateId", "referenceKey");

-- CreateIndex
CREATE INDEX "InventoryHold_status_expiresAt_idx" ON "InventoryHold"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "InventoryAllocation_inventoryStateId_status_idx" ON "InventoryAllocation"("inventoryStateId", "status");

-- CreateIndex
CREATE INDEX "InventoryAllocation_inventoryStateId_referenceKey_idx" ON "InventoryAllocation"("inventoryStateId", "referenceKey");

-- CreateIndex
CREATE INDEX "Resource_tenantId_active_type_idx" ON "Resource"("tenantId", "active", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_tenantId_resourceCode_key" ON "Resource"("tenantId", "resourceCode");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleResourceRequirement_requirementKey_key" ON "ScheduleResourceRequirement"("requirementKey");

-- CreateIndex
CREATE INDEX "ScheduleResourceRequirement_scheduleTemplateId_resourceType_idx" ON "ScheduleResourceRequirement"("scheduleTemplateId", "resourceType");

-- CreateIndex
CREATE INDEX "SessionResourceAllocation_resourceId_sessionId_idx" ON "SessionResourceAllocation"("resourceId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionResourceAllocation_sessionId_resourceId_key" ON "SessionResourceAllocation"("sessionId", "resourceId");

-- RenameForeignKey
ALTER TABLE "Product" RENAME CONSTRAINT "Product_currentRevisionId_productId_fkey" TO "Product_currentRevisionId_id_fkey";

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlotTemplate" ADD CONSTRAINT "ScheduleSlotTemplate_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanSchedule" ADD CONSTRAINT "RatePlanSchedule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanSchedule" ADD CONSTRAINT "RatePlanSchedule_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_slotTemplateId_fkey" FOREIGN KEY ("slotTemplateId") REFERENCES "ScheduleSlotTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSession" ADD CONSTRAINT "ServiceSession_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSession" ADD CONSTRAINT "ServiceSession_slotTemplateId_fkey" FOREIGN KEY ("slotTemplateId") REFERENCES "ScheduleSlotTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryState" ADD CONSTRAINT "InventoryState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ServiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_inventoryStateId_fkey" FOREIGN KEY ("inventoryStateId") REFERENCES "InventoryState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_inventoryStateId_fkey" FOREIGN KEY ("inventoryStateId") REFERENCES "InventoryState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleResourceRequirement" ADD CONSTRAINT "ScheduleResourceRequirement_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionResourceAllocation" ADD CONSTRAINT "SessionResourceAllocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ServiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionResourceAllocation" ADD CONSTRAINT "SessionResourceAllocation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CommercialRule_scope_lookup_idx" RENAME TO "CommercialRule_scopeType_vendorTenantId_productId_variantId_idx";

-- Inventory counters are monotonic non-negative buckets. Available capacity is
-- deliberately derived at read time; it is never stored as a mutable column.
ALTER TABLE "InventoryState"
  ADD CONSTRAINT "InventoryState_nonnegative_check"
  CHECK ("totalCapacity" >= 0 AND "blockedCapacity" >= 0 AND "heldCapacity" >= 0 AND "confirmedCapacity" >= 0),
  ADD CONSTRAINT "InventoryState_capacity_balance_check"
  CHECK ("totalCapacity" >= "blockedCapacity" + "heldCapacity" + "confirmedCapacity");

ALTER TABLE "InventoryHold"
  ADD CONSTRAINT "InventoryHold_quantity_positive_check" CHECK ("quantity" > 0);

ALTER TABLE "InventoryAllocation"
  ADD CONSTRAINT "InventoryAllocation_quantity_positive_check" CHECK ("quantity" > 0);

ALTER TABLE "Resource"
  ADD CONSTRAINT "Resource_capacity_positive_when_bounded_check"
  CHECK ("allocationMode" NOT IN ('SHARED', 'CAPACITY') OR ("capacity" IS NOT NULL AND "capacity" > 0));

ALTER TABLE "ScheduleResourceRequirement"
  ADD CONSTRAINT "ScheduleResourceRequirement_quantity_positive_check" CHECK ("quantity" > 0);

ALTER TABLE "SessionResourceAllocation"
  ADD CONSTRAINT "SessionResourceAllocation_quantity_positive_check" CHECK ("quantity" > 0);
