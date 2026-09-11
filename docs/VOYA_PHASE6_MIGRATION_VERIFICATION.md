# Phase 6 Migration and Database Verification

## Migrations

- `20260916100000_phase6_booking_core_prepare`: enum expansion, vendor ownership rename, canonical columns, question/snapshot/event tables and booking FKs.
- `20260916110000_phase6_booking_core_finalize`: canonical integrity/status constraints and indexes.
- `20260916120000_phase6_allow_transient_new_status`: permits the transaction-internal canonical `NEW` state before final transition.

## Backup and counts

`activity-saas-backend/backups/phase6-postgresql18-logical-data-20260911.sql` is the generated PostgreSQL 18.6 logical data backup. The installed `pg_dump` client was PostgreSQL 16 and correctly refused a server-version mismatch; the backup was therefore queried through the PostgreSQL 18 server using Prisma and emitted as SQL inserts.

Pre-verification baseline and post-cleanup counts: Booking 5, BookingSnapshot 0, BookingEconomicsSnapshot 0, InventoryHold 0, InventoryAllocation 0, BookingTraveller 0 and BookingEvent 0. The Phase 6.2 isolated PostgreSQL run created and asserted 17 canonical bookings, 17 snapshots, 17 economics snapshots, 13 holds, 6 allocations, 17 travellers and 47 events before cleanup, then restored the baseline. Product 31, ProductVariant 35, RatePlan 44, ServiceSession 128 and InventoryState 124 remained the seeded reference counts. All five legacy bookings were preserved.

`npm run backfill:phase6` is idempotent and only marks non-canonical rows as `LEGACY`. `npm run verify:phase6` checks all five IDs/codes, legacy modern-field invariants, no legacy modern relations, duplicate idempotency keys, and no active linked hold outside a pending booking.

`npm run verify:phase6-2` runs the real service path against PostgreSQL: preview/create, final commercial mode locking, Instant allocation, Vendor hold/confirm/reject, Manual confirm/reject, expiry and late rejection, source-less/stale quote behavior, last-capacity create race, same-key full-create race, and six confirm/reject/expiry decision races. It uses a unique fixture prefix, restores modified inventory exactly, and removes only its own records.
