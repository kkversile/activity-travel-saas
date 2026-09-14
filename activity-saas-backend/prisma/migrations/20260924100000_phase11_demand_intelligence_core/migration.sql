-- CreateEnum
CREATE TYPE "DemandIntelligencePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DemandOpportunityType" AS ENUM ('HIGH_DEMAND_LOW_SUPPLY', 'FREQUENT_SOLD_OUT', 'HIGH_CANCELLATIONS', 'PRICE_GAP', 'COVERAGE_GAP');

-- CreateEnum
CREATE TYPE "DemandOpportunityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DemandOpportunitySource" AS ENUM ('SYSTEM', 'MANUAL');

-- CreateEnum
CREATE TYPE "DemandOpportunityStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DemandTargetStatus" AS ENUM ('TARGETED', 'VIEWED', 'INTERESTED', 'DECLINED', 'ACTION_TAKEN');

-- CreateEnum
CREATE TYPE "DemandOpportunityResolutionType" AS ENUM ('CAPACITY_ADDED', 'SLOT_ADDED', 'PRODUCT_ADDED', 'COMMERCIAL_REVIEW', 'QUALITY_REVIEW', 'COVERAGE_EXPANDED', 'NO_ACTION', 'OTHER');

-- CreateTable
CREATE TABLE "MarketplaceSearchObservation" (
    "id" TEXT NOT NULL,
    "agentTenantId" TEXT NOT NULL,
    "searchAttemptId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceDate" DATE NOT NULL,
    "destinationNormalized" TEXT,
    "category" TEXT,
    "subType" TEXT,
    "durationMin" INTEGER,
    "durationMax" INTEGER,
    "priceMin" DOUBLE PRECISION,
    "priceMax" DOUBLE PRECISION,
    "currency" TEXT,
    "bookingMode" "BookingMode",
    "pickupIncluded" BOOLEAN,
    "minimumRating" DOUBLE PRECISION,
    "privateShared" TEXT,
    "childSuitable" BOOLEAN,
    "units" INTEGER,
    "totalPax" INTEGER NOT NULL,
    "travellerSummary" JSONB NOT NULL,
    "queryPresent" BOOLEAN NOT NULL,
    "queryHash" TEXT,
    "candidateRatePlanCount" INTEGER NOT NULL,
    "candidateSessionCount" INTEGER NOT NULL,
    "eligibleOfferCountBeforePrice" INTEGER NOT NULL,
    "resultProductCount" INTEGER NOT NULL,
    "resultOfferCount" INTEGER NOT NULL,
    "zeroResult" BOOLEAN NOT NULL,
    "eligibilityFailureCounts" JSONB NOT NULL,
    "soldOutSessionIds" JSONB NOT NULL,
    "priceDiagnostics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceSearchObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandIntelligencePolicy" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "DemandIntelligencePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "measurementWindowDays" INTEGER NOT NULL,
    "futureHorizonDays" INTEGER NOT NULL,
    "cooldownDays" INTEGER NOT NULL,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "DemandIntelligencePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "type" "DemandOpportunityType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultPriority" "DemandOpportunityPriority" NOT NULL,
    "minSearchCount" INTEGER,
    "minUniqueAgentCount" INTEGER,
    "maxAverageResultProducts" DOUBLE PRECISION,
    "minZeroResultRate" DOUBLE PRECISION,
    "minSoldOutSessionCount" INTEGER,
    "minSoldOutRate" DOUBLE PRECISION,
    "minConfirmedBookingCount" INTEGER,
    "minCancellationRate" DOUBLE PRECISION,
    "minPriceCeilingMissCount" INTEGER,
    "minPriceCeilingMissRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandOpportunityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandAnalysisRun" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "horizonStart" TIMESTAMP(3) NOT NULL,
    "horizonEnd" TIMESTAMP(3) NOT NULL,
    "generatedById" TEXT NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunity" (
    "id" TEXT NOT NULL,
    "opportunityKey" TEXT NOT NULL,
    "type" "DemandOpportunityType" NOT NULL,
    "source" "DemandOpportunitySource" NOT NULL,
    "status" "DemandOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "DemandOpportunityPriority" NOT NULL,
    "title" TEXT NOT NULL,
    "destinationNormalized" TEXT,
    "cityName" TEXT,
    "stateName" TEXT,
    "countryName" TEXT,
    "category" TEXT,
    "subType" TEXT,
    "serviceDateFrom" DATE,
    "serviceDateTo" DATE,
    "durationMin" INTEGER,
    "durationMax" INTEGER,
    "currency" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "resolutionType" "DemandOpportunityResolutionType",
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityAssessment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "sourceTrace" JSONB NOT NULL,
    "recommendedAction" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandOpportunityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityVendorTarget" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "status" "DemandTargetStatus" NOT NULL DEFAULT 'TARGETED',
    "targetedById" TEXT NOT NULL,
    "targetedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandOpportunityVendorTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityEvent" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandOpportunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_observedAt_idx" ON "MarketplaceSearchObservation"("observedAt");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_serviceDate_idx" ON "MarketplaceSearchObservation"("serviceDate");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_destinationNormalized_idx" ON "MarketplaceSearchObservation"("destinationNormalized");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_category_idx" ON "MarketplaceSearchObservation"("category");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_subType_idx" ON "MarketplaceSearchObservation"("subType");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_agentTenantId_idx" ON "MarketplaceSearchObservation"("agentTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSearchObservation_agentTenantId_searchAttemptId_key" ON "MarketplaceSearchObservation"("agentTenantId", "searchAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "DemandIntelligencePolicy_versionNumber_key" ON "DemandIntelligencePolicy"("versionNumber");

-- CreateIndex
CREATE INDEX "DemandIntelligencePolicy_status_idx" ON "DemandIntelligencePolicy"("status");

-- CreateIndex
CREATE INDEX "DemandOpportunityRule_type_enabled_idx" ON "DemandOpportunityRule"("type", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "DemandOpportunityRule_policyId_type_key" ON "DemandOpportunityRule"("policyId", "type");

-- CreateIndex
CREATE INDEX "DemandAnalysisRun_policyId_generatedAt_idx" ON "DemandAnalysisRun"("policyId", "generatedAt");

-- CreateIndex
CREATE INDEX "DemandOpportunity_opportunityKey_status_idx" ON "DemandOpportunity"("opportunityKey", "status");

-- PostgreSQL partial uniqueness preserves historical policy/opportunity rows while enforcing one live workflow owner.
CREATE UNIQUE INDEX "DemandIntelligencePolicy_one_active_key" ON "DemandIntelligencePolicy"("status") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "DemandOpportunity_one_active_key" ON "DemandOpportunity"("opportunityKey") WHERE "status" IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS');

-- CreateIndex
CREATE INDEX "DemandOpportunity_status_priority_lastDetectedAt_idx" ON "DemandOpportunity"("status", "priority", "lastDetectedAt");

-- CreateIndex
CREATE INDEX "DemandOpportunity_type_status_idx" ON "DemandOpportunity"("type", "status");

-- CreateIndex
CREATE INDEX "DemandOpportunity_destinationNormalized_serviceDateFrom_idx" ON "DemandOpportunity"("destinationNormalized", "serviceDateFrom");

-- CreateIndex
CREATE INDEX "DemandOpportunityAssessment_opportunityId_generatedAt_idx" ON "DemandOpportunityAssessment"("opportunityId", "generatedAt");

-- CreateIndex
CREATE INDEX "DemandOpportunityAssessment_analysisRunId_idx" ON "DemandOpportunityAssessment"("analysisRunId");

-- CreateIndex
CREATE INDEX "DemandOpportunityVendorTarget_vendorTenantId_status_idx" ON "DemandOpportunityVendorTarget"("vendorTenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DemandOpportunityVendorTarget_opportunityId_vendorTenantId_key" ON "DemandOpportunityVendorTarget"("opportunityId", "vendorTenantId");

-- CreateIndex
CREATE INDEX "DemandOpportunityEvent_opportunityId_createdAt_idx" ON "DemandOpportunityEvent"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "DemandOpportunityEvent_eventType_createdAt_idx" ON "DemandOpportunityEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketplaceSearchObservation" ADD CONSTRAINT "MarketplaceSearchObservation_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandIntelligencePolicy" ADD CONSTRAINT "DemandIntelligencePolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandIntelligencePolicy" ADD CONSTRAINT "DemandIntelligencePolicy_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityRule" ADD CONSTRAINT "DemandOpportunityRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DemandIntelligencePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandAnalysisRun" ADD CONSTRAINT "DemandAnalysisRun_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DemandIntelligencePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandAnalysisRun" ADD CONSTRAINT "DemandAnalysisRun_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunity" ADD CONSTRAINT "DemandOpportunity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityAssessment" ADD CONSTRAINT "DemandOpportunityAssessment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DemandOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityAssessment" ADD CONSTRAINT "DemandOpportunityAssessment_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "DemandAnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityAssessment" ADD CONSTRAINT "DemandOpportunityAssessment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DemandIntelligencePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DemandOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_targetedById_fkey" FOREIGN KEY ("targetedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityEvent" ADD CONSTRAINT "DemandOpportunityEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DemandOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityEvent" ADD CONSTRAINT "DemandOpportunityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
