# Phase 10 Migration and Verification

Migrations:

- `20260922100000_phase10_supplier_quality_prepare` creates the enums and quality tables.
- `20260922110000_phase10_supplier_quality_finalize` adds constraints and indexes, including the partial current-tier and open-issue uniqueness indexes.
- `20260923100000_phase10_1_quality_integrity` adds the one-active-policy partial unique index and governance foreign keys.

The migrations do not backfill fabricated score/tier values and do not activate a policy. The intended backfill command is `scripts/backfill-phase10-quality.ts`; it reports vendor count, readiness distribution, assignments, snapshots, and active policies without converting readiness into quality. The verifier and all historical backfill/backup scripts are packaged in `backend-src.zip`.

Verification is split deliberately: `npm run verify:phase10` checks Phase 10 table availability and non-fabricated state; `npm run verify:phase10-1` checks migration, policy-band, ownership, traveller-unavailable, and historical-record invariants; and `npm run verify:phase10-2` creates isolated Vendor/Agent/Product/Booking/Schedule fixtures, executes the real performance and governance services, asserts SLA, service-date cancellation, fulfilment boundary, voucher, stop-sell, image, scoring, activation race, snapshot race, tier, issue, audit, and downstream no-effect results, then removes the fixtures. Direct unit coverage is in the quality suites, including service cohort/boundary behavior, evaluator, registry, tier validation, issue lifecycle, and security contracts. Build checks are `npx prisma validate`, `npx prisma generate`, backend `npm run build`, frontend `npm run build`, and `git diff --check`.

The executed Phase 10.2 runtime result is: SLA confirmation-within `33.33%` (`1/3`), vendor-response-within `100%` (`2/2`), average response `45` minutes, overdue `33.33%`, vendor cancellation `20%` (`2/10`), voucher readiness `14.29%` (`1/7`) after pre-boundary exclusion, stop-sell `3/3` unique sessions, image coverage `75%`, and traveller metrics `UNAVAILABLE`. The isolated activation race produced one active policy and one controlled conflict; concurrent capture returned one logical snapshot; tier history/ownership, issue lifecycle/audit, and downstream no-effect checks passed.
