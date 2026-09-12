# VOYA Phase 8 Migration and Verification

## Applied migrations

- `20260918100000_phase8_fulfilment_core_prepare`: fulfilment enums/tables, BookingSnapshot policy JSON, foreign keys, indexes, and current-row partial uniqueness.
- `20260918110000_phase8_fulfilment_core_finalize`: removes the seven legacy RatePlan fulfilment columns after provenance backfill.

`npx prisma migrate status` reports the database schema up to date. Prisma format, validate, and generate pass. No PostgreSQL reset or destructive data reset was used.

## Latest verification state

| Entity | Count |
|---|---:|
| ProductRevision | 34 |
| RatePlan | 44 |
| Canonical Booking | Controlled fixtures are cleaned after each verifier |
| BookingSnapshot | Controlled fixtures are cleaned after each verifier |
| BookingCancellation | Controlled fixtures are cleaned after each verifier |
| FileAsset | 14 |

Verifier fixtures are isolated and cleaned. Existing legacy/demo rows are retained; no destructive reset is used.

## Verification commands

The current backend baseline is 46 suites / 220 tests. The Phase 4.1, 4.2, 5, 6, 6.2, 7, 7.1, 8, 8.1, and 8.2 verifiers are retained and passed. Backend and frontend production builds pass. The fresh logical PostgreSQL-18 backup is maintained under `activity-saas-backend/backups/` and is sensitive database material.
