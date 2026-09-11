-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'LIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductRevisionStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "RatePlan" ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRevision" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProductRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "productName" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "subType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlightedPriority" INTEGER,
    "isHotelLinked" BOOLEAN NOT NULL DEFAULT false,
    "attachedHotelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "howToRedeem" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subCategory" TEXT,
    "persuasions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rank" INTEGER,
    "starRating" DECIMAL(3,2),
    "safetyMeasures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importantInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thingsToCarry" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "additionalInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metaname" TEXT,
    "cityCode" TEXT,
    "lat" DECIMAL(10,7),
    "lon" DECIMAL(10,7),
    "address" TEXT,
    "cityName" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "sourcePayload" JSONB,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "fileAssetId" TEXT,
    "externalUrl" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "durationMinutes" INTEGER,
    "privateShared" TEXT,
    "vehicleType" TEXT,
    "pickupIncluded" BOOLEAN NOT NULL DEFAULT false,
    "pickupType" TEXT,
    "pickupInput" TEXT,
    "pickupTimings" TEXT,
    "dropoffIncluded" BOOLEAN NOT NULL DEFAULT false,
    "dropoffTimings" TEXT,
    "mealIncluded" BOOLEAN NOT NULL DEFAULT false,
    "mealType" TEXT,
    "menu" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mealVariety" TEXT,
    "pointsOfInterest" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suitableFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcePayload" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_tenantId_status_idx" ON "Product"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_productCode_key" ON "Product"("tenantId", "productCode");

-- CreateIndex
CREATE INDEX "ProductRevision_productId_status_idx" ON "ProductRevision"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRevision_productId_versionNumber_key" ON "ProductRevision"("productId", "versionNumber");

-- CreateIndex
CREATE INDEX "ProductMedia_revisionId_kind_idx" ON "ProductMedia"("revisionId", "kind");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_status_idx" ON "ProductVariant"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_variantCode_key" ON "ProductVariant"("productId", "variantCode");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "ProductRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRevision" ADD CONSTRAINT "ProductRevision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRevision" ADD CONSTRAINT "ProductRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRevision" ADD CONSTRAINT "ProductRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

