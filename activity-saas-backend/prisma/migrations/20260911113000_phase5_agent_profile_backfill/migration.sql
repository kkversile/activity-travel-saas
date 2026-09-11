-- Ensure historical Travel Agent tenants have an explicit, non-approved governance state.
INSERT INTO "AgentProfile" ("id", "tenantId", "legalBusinessName", "verificationStatus", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", t."name", 'PENDING'::"AgentVerificationStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE t."kind" = 'TRAVEL_AGENT'::"TenantKind"
  AND NOT EXISTS (SELECT 1 FROM "AgentProfile" p WHERE p."tenantId" = t."id");
