-- Partner Hub taxonomy, itinerary, location verification, media provenance,
-- team invitations and scheduled report persistence. This migration is additive.

ALTER TABLE "ProductMedia"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "rightsStatus" TEXT,
  ADD COLUMN "rightsNote" TEXT,
  ADD COLUMN "providerPlaceId" TEXT;

ALTER TABLE "ProductRevision" ADD COLUMN "category" TEXT;

ALTER TABLE "Promotion"
  ADD COLUMN "promotionType" TEXT NOT NULL DEFAULT 'PERCENTAGE_OFF',
  ADD COLUMN "discountAmount" DECIMAL(12,2),
  ADD COLUMN "bookingStartsAt" TIMESTAMP(3),
  ADD COLUMN "bookingEndsAt" TIMESTAMP(3),
  ADD COLUMN "validWeekdays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "stackWithPlatform" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fundingOwner" TEXT NOT NULL DEFAULT 'SUPPLIER';

CREATE TABLE "ActivityCategory" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivityCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityCategory_code_key" ON "ActivityCategory"("code");
CREATE INDEX "ActivityCategory_active_displayOrder_idx" ON "ActivityCategory"("active", "displayOrder");

CREATE TABLE "ActivitySubcategory" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActivitySubcategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivitySubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ActivityCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActivitySubcategory_categoryId_code_key" ON "ActivitySubcategory"("categoryId", "code");
CREATE INDEX "ActivitySubcategory_categoryId_active_displayOrder_idx" ON "ActivitySubcategory"("categoryId", "active", "displayOrder");

CREATE TABLE "ItineraryStop" (
  "id" TEXT NOT NULL,
  "productRevisionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "stopName" TEXT NOT NULL,
  "stopType" TEXT NOT NULL,
  "stayDurationMinutes" INTEGER,
  "travelTimeToNextMinutes" INTEGER,
  "ticketPolicy" TEXT,
  "replacementStop" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItineraryStop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ItineraryStop_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ItineraryStop_productRevisionId_sequence_key" ON "ItineraryStop"("productRevisionId", "sequence");
CREATE INDEX "ItineraryStop_productRevisionId_sequence_idx" ON "ItineraryStop"("productRevisionId", "sequence");

CREATE TABLE "ProductLocationVerification" (
  "id" TEXT NOT NULL,
  "productRevisionId" TEXT NOT NULL,
  "address" TEXT,
  "lat" DECIMAL(10,7),
  "lon" DECIMAL(10,7),
  "meetingPoint" TEXT,
  "provider" TEXT,
  "providerPlaceId" TEXT,
  "sourceUrl" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductLocationVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductLocationVerification_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductLocationVerification_productRevisionId_key" ON "ProductLocationVerification"("productRevisionId");

CREATE TABLE "VendorTeamInvitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'VIEWER',
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorTeamInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorTeamInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VendorTeamInvitation_tenantId_email_key" ON "VendorTeamInvitation"("tenantId", "email");
CREATE INDEX "VendorTeamInvitation_tenantId_status_idx" ON "VendorTeamInvitation"("tenantId", "status");

CREATE TABLE "ReportSchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportName" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "runTime" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ReportSchedule_tenantId_status_idx" ON "ReportSchedule"("tenantId", "status");
