CREATE TYPE "SupplierCommercialModel" AS ENUM ('NET_RATE', 'COMMISSIONABLE', 'GROSS_RATE', 'HYBRID');
CREATE TYPE "PricingUnit" AS ENUM ('PER_PERSON', 'PER_BOOKING', 'PER_UNIT', 'GROUP');
CREATE TYPE "BookingMode" AS ENUM ('INSTANT', 'REQUEST');
CREATE TYPE "CommercialVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "CommercialRuleKind" AS ENUM ('VOYA_REVENUE', 'AGENT_COMMERCIAL', 'TAX', 'PROMOTION', 'FOC', 'ELIGIBILITY');
CREATE TYPE "CommercialScopeType" AS ENUM ('GLOBAL', 'VENDOR', 'PRODUCT', 'VARIANT', 'RATE_PLAN', 'AGENT_GROUP', 'AGENT');
CREATE TYPE "CommercialStackingMode" AS ENUM ('EXCLUSIVE', 'STACKABLE');
CREATE TYPE "CommercialRuleVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "VoyaRevenueModel" AS ENUM ('MARKUP_FIXED', 'MARKUP_PERCENT', 'COMMISSION_PERCENT', 'HYBRID');
CREATE TYPE "AgentCommercialModel" AS ENUM ('NET_PLUS_MARKUP', 'SELLING_PRICE_COMMISSION', 'AGENT_SPECIFIC_PRICE');
CREATE TYPE "TaxMode" AS ENUM ('EXCLUSIVE', 'INCLUSIVE', 'NONE');
CREATE TYPE "PromotionFunder" AS ENUM ('SUPPLIER', 'VOYA', 'SHARED', 'AGENT');

