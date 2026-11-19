-- Minimal system defaults only. No accounts, products, balances or approvals.
INSERT INTO "FinanceConfiguration" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CommercialGuardrailConfiguration" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "global_settings" ("id", "tenantId", "adminId", "key", "value", "updatedAt")
SELECT gen_random_uuid()::text, NULL, NULL, 'VISITOR_PRICING_FIELDS',
       '{"showEligibilityBasis":false,"showVerificationRequired":false}'::jsonb, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "global_settings" WHERE "tenantId" IS NULL AND "key"='VISITOR_PRICING_FIELDS');
