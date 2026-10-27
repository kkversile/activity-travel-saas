INSERT INTO "public"."global_settings" ("id", "tenantId", "adminId", "key", "value")
SELECT gen_random_uuid()::text, NULL, NULL, 'VISITOR_PRICING_FIELDS', '{"showEligibilityBasis": false, "showVerificationRequired": false}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."global_settings"
  WHERE "tenantId" IS NULL AND "key" = 'VISITOR_PRICING_FIELDS'
);
