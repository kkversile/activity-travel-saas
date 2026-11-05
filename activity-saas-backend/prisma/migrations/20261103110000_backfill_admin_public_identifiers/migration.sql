-- Complete the public-ID families documented by the Admin prototype.
WITH source AS (
  SELECT u."id", u."createdAt", CASE WHEN u."role" IN ('ADMIN', 'SUPER_ADMIN') THEN 'STF-' WHEN u."role" = 'VENDOR' THEN 'VU-' WHEN u."role" = 'TRAVEL_AGENT' THEN 'AU-' END AS prefix
  FROM "User" u
  WHERE u."role" IN ('ADMIN', 'SUPER_ADMIN', 'VENDOR', 'TRAVEL_AGENT')
), missing AS (
  SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.prefix ORDER BY s."createdAt", s."id") AS ordinal
  FROM source s
  WHERE NOT EXISTS (SELECT 1 FROM "PublicIdentifier" p WHERE p."entityType" = 'USER' AND p."entityId" = s."id")
), maxima AS (
  SELECT prefix, COALESCE(MAX(regexp_replace("publicCode", '^.*-', '')::INTEGER), 0) AS current_max
  FROM "PublicIdentifier"
  CROSS JOIN (VALUES ('STF-'), ('VU-'), ('AU-')) AS prefixes(prefix)
  WHERE "entityType" = 'USER' AND "publicCode" LIKE prefix || '%' AND regexp_replace("publicCode", '^.*-', '') ~ '^[0-9]+$'
  GROUP BY prefix
)
INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, 'USER', m."id", m.prefix || LPAD((COALESCE(x.current_max, 0) + m.ordinal)::TEXT, CASE WHEN m.prefix = 'STF-' THEN 4 ELSE 5 END, '0'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM missing m LEFT JOIN maxima x ON x.prefix = m.prefix
ON CONFLICT ("entityType", "entityId") DO NOTHING;

WITH source AS (
  SELECT r."id", 'RF-' || TO_CHAR(r."createdAt" AT TIME ZONE 'UTC', 'YYMM') AS prefix, r."createdAt"
  FROM "Refund" r
), missing AS (
  SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.prefix ORDER BY s."createdAt", s."id") AS ordinal
  FROM source s
  WHERE NOT EXISTS (SELECT 1 FROM "PublicIdentifier" p WHERE p."entityType" = 'REFUND' AND p."entityId" = s."id")
), maxima AS (
  SELECT LEFT("publicCode", 7) AS prefix, MAX(regexp_replace("publicCode", '^.*-', '')::INTEGER) AS current_max
  FROM "PublicIdentifier"
  WHERE "entityType" = 'REFUND' AND regexp_replace("publicCode", '^.*-', '') ~ '^[0-9]+$'
  GROUP BY LEFT("publicCode", 7)
)
INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, 'REFUND', m."id", m.prefix || LPAD((COALESCE(x.current_max, 0) + m.ordinal)::TEXT, 4, '0'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM missing m LEFT JOIN maxima x ON x.prefix = m.prefix
ON CONFLICT ("entityType", "entityId") DO NOTHING;

WITH missing AS (
  SELECT l."id", ROW_NUMBER() OVER (ORDER BY l."createdAt", l."id") AS ordinal
  FROM "AgentWalletLedger" l
  WHERE NOT EXISTS (SELECT 1 FROM "PublicIdentifier" p WHERE p."entityType" = 'WALLET_LEDGER' AND p."entityId" = l."id")
), maximum AS (
  SELECT COALESCE(MAX(regexp_replace("publicCode", '^.*-', '')::INTEGER), 0) AS current_max
  FROM "PublicIdentifier"
  WHERE "entityType" = 'WALLET_LEDGER' AND "publicCode" LIKE 'WL-%' AND regexp_replace("publicCode", '^.*-', '') ~ '^[0-9]+$'
)
INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, 'WALLET_LEDGER', m."id", 'WL-' || LPAD((x.current_max + m.ordinal)::TEXT, 7, '0'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM missing m CROSS JOIN maximum x
ON CONFLICT ("entityType", "entityId") DO NOTHING;

WITH approvals AS (
  SELECT 'VENDOR'::TEXT AS kind, v."id", v."updatedAt" AS created_at FROM "VendorProfile" v WHERE v."verificationStatus" = 'PENDING'
  UNION ALL
  SELECT 'PRODUCT', r."id", r."updatedAt" FROM "ProductRevision" r JOIN "Product" p ON p."id" = r."productId" JOIN "Tenant" t ON t."id" = p."tenantId" WHERE r."status" = 'UNDER_REVIEW' AND p."deletedAt" IS NULL AND t."kind" = 'VENDOR'
  UNION ALL
  SELECT 'AGENT', a."id", a."updatedAt" FROM "AgentProfile" a WHERE a."verificationStatus" = 'PENDING'
  UNION ALL
  SELECT 'REFUND', r."id", r."requestedAt" FROM "Refund" r WHERE r."status" = 'PENDING'
  UNION ALL
  SELECT 'PAYOUT', p."id", p."createdAt" FROM "Payout" p WHERE p."status" = 'READY_TO_RELEASE'
), missing AS (
  SELECT a.*, a.kind || ':' || a."id" AS registry_id, ROW_NUMBER() OVER (ORDER BY a.created_at, a.kind, a."id") AS ordinal
  FROM approvals a
  WHERE NOT EXISTS (SELECT 1 FROM "PublicIdentifier" p WHERE p."entityType" = 'APPROVAL' AND p."entityId" = a.kind || ':' || a."id")
), maximum AS (
  SELECT COALESCE(MAX(regexp_replace("publicCode", '^.*-', '')::INTEGER), 0) AS current_max
  FROM "PublicIdentifier"
  WHERE "entityType" = 'APPROVAL' AND "publicCode" LIKE 'APR-%' AND regexp_replace("publicCode", '^.*-', '') ~ '^[0-9]+$'
)
INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, 'APPROVAL', m.registry_id, 'APR-' || LPAD((x.current_max + m.ordinal)::TEXT, 6, '0'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM missing m CROSS JOIN maximum x
ON CONFLICT ("entityType", "entityId") DO NOTHING;

INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, 'AUDIT_EVENT', a."id", 'EVT-' || UPPER(a."id"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AuditLog" a
WHERE NOT EXISTS (SELECT 1 FROM "PublicIdentifier" p WHERE p."entityType" = 'AUDIT_EVENT' AND p."entityId" = a."id")
ON CONFLICT ("entityType", "entityId") DO NOTHING;
