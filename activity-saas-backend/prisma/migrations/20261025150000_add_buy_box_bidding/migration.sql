CREATE TYPE "BuyBoxStatus" AS ENUM ('CLOSED', 'OPEN', 'SUSPENDED');
CREATE TYPE "BuyBoxOfferStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REMOVED');
CREATE TYPE "BuyBoxBidStatus" AS ENUM ('ACTIVE', 'OUTBID', 'EXPIRED', 'WITHDRAWN');
CREATE TYPE "BuyBoxSelectionPolicy" AS ENUM ('CHEAPEST', 'HIGHEST_BID', 'BALANCED', 'ADMIN_SELECTED');

CREATE TABLE "BuyBox" (
  "id" TEXT NOT NULL,
  "experienceMasterId" TEXT NOT NULL,
  "status" "BuyBoxStatus" NOT NULL DEFAULT 'CLOSED',
  "displayMode" "ExperienceDisplayMode" NOT NULL DEFAULT 'SINGLE_OFFER',
  "selectionPolicy" "BuyBoxSelectionPolicy" NOT NULL DEFAULT 'HIGHEST_BID',
  "fallbackPolicy" "OfferSelectionPolicy" NOT NULL DEFAULT 'CHEAPEST',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "minimumBidAmount" DECIMAL(12,2),
  "minimumBidIncrement" DECIMAL(12,2),
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyBox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuyBoxOffer" (
  "id" TEXT NOT NULL,
  "buyBoxId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "status" "BuyBoxOfferStatus" NOT NULL DEFAULT 'ACTIVE',
  "manuallyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyBoxOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuyBoxBid" (
  "id" TEXT NOT NULL,
  "buyBoxOfferId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "BuyBoxBidStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyBoxBid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyBox_experienceMasterId_key" ON "BuyBox"("experienceMasterId");
CREATE INDEX "BuyBox_status_startsAt_endsAt_idx" ON "BuyBox"("status", "startsAt", "endsAt");
CREATE UNIQUE INDEX "BuyBoxOffer_buyBoxId_productId_key" ON "BuyBoxOffer"("buyBoxId", "productId");
CREATE INDEX "BuyBoxOffer_vendorId_status_idx" ON "BuyBoxOffer"("vendorId", "status");
CREATE INDEX "BuyBoxOffer_buyBoxId_status_idx" ON "BuyBoxOffer"("buyBoxId", "status");
CREATE INDEX "BuyBoxBid_buyBoxOfferId_status_submittedAt_idx" ON "BuyBoxBid"("buyBoxOfferId", "status", "submittedAt");
CREATE INDEX "BuyBoxBid_vendorId_status_idx" ON "BuyBoxBid"("vendorId", "status");

ALTER TABLE "BuyBox" ADD CONSTRAINT "BuyBox_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyBoxOffer" ADD CONSTRAINT "BuyBoxOffer_buyBoxId_fkey" FOREIGN KEY ("buyBoxId") REFERENCES "BuyBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyBoxOffer" ADD CONSTRAINT "BuyBoxOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyBoxOffer" ADD CONSTRAINT "BuyBoxOffer_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyBoxBid" ADD CONSTRAINT "BuyBoxBid_buyBoxOfferId_fkey" FOREIGN KEY ("buyBoxOfferId") REFERENCES "BuyBoxOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyBoxBid" ADD CONSTRAINT "BuyBoxBid_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
