ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_exact_scope_shape" CHECK (
  ("scopeType" = 'GLOBAL' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'VENDOR' AND "vendorTenantId" IS NOT NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'PRODUCT' AND "vendorTenantId" IS NULL AND "productId" IS NOT NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'VARIANT' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NOT NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'RATE_PLAN' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NOT NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'AGENT_GROUP' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NOT NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'AGENT' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NOT NULL)
);
