ALTER TABLE "VendorProfile" ADD COLUMN "displayName" TEXT;

UPDATE "VendorProfile" AS vp
SET "displayName" = COALESCE(
  NULLIF(BTRIM(oa."businessDisplayName"), ''),
  NULLIF(BTRIM(t."name"), ''),
  NULLIF(BTRIM(vp."legalBusinessName"), '')
)
FROM "Tenant" AS t
LEFT JOIN "VendorOnboardingApplication" AS oa ON oa."tenantId" = t."id"
WHERE vp."tenantId" = t."id"
  AND vp."displayName" IS NULL;
