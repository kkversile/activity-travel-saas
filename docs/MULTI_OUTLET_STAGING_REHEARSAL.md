# Staging-copy migration rehearsal and deployment readiness

This is the pre-deployment checkpoint. The later user-approved live rollout is documented in `MULTI_OUTLET_LIVE_DEPLOYMENT.md`.

17 November 2026. The client-facing application and its database were not modified. Source inspection, the logical snapshot and beneficiary/file checks were read-only. No messages, payment releases or real transfers were sent.

## Snapshot and isolation

The source was the active demo service `voya-api-demo-6dee862.service`, database `activity_saas`, PostgreSQL 15.20. A consistent custom-format pg_dump15 snapshot was captured at **08:39 IST on 17 November 2026**, with `default_transaction_read_only=on`, no owner/ACL restoration. The first attempt using the app DB role was denied access to the unrelated neon_auth schema; a fresh complete snapshot used the postgres OS identity with read-only transactions. The incomplete file was not used.

The dump is 2,571,383 bytes; SHA-256 `af0fba4c97d88059e1a5518ab60f26dbee480199cc7ce932de830b8a37be6694`. It remains outside the repository in a private temporary directory with Windows ACL restricted to the current user and SYSTEM. No source DB password, encryption key, full bank account or row contents were written into tracked evidence.

Two independent copies were restored:

- Local PostgreSQL 16, `127.0.0.1:55439/voya_outlet_staging_20261117`.
- Matching PostgreSQL **15.20**, in a separate scratch cluster under `/var/tmp/voya-outlet-staging-pg15-20261117/data`, listening only on loopback port 55441 and reached through a separate SSH tunnel on local port 55445. Its data directory, port and catalogs are separate from the live cluster on 5432. No systemd unit or live configuration was changed. The scratch cluster and its tunnel are stopped after verification; private rehearsal data is retained offline.

## Results

| Check | Result |
| --- | --- |
| Source migration history | 97 successful migrations, 17 rolled-back historical attempts, zero unfinished attempts; only the new outlet migration pending |
| New migration deploy | Passed on both restored copies using Prisma migrate deploy; no invented baseline or edited migration rows |
| Backfill dry-run/apply/repeat | Passed on both copies; repeat counts and business-data fingerprints stable |
| Original application tables | All 121 tables retain row counts and original business data; attribution columns and expected updatedAt bookkeeping excluded from comparison |
| Resulting defaults | 11 vendors, 11 default outlets, exactly one default per vendor |
| Products/bookings/resources | All 33 products, 17 bookings and the legacy resource attributed; no unresolved rows |
| Settlements/payouts/reports | All 4 historical batches, 7 payouts and 3 existing report exports attributed; IDs, statuses, amounts and report payloads retained |
| Finance preservation | Booking amount 70,174.70; payout amount 358,396.0000; event vendor amount 29,328.0000 unchanged; original ledger rows, allocations, invoice and economics snapshots fingerprinted |
| Vendor-wide adjustments | Three remain explicitly vendor-wide; not silently assigned or altered |
| Source consistency | Zero booking/product tenant mismatches, event/booking tenant mismatches or duplicate canonical payout weeks |
| Beneficiary readiness | All six encrypted onboarding accounts decrypt under the existing source key; the one previously verified eligible beneficiary has an accessible verified selected proof and is migrated |
| Existing unpaid canonical beneficiary blockers | Zero; all four canonical historical payouts are reconciled |
| Application compatibility | 150 successful HTTP checks across all 13 active existing users, including 10 vendor logins, admin and agent accounts; three historical report downloads checked |
| Financial state after HTTP smoke | Unchanged; background jobs, SMTP, webhook and AI activity disabled in staging |
| Synthetic new-feature regression suite | 20 scenarios passed, including guessed-ID denial, live revocation, shared banks, cancellation, inactive obligations and concurrent settlement protection |
| Backend | Build passed; 115 suites / 675 tests passed after backfill changes |
| Frontend | Latest unchanged frontend build and 45 files / 241 tests passed; no frontend source changes in this staging follow-up |

The first HTTP probe intentionally used a SELECT-only staging role. Two onboarding GETs hit the pre-existing supplemental-data normalization write and were denied. The same routes passed using an explicitly enabled isolated staging writer. This was a test-role constraint rather than an introduced failure; the runtime onboarding implementation was unchanged. Financial table fingerprints were compared before and after the complete HTTP smoke. No password reset or real user credential was needed: ephemeral local JWTs exercised the existing live-user guard against the copied rows.

## Repairs prompted by real data

1. Backfill now attributes historical report exports and schedules for pre-expansion single-location vendors. Otherwise employees with default-outlet access could lose existing exports; future location expansion could also leave old schedules tenant-wide. All three copied exports now download correctly.
2. Adjustment-only/empty historical settlement batches were missed by booking-only inference. Backfill now assigns those to a vendor's sole outlet only when booking, event and allocation evidence does not conflict by tenant or outlet. Their related payout/system-event attribution is carried forward. It retains ambiguous multi-outlet rows for review and never fabricates beneficiary snapshots.
3. Dry-run booking counts now include rows whose products receive their default outlet during the same backfill. The initial restored-copy dry-run correctly reports all 17 candidates.

