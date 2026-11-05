-- Preserve the prototype's separate payout (PO) and payout-batch (PB) formats.
UPDATE "PublicIdentifier"
SET "publicCode" = 'TMP-SETTLEMENT-' || UPPER("entityId"), "updatedAt" = CURRENT_TIMESTAMP
WHERE "entityType" = 'SETTLEMENT_BATCH';

WITH ranked AS (
  SELECT b."id", b."createdAt", ROW_NUMBER() OVER (PARTITION BY (b."createdAt" AT TIME ZONE 'UTC')::DATE ORDER BY b."createdAt", b."id") AS ordinal
  FROM "SettlementBatch" b
), formatted AS (
  SELECT r."id", 'PB-' || TO_CHAR(r."createdAt" AT TIME ZONE 'UTC', 'YYYYMMDD') || CASE WHEN r.ordinal = 1 THEN '' ELSE '-' || LPAD((r.ordinal - 1)::TEXT, 2, '0') END AS code
  FROM ranked r
)
UPDATE "PublicIdentifier" p SET "publicCode" = f.code, "updatedAt" = CURRENT_TIMESTAMP
FROM formatted f WHERE p."entityType" = 'SETTLEMENT_BATCH' AND p."entityId" = f."id";

UPDATE "PublicIdentifier"
SET "publicCode" = 'TMP-PAYOUT-' || UPPER("entityId"), "updatedAt" = CURRENT_TIMESTAMP
WHERE "entityType" = 'PAYOUT';

WITH ranked AS (
  SELECT p."id", p."tenantId", p."createdAt", v."publicCode" AS vendor_code,
    ROW_NUMBER() OVER (PARTITION BY p."tenantId", TO_CHAR(p."createdAt" AT TIME ZONE 'UTC', 'IYIW') ORDER BY p."createdAt", p."id") AS ordinal
  FROM "Payout" p
  LEFT JOIN "PublicIdentifier" v ON v."entityType" = 'VENDOR' AND v."entityId" = p."tenantId"
  WHERE p."recordType" = 'CANONICAL'
), formatted AS (
  SELECT r."id", 'PO-' || COALESCE(SUBSTRING(r.vendor_code FROM '^SUP-([0-9]{4})$'), '0000') || '-' || RIGHT(TO_CHAR(r."createdAt" AT TIME ZONE 'UTC', 'IYIW'), 4) || CASE WHEN r.ordinal = 1 THEN '' ELSE '-' || LPAD((r.ordinal - 1)::TEXT, 2, '0') END AS code
  FROM ranked r
)
UPDATE "PublicIdentifier" p SET "publicCode" = f.code, "updatedAt" = CURRENT_TIMESTAMP
FROM formatted f WHERE p."entityType" = 'PAYOUT' AND p."entityId" = f."id";
