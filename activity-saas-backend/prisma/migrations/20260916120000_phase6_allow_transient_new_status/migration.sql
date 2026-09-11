-- NEW is the transaction-internal state inserted before inventory locking.
-- BookingService must transition it before the transaction commits.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_canonical_status_context_check";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_canonical_status_context_check" CHECK (
  "recordType" = 'LEGACY' OR "status" IN ('NEW', 'CONFIRMED', 'PENDING_VENDOR_CONFIRMATION', 'PENDING_MANUAL_REVIEW', 'VENDOR_REJECTED', 'MANUAL_REJECTED', 'CONFIRMATION_EXPIRED', 'FULFILLED', 'REDEEMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CHANGE_REQUESTED')
);
