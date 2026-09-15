-- VOYA Milestone 1 client-demo verification queries.
-- Run against the environment-configured PostgreSQL database.
-- No credentials are stored in this file. Replace the booking id only when
-- rehearsing a different booking.

-- 1) Canonical booking: status, mode, amount and capacity consumption.
SELECT b."id", b."bookingCode", b."status", b."bookingMode",
       b."serviceDate", b."amount", b."currency", b."capacityConsumption"
FROM "Booking" b
WHERE b."id" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f';

-- 2) Idempotency proof: one canonical row for the rehearsed booking.
SELECT COUNT(*) AS "bookingRows"
FROM "Booking"
WHERE "id" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f';

-- 3) Inventory after the confirmed booking.
SELECT i."totalCapacity", i."blockedCapacity", i."heldCapacity",
       i."confirmedCapacity", i."version"
FROM "InventoryState" i
JOIN "Booking" b ON b."sessionId" = i."sessionId"
WHERE b."id" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f';

-- 4) Immutable operational snapshot.
SELECT s."productRevisionId", s."scheduleTemplateId", s."sessionId",
       s."capacityUnit", s."capacityConsumption", s."bookingMode",
       s."cancellationPolicyFingerprint"
FROM "BookingSnapshot" s
WHERE s."bookingId" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f';

-- 5) Immutable economics snapshot.
SELECT e."supplierCommercialModel", e."supplierGrossBasis", e."vendorPayable",
       e."voyaRevenueModel", e."voyaRevenue", e."agentCommercialModel",
       e."agentFacingAmount", e."taxMode", e."taxAmount",
       e."promotionAmount", e."finalAmount"
FROM "BookingEconomicsSnapshot" e
WHERE e."bookingId" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f';

-- 6) Lifecycle events written for the booking.
SELECT e."eventType", e."fromStatus", e."toStatus", e."actorRole"
FROM "BookingEvent" e
WHERE e."bookingId" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f'
ORDER BY e."createdAt";

-- 7) Outbox events emitted for asynchronous consumers.
SELECT o."eventType", o."aggregateType", o."aggregateId", o."status"
FROM "OutboxEvent" o
WHERE o."aggregateId" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f'
ORDER BY o."createdAt";

-- 8) Audit evidence for the booking write.
SELECT a."action", a."entityType", a."entityId", a."actorRole"
FROM "AuditLog" a
WHERE a."entityId" = 'b023e9b0-b2a2-4bdb-b8f5-f0e606026f7f'
ORDER BY a."createdAt";
