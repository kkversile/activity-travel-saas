-- CreateEnum
CREATE TYPE "CancellationInitiator" AS ENUM ('AGENT', 'VENDOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CancellationReasonCategory" AS ENUM ('CUSTOMER_REQUEST', 'VENDOR_OPERATIONAL', 'WEATHER', 'SAFETY', 'FORCE_MAJEURE', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "CancellationFinancialState" AS ENUM ('CANCELLED_PENDING_FINANCIAL', 'CANCELLED_NO_REFUND', 'CANCELLED_PARTIAL_REFUND', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "FinancialEventType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'REFUND_CREATED', 'REFUND_CONFIRMED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "FinancialEventStatus" AS ENUM ('POSTED', 'PENDING', 'FAILED');

-- CreateTable
CREATE TABLE "BookingCancellation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "initiator" "CancellationInitiator" NOT NULL,
    "initiatedByUserId" TEXT,
    "initiatedByTenantId" TEXT,
    "reasonCategory" "CancellationReasonCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL,
    "serviceTimezone" TEXT NOT NULL,
    "serviceDateLocal" TEXT NOT NULL,
    "cancellationDateLocal" TEXT NOT NULL,
    "daysBeforeService" INTEGER NOT NULL,
    "policyFingerprint" TEXT,
    "matchedPolicyRule" JSONB,
    "bookingAmount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "cancellationCharge" DECIMAL(18,4) NOT NULL,
    "refundEntitlement" DECIMAL(18,4) NOT NULL,
    "financialState" "CancellationFinancialState" NOT NULL,
    "idempotencyKey" TEXT,
    "requestFingerprint" TEXT,
    "calculationSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "cancellationId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "cancellationId" TEXT,
    "refundId" TEXT,
    "type" "FinancialEventType" NOT NULL,
    "status" "FinancialEventStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4),
    "components" JSONB NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingCancellation_bookingId_key" ON "BookingCancellation"("bookingId");

-- CreateIndex
CREATE INDEX "BookingCancellation_initiator_financialState_idx" ON "BookingCancellation"("initiator", "financialState");

-- CreateIndex
CREATE INDEX "BookingCancellation_financialState_createdAt_idx" ON "BookingCancellation"("financialState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingCancellation_bookingId_idempotencyKey_key" ON "BookingCancellation"("bookingId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_cancellationId_key" ON "Refund"("cancellationId");

-- CreateIndex
CREATE INDEX "Refund_bookingId_status_idx" ON "Refund"("bookingId", "status");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_eventKey_key" ON "FinancialEvent"("eventKey");

-- CreateIndex
CREATE INDEX "FinancialEvent_bookingId_occurredAt_idx" ON "FinancialEvent"("bookingId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialEvent_type_status_occurredAt_idx" ON "FinancialEvent"("type", "status", "occurredAt");

-- AddForeignKey
ALTER TABLE "BookingCancellation" ADD CONSTRAINT "BookingCancellation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "BookingCancellation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "BookingCancellation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
