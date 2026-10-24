ALTER TABLE "ProductVariant" ADD COLUMN "revisionId" TEXT;

DROP INDEX IF EXISTS "ProductVariant_productId_variantCode_key";

CREATE UNIQUE INDEX "ProductVariant_productId_revisionId_variantCode_key"
ON "ProductVariant"("productId", "revisionId", "variantCode");

CREATE INDEX "ProductVariant_revisionId_status_idx" ON "ProductVariant"("revisionId", "status");

ALTER TABLE "ProductVariant"
ADD CONSTRAINT "ProductVariant_revisionId_fkey"
FOREIGN KEY ("revisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "ProductVariant" AS variant
SET "revisionId" = product."currentRevisionId"
FROM "Product" AS product
WHERE product."id" = variant."productId"
  AND product."currentRevisionId" IS NOT NULL;
