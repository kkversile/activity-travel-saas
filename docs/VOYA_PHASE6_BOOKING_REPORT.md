# Voya Phase 6 Booking Core Report

Phase 6 adds the authoritative booking core on top of the closed catalogue, commercial, inventory, eligibility and marketplace domains. Legacy booking rows remain readable through the compatibility endpoints; new agent bookings are `CANONICAL`.

## Delivered

- Atomic agent preview/create with final in-transaction eligibility and commercial revalidation.
- Idempotency by `(agentTenantId, idempotencyKey)` and SHA-256 semantic request fingerprint.
- Immutable operational and economics snapshots, traveller rows, validated answers, cancellation-policy acknowledgement, booking events, audit and outbox records.
- `INSTANT`, `VENDOR_CONFIRMATION`, and `MANUAL_ON_REQUEST` flows.
- Vendor confirm/reject, admin manual confirm/reject, and booking-owned SLA expiry.
- Role-safe agent, vendor and admin projections with tenant scoping.
- Revision-safe product booking questions, cloned with product revisions and editable only while DRAFT.

## Explicitly deferred

Cancellation charges/engine, refunds, amendments, fulfilment/PNR, voucher versioning, manifest, ledger, settlement and payout changes remain out of scope.

## Validation status

Backend: 39 suites / 189 tests passing. Backend and frontend production builds pass. Prisma reports the database schema is up to date. The real Phase 6.2 PostgreSQL harness started at 5 legacy bookings, 0 snapshots, 0 economics snapshots, 0 holds, 0 allocations, 0 travellers and 0 events; during verification it created 17 isolated canonical bookings, 17 operational snapshots, 17 economics snapshots, 13 holds, 6 allocations, 17 travellers and 47 events; after cleanup it returned to exactly the original counts. All five legacy bookings were untouched.

The real canonical flow passed for Instant, Vendor Confirmation, Manual Review, vendor/admin rejection, expiry, late rejection, source-less preview/create, stale source-quote acknowledgement, final-quote mode locking, the last-capacity create race and the same-key full-create idempotency race. The six real decision races also passed: vendor confirm/reject, vendor confirm/expiry, vendor reject/expiry, manual confirm/reject, manual confirm/expiry and manual reject/expiry. Each produced one terminal decision event, one terminal hold state and at most one allocation.

The browser-facing booking wizard now renders bounded cancellation ranges (`On the service day`, `1-5 days before service`, and `6+ days before service`) with percentage or quote-currency fixed charges. Agent preview no longer accepts a client-controlled clock, and booking creation requires exactly one lead traveller.
