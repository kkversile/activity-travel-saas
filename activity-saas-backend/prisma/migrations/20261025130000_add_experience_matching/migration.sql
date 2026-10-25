CREATE TYPE "ExperienceDisplayMode" AS ENUM ('SINGLE_OFFER', 'ALL_OFFERS');
CREATE TYPE "OfferSelectionPolicy" AS ENUM ('CHEAPEST', 'BALANCED', 'HIGHEST_COMMISSION', 'ADMIN_SELECTED');
CREATE TYPE "ProductMatchSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "ExperienceMaster" (
  "id" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "type" "ProductType" NOT NULL,
  "subType" TEXT,
  "cityName" TEXT NOT NULL,
  "stateName" TEXT NOT NULL,
  "countryName" TEXT NOT NULL,
  "displayMode" "ExperienceDisplayMode" NOT NULL DEFAULT 'SINGLE_OFFER',
  "selectionPolicy" "OfferSelectionPolicy" NOT NULL DEFAULT 'CHEAPEST',
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperienceMaster_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product" ADD COLUMN "experienceMasterId" TEXT;

CREATE TABLE "ExperienceOfferPlacement" (
  "id" TEXT NOT NULL,
  "experienceMasterId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "placementType" TEXT NOT NULL DEFAULT 'PREFERRED',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperienceOfferPlacement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductMatchSuggestion" (
  "id" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "candidateProductId" TEXT NOT NULL,
  "experienceMasterId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "status" "ProductMatchSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductMatchSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExperienceOfferPlacement_experienceMasterId_productId_key" ON "ExperienceOfferPlacement"("experienceMasterId", "productId");
CREATE INDEX "ExperienceMaster_canonicalName_idx" ON "ExperienceMaster"("canonicalName");
CREATE INDEX "ExperienceMaster_cityName_stateName_countryName_idx" ON "ExperienceMaster"("cityName", "stateName", "countryName");
CREATE INDEX "Product_experienceMasterId_idx" ON "Product"("experienceMasterId");
CREATE UNIQUE INDEX "ProductMatchSuggestion_sourceProductId_candidateProductId_key" ON "ProductMatchSuggestion"("sourceProductId", "candidateProductId");
CREATE INDEX "ProductMatchSuggestion_status_createdAt_idx" ON "ProductMatchSuggestion"("status", "createdAt");
CREATE INDEX "ProductMatchSuggestion_fingerprint_idx" ON "ProductMatchSuggestion"("fingerprint");

ALTER TABLE "Product" ADD CONSTRAINT "Product_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExperienceOfferPlacement" ADD CONSTRAINT "ExperienceOfferPlacement_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperienceOfferPlacement" ADD CONSTRAINT "ExperienceOfferPlacement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMatchSuggestion" ADD CONSTRAINT "ProductMatchSuggestion_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMatchSuggestion" ADD CONSTRAINT "ProductMatchSuggestion_candidateProductId_fkey" FOREIGN KEY ("candidateProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMatchSuggestion" ADD CONSTRAINT "ProductMatchSuggestion_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
