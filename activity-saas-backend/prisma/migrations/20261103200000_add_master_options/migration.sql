CREATE TABLE "ExperienceMasterOption" (
  "id" TEXT NOT NULL,
  "experienceMasterId" TEXT NOT NULL,
  "optionKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperienceMasterOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExperienceMasterOptionPlacement" (
  "id" TEXT NOT NULL,
  "masterOptionId" TEXT NOT NULL,
  "productVariantId" TEXT NOT NULL,
  "pinnedUntil" TIMESTAMP(3),
  "pinnedById" TEXT,
  "pinReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperienceMasterOptionPlacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExperienceMasterOption_experienceMasterId_optionKey_key"
  ON "ExperienceMasterOption"("experienceMasterId", "optionKey");
CREATE INDEX "ExperienceMasterOption_experienceMasterId_active_idx"
  ON "ExperienceMasterOption"("experienceMasterId", "active");
CREATE UNIQUE INDEX "ExperienceMasterOptionPlacement_productVariantId_key"
  ON "ExperienceMasterOptionPlacement"("productVariantId");
CREATE INDEX "ExperienceMasterOptionPlacement_masterOptionId_idx"
  ON "ExperienceMasterOptionPlacement"("masterOptionId");

ALTER TABLE "ExperienceMasterOption"
  ADD CONSTRAINT "ExperienceMasterOption_experienceMasterId_fkey"
  FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperienceMasterOptionPlacement"
  ADD CONSTRAINT "ExperienceMasterOptionPlacement_masterOptionId_fkey"
  FOREIGN KEY ("masterOptionId") REFERENCES "ExperienceMasterOption"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExperienceMasterOptionPlacement_productVariantId_fkey"
  FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill stable master options for existing linked supplier variants. Names
-- are normalized only for matching; the first supplier's display label remains.
WITH variant_keys AS (
  SELECT p."experienceMasterId",
         v."id" AS "productVariantId",
         COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(lower(trim(v."name")), '[^a-z0-9]+', '-', 'g')), ''), v."id") AS "optionKey",
         v."name"
  FROM "ProductVariant" v
  JOIN "Product" p ON p."id" = v."productId"
  WHERE p."experienceMasterId" IS NOT NULL
    AND p."deletedAt" IS NULL
    AND v."archivedAt" IS NULL
    AND v."status" = 'ACTIVE'
), distinct_options AS (
  SELECT DISTINCT ON ("experienceMasterId", "optionKey") "experienceMasterId", "optionKey", "name"
  FROM variant_keys
  ORDER BY "experienceMasterId", "optionKey", "name"
)
INSERT INTO "ExperienceMasterOption" ("id", "experienceMasterId", "optionKey", "name", "updatedAt")
SELECT gen_random_uuid()::text, "experienceMasterId", "optionKey", "name", CURRENT_TIMESTAMP
FROM distinct_options;

WITH variant_keys AS (
  SELECT p."experienceMasterId",
         v."id" AS "productVariantId",
         COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(lower(trim(v."name")), '[^a-z0-9]+', '-', 'g')), ''), v."id") AS "optionKey"
  FROM "ProductVariant" v
  JOIN "Product" p ON p."id" = v."productId"
  WHERE p."experienceMasterId" IS NOT NULL
    AND p."deletedAt" IS NULL
    AND v."archivedAt" IS NULL
    AND v."status" = 'ACTIVE'
)
INSERT INTO "ExperienceMasterOptionPlacement" ("id", "masterOptionId", "productVariantId")
SELECT gen_random_uuid()::text, o."id", v."productVariantId"
FROM variant_keys v
JOIN "ExperienceMasterOption" o
  ON o."experienceMasterId" = v."experienceMasterId" AND o."optionKey" = v."optionKey"
ON CONFLICT ("productVariantId") DO NOTHING;

-- MO public codes retain the parent master number and a stable option ordinal.
WITH ranked AS (
  SELECT o."id", pi."publicCode" AS "masterCode",
         row_number() OVER (PARTITION BY o."experienceMasterId" ORDER BY o."optionKey", o."id") AS ordinal
  FROM "ExperienceMasterOption" o
  JOIN "PublicIdentifier" pi
    ON pi."entityType" = 'MASTER_PRODUCT' AND pi."entityId" = o."experienceMasterId"
), codes AS (
  SELECT "id", regexp_replace("masterCode", '^MP-', 'MO-') || '-' || lpad(ordinal::text, 2, '0') AS "publicCode"
  FROM ranked
)
INSERT INTO "PublicIdentifier" ("id", "entityType", "entityId", "publicCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'MASTER_OPTION', "id", "publicCode", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM codes
ON CONFLICT ("entityType", "entityId") DO NOTHING;
