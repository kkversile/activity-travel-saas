# Phase 6 Idempotency and Concurrency Notes

## Protected boundaries

1. The canonical booking root is inserted before `InventoryState` locking.
2. `InventoryReservationService` exposes transaction-aware methods; booking code never opens a nested independent transaction.
3. Linked hold/allocation rows have real restrictive foreign keys.
4. Generic hold expiry/release/convert methods reject booking-linked transitions with `BOOKING_HOLD_TRANSITION_REQUIRED`.
5. Vendor/admin decisions lock the booking and recheck status/deadline before changing inventory.

## Test evidence

The real PostgreSQL Phase 6.2 harness used two concurrent full `BookingsService.create()` calls with different idempotency keys at last capacity. It observed exactly one confirmed booking and one confirmed allocation, with no orphan `NEW` booking or failed-request snapshot. A second concurrent full-create run with the same semantic request and idempotency key returned one booking identity to both callers and consumed inventory once. The harness removed only the isolated fixtures and restored the inventory rows exactly; no legacy booking changed.

Six real decision races also passed: vendor confirm/reject, vendor confirm/expiry, vendor reject/expiry, manual confirm/reject, manual confirm/expiry and manual reject/expiry. Each booking ended in one terminal state with one terminal event, a terminal hold, at most one allocation, and non-negative held/confirmed capacity. Deadline races ended in `CONFIRMATION_EXPIRED` rather than rejection or confirmation.

The run counts were: before `Booking 5 / Snapshot 0 / Economics 0 / Hold 0 / Allocation 0 / Traveller 0 / Event 0`; during `Booking 22 / Snapshot 17 / Economics 17 / Hold 13 / Allocation 6 / Traveller 17 / Event 47`; after cleanup the exact before counts were restored.

The service path additionally catches the uniqueness conflict outside the transaction, reloads the existing booking, compares request fingerprints, and returns the existing role-safe projection or a 409 conflict.