## Inherited conditions, explicitly retained

- Twenty-five apparent old checksum differences are Windows CRLF versus canonical LF. One substantive pre-existing mismatch remains: `20261031120000_partner_hub_gap_models`. Its applied history was not rewritten. Prisma deploy successfully applied only the new migration on the real restored history.
- Existing schema drift includes additional useful indexes, some timestamp/default definitions, one FK delete action, index naming and a missing SupplierQualityPolicy version uniqueness declaration relative to the datamodel. Full before/after drift SQL is recorded as evidence only; it was **not executed**. The targeted additive outlet migration preserves these existing objects and data. Do not run db push, migrate reset or wholesale drift SQL during rollout.
- The old chronological migration chain still has its previously documented fresh-install ordering issue. Deploying to this existing database does not replay that chain; the rehearsal used the actual restored history, without baselining it.
- Ten vendor outlets have no migrated verified bank. New payouts there intentionally remain blocked pending genuine bank entry/proof/review. Do not promote masked-only or pending accounts to avoid this safeguard. This does not block the existing reconciled canonical history.
- One old verified bank-proof version points to a missing file. The selected proof for the only eligible beneficiary exists. The old missing version is recorded for separate document recovery; no live files/statuses were changed or invented.

These inherited conditions are disclosed rather than silently repaired through destructive schema changes or fabricated bank verification. The new migration and application compatibility checks passed against this actual state.

## Approved deployment procedure (not executed)

The implementation is ready for a **controlled deployment with migration and backfill**. It is not a code-only pull/restart. The remaining approval is for the live change itself, not for an unfinished staging rehearsal.

1. Selectively commit the complete changed-file inventory, including new modules/migration/scripts/components; exclude .env files, snapshots, uploads and unrelated archives. Confirm branch push will not auto-deploy unexpectedly. No push was performed in this task.
2. At the approved cutover window, confirm the service/revision and database are still the expected target. Take a fresh full database backup and preserve shared uploads and the existing encryption key. Check migration status, unfinished attempts, tenant consistency and canonical week duplicates again because clients can add data after this snapshot.
3. Pause mutating traffic and background workers by stopping the old backend during the controlled window. Keep the previous release available. Do not run a second live-backed candidate with active schedulers while the old app is still writing.
4. In the prepared backend release, generate the client and run Prisma deploy with the database-owner migration role, not the restricted runtime app role. On this host the successful method was postgres over `/var/run/postgresql`; grant the runtime role CRUD/enum usage on the newly created outlet tables afterward. Preserve existing ownership. Then `npm run backfill:multi-outlet` (dry-run). Inspect the output and run `npm run backfill:multi-outlet -- --apply`; repeat and verify counts/orphans, immutable financial sums, default uniqueness, bank provenance and report attribution. The backfill only accepts loopback URLs; use the target server's local connection. Do not use the snapshot-restoration scripts against live.
5. Start the matching backend and frontend together. Smoke-test health, login, configured theme, admin dashboard, owner default/All scope, existing bookings/products, agent dashboard/discovery, reports and finance history. Verify denied employee cross-outlet access before exposing new multi-outlet membership use. No actual payment release is part of this smoke.
6. Reopen traffic when those checks pass. Owners can then add outlets and complete real bank verification for additional beneficiaries.
7. If migration/backfill fails, keep traffic paused, preserve diagnostics, and retry or restore the approved backup after review. Do not reset or destructively drop expansion data. If rolling the app back before multi-outlet use begins, keep expansion tables/columns and schedule a later attribution catch-up. **After multiple outlets/employees are in use, do not serve the old tenant-wide backend to those employees:** keep vendor access paused and fix forward, or use an explicitly reviewed restricted rollback. An old app cannot enforce new outlet permissions.

## Evidence and reproducibility

See `multi-outlet-evidence/staging-copy-rehearsal.json`, `staging-copy-pg15-rehearsal.json`, `staging-http-smoke.json`, `staging-http-pg15-smoke.json`, `staging-snapshot-manifest.json` and `staging-beneficiary-check.json`. They contain counts/fingerprints/statuses, not copied personal records or bank secrets.

Backend scripts `rehearse:staging-snapshot` and `verify:staging-copy` hard-restrict dedicated loopback database/role pairs. The restoration command requires `--apply`; `--reset-staging` can only recreate the named disposable copy. A snapshot path must be supplied explicitly via STAGING_SNAPSHOT_FILE. The PG15 tunnel must terminate at the separate scratch cluster, never the production port. HTTP smoke uses `--allow-staging-writes` only for the copied onboarding normalization behaviour and checks that financial records remain unchanged.
