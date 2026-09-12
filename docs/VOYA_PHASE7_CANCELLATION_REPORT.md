# Voya Phase 7 Cancellation and Refund Core Report

Phase 7 adds whole-booking cancellation, refund instructions, and the append-only financial-event foundation. It stops before payment-gateway execution, rescheduling, fulfilment, vouchers, manifests, settlement, and payouts.

## Delivered

- Agent cancellation preview and create for confirmed canonical bookings, calculated only from the immutable `BookingSnapshot` policy/session context and `BookingEconomicsSnapshot.finalAmount`.
- Service-timezone calendar-day calculation and snapshotted service-start boundary.
- Decimal percentage/absolute charge calculation with clamping and explicit two-decimal rounding.
- Agent idempotency, fingerprint protection, ownership checks, pending-booking withdrawal, and exact-one allocation/hold release.
- Vendor and Admin operational cancellation with distinct initiators and unresolved financial responsibility represented as `CANCELLED_PENDING_FINANCIAL`.
- Separate `Refund` instruction workflow: pending, confirmed, failed, and explicit retry. Confirmation records an external reference; it does not transfer money.
- Append-only `FinancialEvent` records for confirmation, cancellation, refund creation, confirmation, and failure.
- Agent-safe, vendor-safe, and admin/finance-visible cancellation projections and a Refund queue.

## Verification evidence

The real PostgreSQL verifier used prefix `phase7-9b020098-bfb4-4024-80c1-ed644e143599`. Before: 5 legacy bookings, 0 cancellations, 0 refunds, 0 financial events, 0 holds and 0 allocations. During: 13 bookings, 8 cancellations, 3 refunds, 21 financial events, 1 hold and 7 allocations. After cleanup: 5 bookings and zero Phase 7 fixtures. All five legacy bookings were untouched.

Passed scenarios: free snapshot-policy cancellation and historical-policy protection; 50% Decimal penalty; 100% no-refund; Agent idempotency; Vendor cancellation; Admin cancellation; pending withdrawal; refund confirmation; refund failure/retry; finance resolution; and double-cancellation race.

The backend suite is 39 suites / 189 tests passing. Backend and frontend builds pass. Phase 4.1, Phase 4.2, Phase 5, Phase 6 and Phase 6.2 verifiers pass. Prisma migration status is up to date after the Phase 7 migration.

## Operational boundary

`Booking.status` becomes `CANCELLED`; financial state remains on `BookingCancellation`. `BookingEconomicsSnapshot` and `BookingSnapshot` are never rewritten. Vendor/Admin responsibility remains pending until the business decision is approved.

## Phase 7.1 Final Financial Integrity Closure

- Agent existing-cancellation reads and uniqueness-conflict reloads are tenant scoped; Vendor existing-cancellation reads are vendor scoped. Cancellation idempotency keys are generated with `crypto.randomUUID()` and retained only for the active UI attempt.
- Refund transitions lock the Refund row with PostgreSQL `FOR UPDATE`. Confirm/fail races produce one terminal Refund state and one terminal transition event. Reconfirming with the same external reference is idempotent; a different reference returns `REFUND_ALREADY_CONFIRMED_DIFFERENT_REFERENCE`.
- Finance resolution locks `BookingCancellation`, rejects invalid/negative/out-of-bounds money, enforces the rounded charge-plus-refund total, and appends `CANCELLATION_FINANCIAL_RESOLVED`. Zero-refund resolutions still append this event.
- Unresolved Vendor/Admin `BOOKING_CANCELLED` events are `PENDING` with `amount = null`; deterministic Agent cancellations are `POSTED` with `amount = cancellationCharge`. Historical events are never updated.
- Pending canonical cancellations require exactly one active hold; confirmed cancellations require exactly one confirmed allocation. Operational dates use the immutable snapshot timezone.

The dedicated `npm run verify:phase7-1` run passed with real PostgreSQL: refund race, finance-resolution race, Agent/Vendor race, cross-Agent denial, cross-Vendor denial, money constraints, strict money validation, pending-hold invariant, and financial-event semantics. Its temporary fixtures were removed.
