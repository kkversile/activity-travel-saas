-- API partner public IDs are distinct from distribution channel codes and API keys.
WITH missing AS (
  SELECT channel."id",
         ROW_NUMBER() OVER (ORDER BY channel."createdAt", channel."code", channel."id") AS ordinal
  FROM "DistributionChannel" channel
  WHERE channel."type" = 'PARTNER_API'
    AND NOT EXISTS (
      SELECT 1 FROM "PublicIdentifier" identifier
      WHERE identifier."entityType" = 'DISTRIBUTION_CHANNEL'
        AND identifier."entityId" = channel."id"
    )
), maximum AS (
  SELECT COALESCE(MAX(regexp_replace("publicCode", '^APP-', '')::INTEGER), 0) AS value
  FROM "PublicIdentifier"
  WHERE "entityType" = 'DISTRIBUTION_CHANNEL'
    AND "publicCode" ~ '^APP-[0-9]+$'
)
INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT,
       'DISTRIBUTION_CHANNEL',
       missing."id",
       'APP-' || LPAD((maximum.value + missing.ordinal)::TEXT, 4, '0'),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM missing CROSS JOIN maximum
ON CONFLICT ("entityType", "entityId") DO NOTHING;

INSERT INTO "PublicIdentifierSequence" ("entityType", "prefix", "lastValue")
SELECT 'DISTRIBUTION_CHANNEL', 'APP-', COALESCE(MAX(regexp_replace("publicCode", '^APP-', '')::INTEGER), 0)
FROM "PublicIdentifier"
WHERE "entityType" = 'DISTRIBUTION_CHANNEL'
  AND "publicCode" ~ '^APP-[0-9]+$'
HAVING COUNT(*) > 0
ON CONFLICT ("entityType", "prefix") DO UPDATE
SET "lastValue" = GREATEST("PublicIdentifierSequence"."lastValue", EXCLUDED."lastValue"),
    "updatedAt" = CURRENT_TIMESTAMP;
