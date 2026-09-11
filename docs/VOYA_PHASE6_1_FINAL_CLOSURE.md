# Voya Booking Core — Final Closure

This document records the final Phase 6.2 booking-core closure for the demo build. It is written as an operational hand-off, not as a phase-by-phase client presentation.

## What is covered

- Atomic booking creation with a required `Idempotency-Key` and semantic request fingerprinting.
- Instant confirmation, vendor confirmation, and platform manual-review booking modes.
- Inventory row locking for capacity authority, active holds for pending decisions, and deterministic expiry.
- Vendor and admin confirmation transitions that persist expiry before returning `BOOKING_CONFIRMATION_EXPIRED`.
- A database-backed scheduled expiry sweep (`BookingExpiryWorker`) with no in-memory ownership state. Set `BOOKING_EXPIRY_WORKER_ENABLED=false` for controlled local runs; Jest is automatically excluded.
- Immutable operational and commercial snapshots. Agent snapshots freeze tenant ID/name and the authenticated `user.sub`; question snapshots contain only the explicit stable definition fields.
- Role-safe `AgentBooking`, `VendorBooking`, and `AdminBooking` projections with timeline/detail views.
- Explicit price-change and cancellation-policy acknowledgement in the agent booking wizard. The server still validates both fingerprints and acknowledgements.
- Individual traveller rows and per-traveller answers under `travellerDetails[n].answers`.
- Draft-only booking-question add/edit/archive controls, SELECT options, revision locking, and transactional audit actions.
- Structural cancellation-policy validation: ranges are inclusive at both ends for the stored day values, so adjacent rules must not share an endpoint. Overlap returns `CANCELLATION_POLICY_AMBIGUOUS`. Missing periods are not silently treated as free cancellation.
- Final commercial quote authority: the committed `Booking.bookingMode` and immutable snapshots use the mode from the final locked quote, so status and inventory primitive cannot disagree with the final commercial decision.
- Deadline authority is centralized across vendor/admin confirm and reject. A due or late pending booking is expired and its active hold is released before the controlled `BOOKING_CONFIRMATION_EXPIRED` conflict is returned.
- Agent preview has no browser-controlled `now`; source-less preview/create does not require a fake price-change acknowledgement, while a real stale source quote still does.
- Booking creation requires exactly one lead traveller and rejects missing or duplicate leads with `LEAD_TRAVELLER_REQUIRED` or `MULTIPLE_LEAD_TRAVELLERS`.

## Operational screens

Agent users have Marketplace and My bookings. My bookings provides status, booking mode, immutable product/variant snapshot, price, confirmation deadline, traveller details, and lifecycle timeline. Cancellation and voucher actions are intentionally absent for canonical bookings.

Vendor users have canonical incoming booking queues: All, Needs Action, Pending, Confirmed, Rejected/Expired, and Legacy. Only `PENDING_VENDOR_CONFIRMATION` exposes Confirm/Reject. `PENDING_MANUAL_REVIEW` is view-only and explains that platform review is required.

Admins have a Bookings navigation item with Manual Review, Vendor Pending, Confirmed, Rejected, Expired, and Legacy queues. Manual confirm/reject is available only for `PENDING_MANUAL_REVIEW`.

Product Builder displays booking-question definitions on the working DRAFT revision. Submitted, published, rejected, and superseded revisions are read-only.

## Verification commands

From `activity-saas-backend`:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate status
npm test -- --runInBand
npm run build
npm run verify:phase4-1
npm run verify:phase4-2
npm run verify:phase5
npm run verify:phase6
```

`verify:phase6` preserves the legacy-data invariants and exercises the database idempotency uniqueness race with isolated cleanup. The focused service tests are named `bookings.service.spec.ts`, `booking-expiry.service.spec.ts`, `booking-snapshot.service.spec.ts`, `booking-projection.service.spec.ts`, and `cancellation-policy.service.spec.ts`.

`verify:phase6-2` is the canonical PostgreSQL closure verifier. It recorded 5 legacy bookings before the run, 22 bookings during the run (17 isolated canonical fixtures), and 5 bookings after cleanup. Snapshots, economics, holds, allocations, travellers and events returned to zero. It passed Instant, Vendor, Manual, expiry, late-rejection, source-quote, final-mode, last-capacity, same-key full-create and all six decision-race scenarios. The 39-suite / 189-test backend suite also passes.

## Archive scripts

The backend archive includes `scripts/backfill-phase6-bookings.ts`, `scripts/export-phase6-logical-backup.ts`, `scripts/verify-phase6-booking.ts`, `scripts/verify-phase6-2-booking.ts`, and the Phase 4/5 verification scripts. The logical backup is stored under `activity-saas-backend/backups/` and must be treated as sensitive database material.

## Scope boundary

This closure stops before the cancellation/refund engine, refunds, ledger, PNR, voucher, manifest, and settlement workflows. Those remain Phase 7+ work.
