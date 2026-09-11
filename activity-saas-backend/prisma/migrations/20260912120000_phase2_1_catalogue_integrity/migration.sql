-- Phase 2.1 catalogue integrity. This migration is additive/constraint-only;
-- no catalogue rows are rewritten or deleted.

-- Prisma needs a composite unique target for the same-product current-revision FK.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevision_id_productId_key"
  ON "ProductRevision" ("id", "productId");

-- At most one working revision (draft or under review) per Product.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevision_one_working_per_product_idx"
  ON "ProductRevision" ("productId")
  WHERE "status" IN ('DRAFT'::"ProductRevisionStatus", 'UNDER_REVIEW'::"ProductRevisionStatus");

-- At most one published revision per Product.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevision_one_published_per_product_idx"
  ON "ProductRevision" ("productId")
  WHERE "status" = 'PUBLISHED'::"ProductRevisionStatus";

-- The referenced revision must belong to the same Product as the local id.
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_currentRevisionId_fkey";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_currentRevisionId_productId_fkey";
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_currentRevisionId_productId_fkey"
  FOREIGN KEY ("currentRevisionId", "id")
  REFERENCES "ProductRevision" ("id", "productId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- ActivityStatus was an unused legacy enum after Activity table retirement.
DROP TYPE IF EXISTS "ActivityStatus";
