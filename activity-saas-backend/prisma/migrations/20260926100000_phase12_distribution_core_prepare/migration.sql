-- Phase 12 prepare: additive distribution contract, mapping, exposure, credential, and event projection structures.

CREATE TYPE "DistributionChannelType" AS ENUM ('INTERNAL_MARKETPLACE', 'DIRECT', 'OTA', 'PARTNER_API');
CREATE TYPE "ChannelContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "DistributionCapability" AS ENUM ('CATALOG_READ', 'AVAILABILITY_READ', 'PRICING_READ', 'EVENT_READ');
CREATE TYPE "ChannelMappingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'RETIRED');
CREATE TYPE "ChannelInventoryExposureMode" AS ENUM ('EXACT_REMAINING', 'AVAILABLE_ONLY');
CREATE TYPE "ChannelCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "DistributionEventType" AS ENUM ('PRODUCT_CHANGED', 'VARIANT_CHANGED', 'RATE_CHANGED', 'AVAILABILITY_CHANGED', 'BOOKING_CHANGED', 'MAPPING_CHANGED');

ALTER TABLE "DistributionChannel"
  ADD COLUMN "type" "DistributionChannelType" NOT NULL DEFAULT 'PARTNER_API',
  ADD COLUMN "description" TEXT;

ALTER TABLE "RatePlanChannelMapping"
  ADD COLUMN "externalRatePlanCode" TEXT,
  ADD COLUMN "status" "ChannelMappingStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "migrationMetadata" JSONB;

ALTER TABLE "CommercialRule" ADD COLUMN "distributionChannelId" TEXT;

CREATE TABLE "ChannelContract" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "ChannelContractStatus" NOT NULL DEFAULT 'DRAFT',
  "name" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "capabilities" "DistributionCapability"[],
  "allowedCurrencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "availabilityHorizonDays" INTEGER NOT NULL,
  "lockVersion" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedById" TEXT,
  "activatedAt" TIMESTAMP(3),
  "retiredById" TEXT,
  "retiredAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ChannelContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductChannelMapping" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "externalProductCode" TEXT NOT NULL,
  "status" "ChannelMappingStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductChannelMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VariantChannelMapping" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "externalVariantCode" TEXT NOT NULL,
  "status" "ChannelMappingStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VariantChannelMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelInventoryRule" (
  "id" TEXT NOT NULL,
  "ratePlanChannelMappingId" TEXT NOT NULL,
  "exposureMode" "ChannelInventoryExposureMode" NOT NULL,
  "capacityBuffer" INTEGER NOT NULL DEFAULT 0,
  "maxPublishedCapacity" INTEGER,
  "maxUnitsPerQuote" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelInventoryRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelApiCredential" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" "DistributionCapability"[],
  "status" "ChannelCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ChannelApiCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DistributionEvent" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "sourceOutboxEventId" TEXT NOT NULL,
  "type" "DistributionEventType" NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "externalResourceCode" TEXT,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DistributionProjectionCursor" (
  "consumerKey" TEXT NOT NULL,
  "lastCreatedAt" TIMESTAMP(3),
  "lastEventId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DistributionProjectionCursor_pkey" PRIMARY KEY ("consumerKey")
);

CREATE UNIQUE INDEX "ChannelContract_channelId_versionNumber_key" ON "ChannelContract"("channelId", "versionNumber");
CREATE INDEX "ChannelContract_channelId_status_idx" ON "ChannelContract"("channelId", "status");
CREATE UNIQUE INDEX "ProductChannelMapping_channelId_productId_key" ON "ProductChannelMapping"("channelId", "productId");
CREATE UNIQUE INDEX "ProductChannelMapping_channelId_externalProductCode_key" ON "ProductChannelMapping"("channelId", "externalProductCode");
CREATE INDEX "ProductChannelMapping_channelId_status_idx" ON "ProductChannelMapping"("channelId", "status");
CREATE UNIQUE INDEX "VariantChannelMapping_channelId_variantId_key" ON "VariantChannelMapping"("channelId", "variantId");
CREATE UNIQUE INDEX "VariantChannelMapping_channelId_externalVariantCode_key" ON "VariantChannelMapping"("channelId", "externalVariantCode");
CREATE INDEX "VariantChannelMapping_channelId_status_idx" ON "VariantChannelMapping"("channelId", "status");
CREATE UNIQUE INDEX "ChannelInventoryRule_ratePlanChannelMappingId_key" ON "ChannelInventoryRule"("ratePlanChannelMappingId");
CREATE UNIQUE INDEX "ChannelApiCredential_keyPrefix_key" ON "ChannelApiCredential"("keyPrefix");
CREATE INDEX "ChannelApiCredential_channelId_status_idx" ON "ChannelApiCredential"("channelId", "status");
CREATE UNIQUE INDEX "DistributionEvent_channelId_sourceOutboxEventId_type_resour_key" ON "DistributionEvent"("channelId", "sourceOutboxEventId", "type", "resourceType", "resourceId");
CREATE INDEX "DistributionEvent_channelId_createdAt_id_idx" ON "DistributionEvent"("channelId", "createdAt", "id");
CREATE INDEX "CommercialRule_distributionChannelId_scopeType_idx" ON "CommercialRule"("distributionChannelId", "scopeType");
CREATE INDEX "RatePlanChannelMapping_channelId_status_idx" ON "RatePlanChannelMapping"("channelId", "status");
CREATE UNIQUE INDEX "RatePlanChannelMapping_channelId_externalRatePlanCode_key" ON "RatePlanChannelMapping"("channelId", "externalRatePlanCode");

ALTER TABLE "RatePlanChannelMapping" ADD CONSTRAINT "RatePlanChannelMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductChannelMapping" ADD CONSTRAINT "ProductChannelMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductChannelMapping" ADD CONSTRAINT "ProductChannelMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductChannelMapping" ADD CONSTRAINT "ProductChannelMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantChannelMapping" ADD CONSTRAINT "VariantChannelMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantChannelMapping" ADD CONSTRAINT "VariantChannelMapping_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantChannelMapping" ADD CONSTRAINT "VariantChannelMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelInventoryRule" ADD CONSTRAINT "ChannelInventoryRule_ratePlanChannelMappingId_fkey" FOREIGN KEY ("ratePlanChannelMappingId") REFERENCES "RatePlanChannelMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelApiCredential" ADD CONSTRAINT "ChannelApiCredential_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelApiCredential" ADD CONSTRAINT "ChannelApiCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelApiCredential" ADD CONSTRAINT "ChannelApiCredential_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DistributionEvent" ADD CONSTRAINT "DistributionEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_distributionChannelId_fkey" FOREIGN KEY ("distributionChannelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
