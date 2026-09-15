-- VOYA live-demo read-only evidence SQL
-- Verified against the configured demo PostgreSQL database.
-- No credentials are included.

-- 1) Product -> Variant -> Rate Plan relationship
SELECT p."productCode", pr."productName", pr."versionNumber" AS "productRevisionVersion",
       v."variantCode", v."name" AS "variantName",
       r."ratePlanCode", r."name" AS "ratePlanName", r."status" AS "ratePlanStatus",
       cv."versionNumber" AS "activeCommercialVersion", cv."status" AS "commercialStatus"
FROM "Product" p
JOIN "ProductRevision" pr ON pr."id" = p."currentRevisionId"
JOIN "ProductVariant" v ON v."productId" = p."id"
JOIN "RatePlan" r ON r."variantId" = v."id"
LEFT JOIN "RatePlanCommercialVersion" cv
  ON cv."ratePlanId" = r."id" AND cv."status" = 'ACTIVE'
WHERE p."productCode" = 'ACT-F7C5F1E9'
ORDER BY v."variantCode", r."ratePlanCode";

-- 2) ServiceSession + InventoryState and canonical available capacity
SELECT b."bookingCode", s."serviceDate", s."sessionKey",
       s."localStartTime", s."localEndTime", s."status" AS "sessionStatus",
       i."totalCapacity", i."blockedCapacity", i."heldCapacity", i."confirmedCapacity",
       (i."totalCapacity" - i."blockedCapacity" - i."heldCapacity" - i."confirmedCapacity") AS "availableCapacity"
FROM "Booking" b
JOIN "ServiceSession" s ON s."id" = b."sessionId"
JOIN "InventoryState" i ON i."sessionId" = s."id"
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12';

-- 3) Exact Booking by bookingCode
SELECT b."id", b."bookingCode", b."recordType", b."status", b."bookingMode",
       b."serviceDate", b."amount", b."currency", b."capacityConsumption"
FROM "Booking" b
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12';

-- 4) BookingSnapshot for that booking
SELECT s."bookingId", s."productRevisionId", s."scheduleTemplateId", s."sessionId",
       s."capacityUnit", s."capacityConsumption", s."bookingMode",
       s."cancellationPolicyFingerprint"
FROM "BookingSnapshot" s
JOIN "Booking" b ON b."id" = s."bookingId"
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12';

-- 5) BookingEconomicsSnapshot for that booking
SELECT e."bookingId", e."ratePlanCommercialVersionId",
       e."supplierCommercialModel", e."supplierGrossBasis", e."vendorPayable",
       e."voyaRevenueModel", e."voyaRevenue", e."agentCommercialModel",
       e."agentFacingAmount", e."taxMode", e."taxAmount",
       e."promotionAmount", e."finalAmount"
FROM "BookingEconomicsSnapshot" e
JOIN "Booking" b ON b."id" = e."bookingId"
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12';

-- 6) InventoryHold / InventoryAllocation for that booking
SELECT 'HOLD' AS "recordType", h."id", h."quantity",
       CAST(h."status" AS text) AS "status", h."bookingId", h."referenceKey"
FROM "InventoryHold" h
JOIN "Booking" b ON b."id" = h."bookingId"
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12'
UNION ALL
SELECT 'ALLOCATION' AS "recordType", a."id", a."quantity",
       CAST(a."status" AS text) AS "status", a."bookingId", a."referenceKey"
FROM "InventoryAllocation" a
JOIN "Booking" b ON b."id" = a."bookingId"
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12';

-- 7) BookingEvent for that booking
SELECT e."eventType", CAST(e."fromStatus" AS text) AS "fromStatus",
       CAST(e."toStatus" AS text) AS "toStatus", CAST(e."actorRole" AS text) AS "actorRole",
       e."createdAt"
FROM "BookingEvent" e
JOIN "Booking" b ON b."id" = e."bookingId"
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12'
ORDER BY e."createdAt";

-- 8) OutboxEvent for that booking
SELECT o."eventType", o."aggregateType", o."aggregateId",
       CAST(o."status" AS text) AS "status"
FROM "OutboxEvent" o
JOIN "Booking" b ON b."id" = o."aggregateId"
WHERE b."bookingCode" = 'VY-8DC3C3CC7D12'
ORDER BY o."createdAt";
