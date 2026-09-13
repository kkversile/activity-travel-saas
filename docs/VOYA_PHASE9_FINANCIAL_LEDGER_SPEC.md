# Phase 9 — Financial Ledger Specification

`FinancialEvent` is the historical ledger. Booking, cancellation, and refund state machines remain authoritative for their own operational states; settlement consumes posted ledger facts and never rewrites those state machines.

Every new event requires `vendorTenantId`. `bookingId`, `agentTenantId`, `settlementBatchId`, `payoutId`, and `vendorAmount` are optional where the event is not booking-specific. Amounts use PostgreSQL `numeric(18,4)` and are serialized as decimal strings at API boundaries.

Supported financial event types include `BOOKING_CONFIRMED`, refund/cancellation events, `VENDOR_ADJUSTMENT`, `PROMOTION_FUNDED`, `SETTLEMENT_BATCH_CREATED`, and `PAYOUT_RELEASED`. Events are append-only facts. A correction is another event with a signed amount, reason, reference, actor, and timestamp.

Booking economics are read from `BookingEconomicsSnapshot`; settlement does not recalculate customer pricing, supplier commission, tax, promotion funding, or Voya margin. Vendor projections expose booking value, supplier basis where applicable, vendor payable, informational tax, promotion information, adjustments, and net payable. Internal-only economics and rule traces are excluded from vendor projections.

The schema requires tenant foreign keys with restrictive deletion behavior and indexes ledger reads by vendor/time, booking/time, and event type/status/time.
