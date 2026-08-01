CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

ALTER TABLE "Category"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Destination"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "Category_tenantId_status_displayOrder_idx" ON "Category"("tenantId", "status", "displayOrder");
