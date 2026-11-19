# Harbour Trails recovery and schema alignment verification

The subsequently approved live migration is complete. See [the live deployment record](SCHEMA_ALIGNMENT_LIVE_DEPLOYMENT_20261119.md). The staging-only boundary below records the earlier work before production approval.

Verified on 19 November 2026. The live application remains revision `c1afde3`; operations integrity improvements are installed from `dfa17d1`. No business records, collection policy, payment approvals or live database schema were changed during this task. A newly discovered forward schema repair is implemented and verified on staging; applying it to live is a separate approval step under the user's production-database instruction.

## Completed live operations

The backup monitor now verifies the actual database/uploads SHA-256 values, requires both recovery environment files, and verifies their hashes in newly created backups. A missing, empty, corrupt or symlinked artifact fails monitoring; a broken latest backup cannot silently fall back to an older one. Future-dated backups fail freshness. Hashing uses bounded memory. Fifteen operations tests pass on Windows and the server's Linux/Python runtime. The application was not restarted.

Fresh recovery point: `/root/voya-backups/scheduled/voya-daily-20261119T152938Z-2b5d2638`, created **19 November at 15:29:38 UTC / 20:59:38 IST**. Database, uploads and both protected environment files were downloaded privately, their four checksums verified, and uploads extracted into an isolated staging directory. All **73 files** match the manifest. The dump contains **83 FileAsset references**, including the restored Harbour demonstration documents and new vouchers. The same **ten inherited missing originals** remain a visible warning; no newly missing file was found. Those originals still need recovery from an authentic source.

The installed daily-backup and minute-level monitor timers remain enabled. Monitoring reports readiness up, fresh backup, backup integrity true and zero newly missing files. No new provider account, cloud storage credential, external message delivery or real transfer was used.

## Database and application restoration

The exact fresh archive was independently restored into PostgreSQL **15.20** and **16.15** on dedicated loopback-only Docker clusters. All **126 table counts/hashes matched** before staging changes. The copies contain 21 bookings, 15 outlets, 83 file references and eight settlement batches.

On the restored copy, **173 HTTP checks pass** across original accounts and Harbour Trails owner/employees/agent/admin: existing reports, all four private voucher PDFs, outlet authorization, original completed bookings, the new completed pair and protected settlement statements. External jobs, SMTP delivery, AI and report scheduling were disabled; HTTP calls were restricted to the isolated loopback server. Two encrypted bank records decrypted with the keys recovered from the protected backup; no plaintext was logged.

Searches return all four normal Harbour offers for 20 November and 20 December without an eligibility override. A bounded staging read test completed **200 requests at concurrency eight**, with zero failures: p50 30.10 ms, p95 65.82 ms, maximum 108.40 ms. Financial and FileAsset hashes stayed unchanged. These local Windows/Docker results are not a production capacity or SLA claim.

Database/schema-outage and unwritable-storage rehearsals return bounded HTTP 503, with liveness still HTTP 200. Faults were simulated only on disposable local copies.

## Additional schema issue found and repaired on staging

The historical live database and the frozen baseline did not both match the Prisma model. Differences included PostgreSQL-truncated index names, historical read indexes omitted from the model, insert defaults, review timestamp precision, a missing quality-policy unique index, and a historical cascading payout/tenant reference where the model specifies RESTRICT.

`20261119160000_reconcile_legacy_schema_metadata` is a forward-only, transactional migration. It leaves the original 98 migration files and frozen baseline unchanged. Prisma explicitly maps and preserves historical indexes and existing review timezone/precision. The new SQL adds missing indexes and insert defaults, enforces quality-policy version uniqueness without deduplicating existing rows, and validates a restrictive payout foreign key before replacing the cascading reference. It does not change amounts, records, financial collection settings, beneficiary approvals or original encryption keys. Lock and statement timeouts bound deployment; errors roll back the migration. Fresh-baseline timestamp columns are interpreted as UTC; live review columns already have the target timestamptz type and are not rewritten.

The forward migration passes on restored PG15/PG16 and on a new empty PG16 installation through the frozen baseline. All targets have **99 applied migrations, zero pending and zero Prisma drift**, with all 42 existing database-only invariants retained. Original table data remains unchanged apart from the expected migration-history record. Replaying the multi-outlet backfill twice on staging changes no records. The baseline verifier now discovers forward migrations instead of assuming the original frozen count of 98, and accepts only explicitly guarded local rehearsal targets.

`npm run verify:schema:alignment` has strict dedicated loopback database guards. On both restored engines and the fresh installation it proves payout-bearing tenant deletion is rejected, duplicate quality-policy versions are rejected, timestamp precision/indexes are preserved and every fixture transaction rolls back, leaving all table fingerprints unchanged.

Backend: **119 suites / 712 tests pass**, build/generation/validation pass. Frontend: **255 tests pass**, production build passes. Baseline unit guards pass. The operations tests pass **15/15**. No UI code or theme colors changed.

## Production boundary and next step

The live database still has its existing 98-migration history; the schema repair has not been applied to live. All new staging work is reviewable before that change. Applying the forward migration and promoting matching source requires explicit production approval. The already-completed backup/restore and installed backup-monitor improvement do not depend on that approval.

After approval: use a fresh backup, confirm no duplicate supplier-quality versions, deploy only the new forward migration, inspect the 99-migration history and zero schema drift, compare all original business/finance table fingerprints, recheck the original and Harbour portal flows, refresh the operations release path if the application is promoted, and take/verify a final backup. Never baseline, reset or seed the existing live database.

OpenAI, SMS/DLT and provider activation, approved finance policies/report recipients, authentic verification originals, offsite storage/key custody and external alert destinations still require client input. Formal UAT, training and client sign-off cannot be substituted with engineering tests. Harbour's documents/approvals remain explicitly demonstration-only and payouts remain blocked under the unconfigured collection policy.

## Evidence and reproducibility

Local evidence is under `outputs/final-recovery-20261119/`: `backup-manifest.json`, `operations-installed.json`, `restored-files.json`, `restored-table-fingerprints.json`, `staging-databases.json`, `schema-alignment-55445.json`, `schema-alignment-55439.json`, `fresh/`, `staging-http-smoke.json`, `recovery-key-verification.json`, `staging-search-load.json`, `readiness-failure-rehearsal.json`, backend/frontend test/build logs and `live-api-verification.json`. Backup/configuration bytes are private and excluded from Git.

The application verification uses isolated `voya_readiness_recovery_*` and `voya_readiness_alignment_*` copies on ports 55445/55439. No production DSN is accepted by the schema verifier. Use `VOYA_REHEARSAL_EVIDENCE_DIR` for a new evidence destination. Preserve current encryption keys, authorized file access, theme, multi-outlet grants, ledger and maker/checker controls in future deployments.
