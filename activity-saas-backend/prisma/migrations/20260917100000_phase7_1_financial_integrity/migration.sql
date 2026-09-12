-- Phase 7.1: financial integrity closure.
ALTER TYPE "public"."FinancialEventType" ADD VALUE IF NOT EXISTS 'CANCELLATION_FINANCIAL_RESOLVED';

ALTER TABLE "public"."BookingCancellation"
  ADD CONSTRAINT "BookingCancellation_bookingAmount_nonnegative" CHECK ("bookingAmount" >= 0),
  ADD CONSTRAINT "BookingCancellation_cancellationCharge_nonnegative" CHECK ("cancellationCharge" >= 0),
  ADD CONSTRAINT "BookingCancellation_refundEntitlement_nonnegative" CHECK ("refundEntitlement" >= 0);

ALTER TABLE "public"."Refund"
  ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0);
