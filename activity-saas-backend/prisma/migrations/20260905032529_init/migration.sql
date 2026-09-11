-- CreateEnum
CREATE TYPE "TenantKind" AS ENUM ('PLATFORM', 'VENDOR', 'TRAVEL_AGENT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUB_ADMIN', 'VENDOR', 'TRAVEL_AGENT', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "VendorVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('ACTIVITY', 'MEALS', 'TRANSFER', 'PACKAGE_ADDON', 'OTHERS');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'LIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RatePlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "TravellerType" AS ENUM ('ADULT', 'CHILD', 'SENIOR', 'YOUTH', 'INFANT', 'GROUP');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('PERCENTAGE', 'ABSOLUTE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "TenantKind" NOT NULL DEFAULT 'VENDOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalBusinessName" TEXT NOT NULL,
    "operatingCity" TEXT NOT NULL,
    "operatingRegion" TEXT NOT NULL,
    "gstin" TEXT,
    "category" TEXT,
    "verificationStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "readinessScore" INTEGER NOT NULL DEFAULT 0,
    "payoutAccountMasked" TEXT,
    "documentStatus" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
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
    "status" "ActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityMedia" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ActivityMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "ratePlanCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RatePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "unitType" TEXT NOT NULL DEFAULT 'per_person',
    "basePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dynamicInventory" BOOLEAN NOT NULL DEFAULT false,
    "freehold" BOOLEAN NOT NULL DEFAULT false,
    "minPax" INTEGER NOT NULL DEFAULT 1,
    "maxPax" INTEGER NOT NULL DEFAULT 99,
    "affiliates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sameItineraryVendor" BOOLEAN NOT NULL DEFAULT false,
    "transferType" INTEGER,
    "ticketLinkedToSightseeing" BOOLEAN NOT NULL DEFAULT false,
    "sightseeingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attachedHotelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "luxuryTier" TEXT,
    "validDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blackoutDates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "suitableFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slotAvailable" BOOLEAN NOT NULL DEFAULT true,
    "zoneApplicable" BOOLEAN NOT NULL DEFAULT false,
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatePnr" TEXT,
    "vendorRatePlanCode" TEXT,
    "formDataRequired" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "durationMinutes" INTEGER,
    "pointsOfInterest" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mealIncluded" BOOLEAN NOT NULL DEFAULT false,
    "mealType" TEXT,
    "menu" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mealVariety" TEXT,
    "timeOfDay" TEXT,
    "scheduleStartTime" TEXT,
    "scheduleEndTime" TEXT,
    "pickupIncluded" BOOLEAN NOT NULL DEFAULT false,
    "pickupTimings" TEXT,
    "dropoffIncluded" BOOLEAN NOT NULL DEFAULT false,
    "dropoffTimings" TEXT,
    "vehicleType" TEXT,
    "privateShared" TEXT,
    "ticketOnly" BOOLEAN NOT NULL DEFAULT false,
    "entryFeeIncluded" BOOLEAN NOT NULL DEFAULT false,
    "vendorCode" TEXT,
    "vendorVoucherFlag" BOOLEAN,
    "offlineVoucher" BOOLEAN NOT NULL DEFAULT false,
    "instantConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "autoRedeem" BOOLEAN NOT NULL DEFAULT false,
    "pickupType" TEXT,
    "pickupInput" TEXT,
    "salience" INTEGER,
    "qrType" TEXT,
    "cutOffMinutes" INTEGER NOT NULL DEFAULT 0,
    "adultRequired" BOOLEAN NOT NULL DEFAULT false,
    "minAdultRequired" INTEGER NOT NULL DEFAULT 0,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravellerRule" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "type" "TravellerType" NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "minCount" INTEGER NOT NULL DEFAULT 0,
    "maxCount" INTEGER NOT NULL DEFAULT 99,
    "price" DECIMAL(12,2),

    CONSTRAINT "TravellerRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRule" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "minDaysBefore" INTEGER NOT NULL,
    "maxDaysBefore" INTEGER,
    "chargeValue" DECIMAL(10,2) NOT NULL,
    "chargeType" "ChargeType" NOT NULL,

    CONSTRAINT "CancellationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "slotDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "available" INTEGER NOT NULL,
    "priceOverride" DECIMAL(12,2),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxDiscountedBookings" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "ratePlanId" TEXT,
    "bookingCode" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "pax" INTEGER NOT NULL,
    "paxBreakdown" JSONB NOT NULL DEFAULT '{}',
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL,
    "dueDate" DATE NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_tenantId_key" ON "VendorProfile"("tenantId");

-- CreateIndex
CREATE INDEX "Activity_tenantId_status_idx" ON "Activity"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Activity_tenantId_cityName_idx" ON "Activity"("tenantId", "cityName");

-- CreateIndex
CREATE INDEX "ActivityMedia_activityId_kind_idx" ON "ActivityMedia"("activityId", "kind");

-- CreateIndex
CREATE INDEX "RatePlan_activityId_status_idx" ON "RatePlan"("activityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_activityId_ratePlanCode_key" ON "RatePlan"("activityId", "ratePlanCode");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerRule_ratePlanId_type_key" ON "TravellerRule"("ratePlanId", "type");

-- CreateIndex
CREATE INDEX "CancellationRule_ratePlanId_minDaysBefore_idx" ON "CancellationRule"("ratePlanId", "minDaysBefore");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_slotDate_idx" ON "AvailabilitySlot"("slotDate");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_ratePlanId_slotDate_startTime_key" ON "AvailabilitySlot"("ratePlanId", "slotDate", "startTime");

-- CreateIndex
CREATE INDEX "Promotion_activityId_active_idx" ON "Promotion"("activityId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "Booking"("bookingCode");

-- CreateIndex
CREATE INDEX "Booking_tenantId_status_idx" ON "Booking"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Booking_tenantId_serviceDate_idx" ON "Booking"("tenantId", "serviceDate");

-- CreateIndex
CREATE INDEX "Payout_tenantId_status_idx" ON "Payout"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityMedia" ADD CONSTRAINT "ActivityMedia_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerRule" ADD CONSTRAINT "TravellerRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRule" ADD CONSTRAINT "CancellationRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
