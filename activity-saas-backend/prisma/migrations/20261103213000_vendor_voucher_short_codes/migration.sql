ALTER TABLE "VendorProfile" ADD COLUMN "voucherShortCode" TEXT;

WITH numbered AS (
  SELECT "tenantId", row_number() OVER (ORDER BY "createdAt", "tenantId") - 1 AS ordinal
  FROM "VendorProfile"
), codes AS (
  SELECT "tenantId",
         chr(65 + ((ordinal / 676) % 26)::INTEGER) ||
         chr(65 + ((ordinal / 26) % 26)::INTEGER) ||
         chr(65 + (ordinal % 26)::INTEGER) AS code
  FROM numbered
)
UPDATE "VendorProfile" profile
SET "voucherShortCode" = codes.code
FROM codes
WHERE profile."tenantId" = codes."tenantId";

ALTER TABLE "VendorProfile" ALTER COLUMN "voucherShortCode" SET NOT NULL;
CREATE UNIQUE INDEX "VendorProfile_voucherShortCode_key" ON "VendorProfile"("voucherShortCode");

INSERT INTO "PublicIdentifierSequence" ("entityType", "prefix", "lastValue")
SELECT 'VENDOR_SHORT_CODE', 'VSC-', count(*)::INTEGER
FROM "VendorProfile"
ON CONFLICT ("entityType", "prefix") DO UPDATE
SET "lastValue" = GREATEST("PublicIdentifierSequence"."lastValue", EXCLUDED."lastValue"),
    "updatedAt" = CURRENT_TIMESTAMP;
