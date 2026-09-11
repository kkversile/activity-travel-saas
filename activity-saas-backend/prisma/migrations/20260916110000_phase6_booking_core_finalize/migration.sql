-- Phase 6 finalize: canonical integrity, lookup indexes, and legacy backfill.
UPDATE "Booking" SET "recordType" = 'LEGACY' WHERE "recordType" IS NULL;

DROP INDEX IF EXISTS "Booking_tenantId_status_idx";
DROP INDEX IF EXISTS "Booking_tenantId_serviceDate_idx";
CREATE UNIQUE INDEX "Booking_agentTenantId_idempotencyKey_key" ON "Booking"("agentTenantId", "idempotencyKey");
CREATE INDEX "Booking_vendorTenantId_status_idx" ON "Booking"("vendorTenantId", "status");
CREATE INDEX "Booking_agentTenantId_status_idx" ON "Booking"("agentTenantId", "status");
CREATE INDEX "Booking_sessionId_status_idx" ON "Booking"("sessionId", "status");
CREATE INDEX "Booking_confirmationDueAt_status_idx" ON "Booking"("confirmationDueAt", "status");
CREATE INDEX "Booking_vendorTenantId_serviceDate_idx" ON "Booking"("vendorTenantId", "serviceDate");
CREATE UNIQUE INDEX "ProductBookingQuestion_productRevisionId_code_key" ON "ProductBookingQuestion"("productRevisionId", "code");
CREATE INDEX "ProductBookingQuestion_productRevisionId_archivedAt_rank_idx" ON "ProductBookingQuestion"("productRevisionId", "archivedAt", "rank");
CREATE UNIQUE INDEX "BookingSnapshot_bookingId_key" ON "BookingSnapshot"("bookingId");
CREATE INDEX "BookingTraveller_bookingId_travellerType_idx" ON "BookingTraveller"("bookingId", "travellerType");
CREATE UNIQUE INDEX "BookingTraveller_bookingId_sequence_key" ON "BookingTraveller"("bookingId", "sequence");
CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");
CREATE INDEX "InventoryHold_bookingId_status_idx" ON "InventoryHold"("bookingId", "status");
CREATE INDEX "InventoryAllocation_bookingId_status_idx" ON "InventoryAllocation"("bookingId", "status");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_canonical_integrity_check" CHECK (
  "recordType" = 'LEGACY' OR (
    "agentTenantId" IS NOT NULL AND "agentUserId" IS NOT NULL AND
    "productRevisionId" IS NOT NULL AND "variantId" IS NOT NULL AND
    "ratePlanId" IS NOT NULL AND "sessionId" IS NOT NULL AND
    "bookingMode" IS NOT NULL AND "idempotencyKey" IS NOT NULL AND
    "requestFingerprint" IS NOT NULL AND "serviceTimezone" IS NOT NULL AND
    "capacityConsumption" IS NOT NULL
  )
);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_canonical_status_context_check" CHECK (
  "recordType" = 'LEGACY' OR "status" IN ('CONFIRMED', 'PENDING_VENDOR_CONFIRMATION', 'PENDING_MANUAL_REVIEW', 'VENDOR_REJECTED', 'MANUAL_REJECTED', 'CONFIRMATION_EXPIRED', 'FULFILLED', 'REDEEMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CHANGE_REQUESTED')
);
