-- Older products created before currentRevisionId was maintained can still have
-- valid revisions but no pointer. Prefer the published revision; for products
-- that are still being configured, use their latest working revision.
WITH ranked_revisions AS (
  SELECT DISTINCT ON ("productId")
    "id",
    "productId"
  FROM "ProductRevision"
  WHERE "status" IN ('PUBLISHED', 'UNDER_REVIEW', 'DRAFT', 'REJECTED')
  ORDER BY
    "productId",
    CASE "status"
      WHEN 'PUBLISHED' THEN 0
      WHEN 'UNDER_REVIEW' THEN 1
      WHEN 'DRAFT' THEN 2
      ELSE 3
    END,
    "versionNumber" DESC,
    "createdAt" DESC
)
UPDATE "Product" AS product
SET "currentRevisionId" = ranked_revisions."id"
FROM ranked_revisions
WHERE product."currentRevisionId" IS NULL
  AND product."deletedAt" IS NULL
  AND product."id" = ranked_revisions."productId";
