-- Booking rules are option defaults. Keep the columns nullable so legacy and
-- special rate plans remain authoritative until an option is explicitly edited.
ALTER TABLE "ProductVariant"
  ADD COLUMN "minPax" INTEGER,
  ADD COLUMN "maxPax" INTEGER,
  ADD COLUMN "cutOffMinutes" INTEGER;

-- Safe backfill: copy values from an editor-created active plan, or from the
-- only active plan. Do not guess when several legacy/commercial plans exist.
WITH ranked AS (
  SELECT
    rp."variantId",
    rp."minPax",
    rp."maxPax",
    rp."cutOffMinutes",
    COUNT(*) OVER (PARTITION BY rp."variantId") AS "planCount",
    ROW_NUMBER() OVER (
      PARTITION BY rp."variantId"
      ORDER BY
        CASE WHEN (rp."sourcePayload"->>'createdFromActivityEditor') = 'true' THEN 0 ELSE 1 END,
        rp."createdAt" ASC
    ) AS "rank"
  FROM "RatePlan" rp
  WHERE rp."status" = 'ACTIVE'
)
UPDATE "ProductVariant" v
SET
  "minPax" = ranked."minPax",
  "maxPax" = ranked."maxPax",
  "cutOffMinutes" = ranked."cutOffMinutes"
FROM ranked
WHERE ranked."variantId" = v."id"
  AND ranked."rank" = 1
  AND (ranked."planCount" = 1 OR EXISTS (
    SELECT 1
    FROM "RatePlan" editor_plan
    WHERE editor_plan."variantId" = v."id"
      AND editor_plan."status" = 'ACTIVE'
      AND (editor_plan."sourcePayload"->>'createdFromActivityEditor') = 'true'
  ));
