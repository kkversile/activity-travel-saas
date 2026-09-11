-- Phase 6 prepare: canonical Booking data model alongside preserved legacy rows.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING_VENDOR_CONFIRMATION';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING_MANUAL_REVIEW';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'VENDOR_REJECTED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'MANUAL_REJECTED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'CONFIRMATION_EXPIRED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'FULFILLED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REDEEMED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_CHANGE_REQUESTED';

CREATE TYPE "BookingRecordType" AS ENUM ('LEGACY', 'CANONICAL');
CREATE TYPE "BookingQuestionType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT');

ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_tenantId_fkey";
ALTER TABLE "Booking" RENAME COLUMN "tenantId" TO "vendorTenantId";
ALTER TABLE "Booking" ADD COLUMN "recordType" "BookingRecordType" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "Booking" ADD COLUMN "agentTenantId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "agentUserId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "productRevisionId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "variantId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "distributionChannelId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "bookingMode" "BookingMode";
ALTER TABLE "Booking" ADD COLUMN "serviceTimezone" TEXT;
ALTER TABLE "Booking" ADD COLUMN "units" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "capacityConsumption" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Booking" ADD COLUMN "confirmationDueAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "expiredAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Booking" ADD COLUMN "requestFingerprint" TEXT;

ALTER TABLE "RatePlanCommercialVersion" ADD COLUMN "confirmationSlaMinutes" INTEGER;

CREATE TABLE "ProductBookingQuestion" (
    "id" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "BookingQuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "appliesPerTraveller" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductBookingQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "variantSnapshot" JSONB NOT NULL,
    "ratePlanSnapshot" JSONB NOT NULL,
    "sessionSnapshot" JSONB NOT NULL,
    "travellerSummary" JSONB NOT NULL,
    "capacityUnit" "CapacityUnit" NOT NULL,
    "capacityConsumption" INTEGER NOT NULL,
    "bookingMode" "BookingMode" NOT NULL,
    "cancellationPolicySnapshot" JSONB NOT NULL,
    "cancellationPolicyFingerprint" TEXT NOT NULL,
    "cancellationAcknowledgedAt" TIMESTAMP(3) NOT NULL,
    "pickupSnapshot" JSONB,
    "questionsSnapshot" JSONB NOT NULL,
    "bookingAnswers" JSONB NOT NULL,
    "agentSnapshot" JSONB NOT NULL,
    "channelSnapshot" JSONB NOT NULL,
    "confirmationPolicySnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingTraveller" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "travellerType" "TravellerType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "fullName" TEXT,
    "age" INTEGER,
    "email" TEXT,
    "phone" TEXT,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingTraveller_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus",
    "actorUserId" TEXT,
    "actorRole" "UserRole",
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ServiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_distributionChannelId_fkey" FOREIGN KEY ("distributionChannelId") REFERENCES "DistributionChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductBookingQuestion" ADD CONSTRAINT "ProductBookingQuestion_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingSnapshot" ADD CONSTRAINT "BookingSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingTraveller" ADD CONSTRAINT "BookingTraveller_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