CREATE TABLE "RatePlanCommercialVersion" (
  "id" TEXT NOT NULL,
  "ratePlanId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "CommercialVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "supplierModel" "SupplierCommercialModel",
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "pricingUnit" "PricingUnit",
  "supplierBaseAmount" DECIMAL(18,4),
  "supplierCommissionPercent" DECIMAL(9,4),
  "bookingMode" "BookingMode",
  "sourcePayload" JSONB,
  "createdById" TEXT NOT NULL,
  "activatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RatePlanCommercialVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RatePlanTravellerPrice" (
  "id" TEXT NOT NULL,
  "commercialVersionId" TEXT NOT NULL,
  "travellerType" "TravellerType" NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RatePlanTravellerPrice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentGroup" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentGroupMember" (
  "id" TEXT NOT NULL,
  "agentGroupId" TEXT NOT NULL,
  "agentTenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentGroupMember_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CommercialRule" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "CommercialRuleKind" NOT NULL,
  "scopeType" "CommercialScopeType" NOT NULL,
  "vendorTenantId" TEXT,
  "productId" TEXT,
  "variantId" TEXT,
  "ratePlanId" TEXT,
  "agentGroupId" TEXT,
  "agentTenantId" TEXT,
  "createdById" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CommercialRuleVersion" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "CommercialRuleVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "stackingMode" "CommercialStackingMode" NOT NULL DEFAULT 'EXCLUSIVE',
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdById" TEXT NOT NULL,
  "activatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialRuleVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BookingEconomicsSnapshot" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "ratePlanCommercialVersionId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "pricingUnit" "PricingUnit" NOT NULL,
  "supplierCommercialModel" "SupplierCommercialModel" NOT NULL,
  "supplierGrossBasis" DECIMAL(18,4) NOT NULL,
  "supplierCommission" DECIMAL(18,4) NOT NULL,
  "vendorPayable" DECIMAL(18,4) NOT NULL,
  "voyaRevenueModel" "VoyaRevenueModel",
  "voyaRevenue" DECIMAL(18,4) NOT NULL,
  "agentCommercialModel" "AgentCommercialModel",
  "agentCommission" DECIMAL(18,4) NOT NULL,
  "taxMode" "TaxMode" NOT NULL,
  "taxAmount" DECIMAL(18,4) NOT NULL,
  "promotionAmount" DECIMAL(18,4) NOT NULL,
  "focAmount" DECIMAL(18,4) NOT NULL,
  "finalAmount" DECIMAL(18,4) NOT NULL,
  "calculationInputs" JSONB NOT NULL,
  "calculationOutputs" JSONB NOT NULL,
  "ruleTrace" JSONB NOT NULL,
  "fxContext" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingEconomicsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RatePlanCommercialVersion_ratePlanId_versionNumber_key" ON "RatePlanCommercialVersion"("ratePlanId", "versionNumber");
CREATE INDEX "RatePlanCommercialVersion_ratePlanId_status_idx" ON "RatePlanCommercialVersion"("ratePlanId", "status");
CREATE INDEX "RatePlanCommercialVersion_effectiveFrom_effectiveTo_idx" ON "RatePlanCommercialVersion"("effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "RatePlanTravellerPrice_commercialVersionId_travellerType_key" ON "RatePlanTravellerPrice"("commercialVersionId", "travellerType");
CREATE UNIQUE INDEX "AgentGroup_code_key" ON "AgentGroup"("code");
CREATE UNIQUE INDEX "AgentGroupMember_agentGroupId_agentTenantId_key" ON "AgentGroupMember"("agentGroupId", "agentTenantId");
CREATE INDEX "AgentGroupMember_agentTenantId_idx" ON "AgentGroupMember"("agentTenantId");
CREATE UNIQUE INDEX "CommercialRule_code_scopeType_key" ON "CommercialRule"("code", "scopeType");
CREATE INDEX "CommercialRule_scope_lookup_idx" ON "CommercialRule"("scopeType", "vendorTenantId", "productId", "variantId", "ratePlanId", "agentGroupId", "agentTenantId");
CREATE UNIQUE INDEX "CommercialRuleVersion_ruleId_versionNumber_key" ON "CommercialRuleVersion"("ruleId", "versionNumber");
CREATE INDEX "CommercialRuleVersion_ruleId_status_idx" ON "CommercialRuleVersion"("ruleId", "status");
CREATE INDEX "CommercialRuleVersion_effectiveFrom_effectiveTo_idx" ON "CommercialRuleVersion"("effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "BookingEconomicsSnapshot_bookingId_key" ON "BookingEconomicsSnapshot"("bookingId");
CREATE INDEX "BookingEconomicsSnapshot_ratePlanCommercialVersionId_idx" ON "BookingEconomicsSnapshot"("ratePlanCommercialVersionId");

ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RatePlanTravellerPrice" ADD CONSTRAINT "RatePlanTravellerPrice_commercialVersionId_fkey" FOREIGN KEY ("commercialVersionId") REFERENCES "RatePlanCommercialVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentGroupMember" ADD CONSTRAINT "AgentGroupMember_agentGroupId_fkey" FOREIGN KEY ("agentGroupId") REFERENCES "AgentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentGroupMember" ADD CONSTRAINT "AgentGroupMember_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_agentGroupId_fkey" FOREIGN KEY ("agentGroupId") REFERENCES "AgentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CommercialRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingEconomicsSnapshot" ADD CONSTRAINT "BookingEconomicsSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingEconomicsSnapshot" ADD CONSTRAINT "BookingEconomicsSnapshot_ratePlanCommercialVersionId_fkey" FOREIGN KEY ("ratePlanCommercialVersionId") REFERENCES "RatePlanCommercialVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_active_overlap_excl" EXCLUDE USING gist ("ratePlanId" WITH =, tsrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamp), '[)') WITH &&) WHERE ("status" = 'ACTIVE');
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_active_overlap_excl" EXCLUDE USING gist ("ruleId" WITH =, tsrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamp), '[)') WITH &&) WHERE ("status" = 'ACTIVE');
