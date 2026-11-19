# Release operations — 19 November 2026

## Database paths

**Existing installations:** preserve `_prisma_migrations`. Use `prisma migrate deploy` with existing history, followed by an approved multi-outlet backfill. Never apply the fresh baseline to an existing database. This change introduces no incremental schema migration; the frozen baseline covers all 98 migrations through `20261117100000_multi_outlet_core`.

**New empty installations:** the inherited chain alters a demand enum before creating it. Editing historical migrations would break applied checksums. `scripts/bootstrap-fresh-database.cjs` creates the current schema atomically, retains 27 CHECK/exclusion constraints and 15 partial unique indexes, records the covered history using Prisma's supported `migrate resolve --applied`, applies subsequent migrations, and inserts minimal system defaults. Payment collection remains `UNCONFIGURED`; no users, balances or approvals are inserted.

SQL and the manifest under `prisma/baseline/20261119` are frozen release artifacts. Do not regenerate them for future schema changes; add forward migrations. `build-fresh-baseline.cjs` is the historical reconstruction utility, not an application startup command.

The bootstrap requires explicit `DATABASE_URL`, exact `--expect-database`, and `--apply`. Without `--apply`, preflight performs no writes. It rejects non-empty databases. After interruption, `--resume-baseline` works only with the exact provenance marker written by its atomic schema transaction. Investigate a marker mismatch; do not manufacture markers or overwrite checksums.

Default guards allow dedicated loopback role/port pairs `voya_local:55439` and `voya_staging:55445`, with `voya_readiness_` or `voya_outlet_` database names. A separately approved real empty installation additionally requires `--allow-remote-empty-database`. That flag is a safeguard, not deployment approval.

The retained snapshot has one inherited checksum difference (`20261031120000_partner_hub_gap_models`) and line-ending differences. Rehearsal reports these without rewriting history. Use reviewed forward deployments, not `migrate dev/reset` or live rebaselining.

## Reproduce isolated verification

Run PowerShell from `activity-saas-backend`. Dedicated Docker PostgreSQL 16 listens on **127.0.0.1:55439**, user `voya_local`; PostgreSQL 15 uses **127.0.0.1:55445**, user `voya_staging`. These are local containers, not live tunnels. PostgreSQL tools default to `C:/Program Files/PostgreSQL/16/bin`; override with `VOYA_PG_BIN` (snapshot rehearsal uses `PG_BIN`). Create the empty database below once with `createdb` against the dedicated cluster.

```powershell
$env:DATABASE_URL='postgresql://voya_local@127.0.0.1:55439/voya_readiness_clean_20261119?schema=public'
npm run db:bootstrap:fresh -- --expect-database=voya_readiness_clean_20261119 --apply
$env:NODE_ENV='test'
$env:DEMO_PASSWORD='ReadinessLocal@20261119'
$env:STORAGE_ROOT=Join-Path $env:TEMP 'voya-readiness-storage-20261119'
npm run prisma:seed
npm run build
node scripts/prepare-readiness-fixture.cjs
npm run verify:release:matrix
npm run verify:readiness:mail
npm run verify:readiness:backup
```

The matrix creates a separate PostgreSQL copy for each phase. Successful copies are dropped; failure copies are retained and named in evidence. Keep clients disconnected from the template during cloning. SMTP checks use an authenticated in-process loopback sink that cannot forward messages. Booking, cancellation, payout and scheduled CSV attachments are checked, with same-day duplicate suppression.

`rehearse-staging-snapshot.cjs --apply` restores `STAGING_SNAPSHOT_FILE`, deploys the outlet migration and runs backfill twice. It compares original records excluding only newly attributed fields. Existing targets require explicit `--reset-staging`; target pairs are hardcoded. `verify-staging-copy.cjs --allow-staging-writes` checks portal/API/report compatibility. The writer mode is needed because an inherited onboarding GET normalizes supplemental data. All financial tables are fingerprinted before/after; external workers and delivery are disabled.

Use `VOYA_REHEARSAL_EVIDENCE_DIR=../outputs/release-readiness-20261119` to retain new evidence without overwriting previous reports. Retained snapshots and reports containing real user data stay private; do not commit or share them with clients. The load verifier requires `npm run serve:readiness` and exercises the dedicated synthetic multi-outlet database. Browser review uses the built frontend via `npm exec vite preview -- --host 127.0.0.1 --port 3007`; `/voya/api` is proxied to the local API on 4007.

## Storage and recovery

Local storage remains the default. Point `STORAGE_ROOT` at a persistent absolute directory mounted across releases, outside the web document root. Back it up consistently with PostgreSQL. Existing relative file keys and authorized file endpoints are preserved.

For S3/Spaces, set `STORAGE_DRIVER=s3`, HTTPS service-origin `STORAGE_S3_ENDPOINT` (no path/query), `STORAGE_S3_BUCKET`, `STORAGE_S3_REGION`, `STORAGE_S3_ACCESS_KEY_ID` and `STORAGE_S3_SECRET_ACCESS_KEY`. Optional `STORAGE_S3_PREFIX` is a validated relative prefix. `STORAGE_S3_FORCE_PATH_STYLE=true` supports compatible services. Misconfiguration fails instead of falling back to local storage. Only loopback emulators may use HTTP; credentials remain server-side.

Use a private bucket with public access blocked and least-privilege GetObject/PutObject/DeleteObject within the prefix. Even product media stay private at bucket level; the existing public-media API controls publication. KYC, fulfilment and voucher files stay authorized. The actual provider's policy/delivery cannot be verified until credentials are available. The Moto rehearsal covers round-trip, concurrent keys and anonymous-read denial.

Changing drivers does not migrate existing files. Before an approved cutover, copy and checksum every referenced `FileAsset.storageKey` to the matching prefix, verify authorized downloads and retain the old storage snapshot. No external storage cutover occurred in this task.

Recovery rehearsal creates a custom-format PostgreSQL dump, restores a new guarded local database and compares all table hashes/counts, including migration/financial history. It also copies and hashes local fixture files. `backup-restore.json` records the private temporary directory and dump SHA. Restore database, storage, configuration and original encryption keys as one consistent recovery set. Preserve `SECRET_ENCRYPTION_KEY` and onboarding encryption configuration securely; the dump alone cannot recover encrypted secrets. Client infrastructure selection is still needed for offsite retention, access controls and scheduled backups.

## Deployment checklist — pending separate approval

1. Review the diff and current live history. Rehearsal used the retained **17 November** snapshot. After approval, take fresh database/storage backups and verify recovery before changes.
2. Install locked dependencies, generate Prisma and build both apps. Preserve configuration, encryption keys, theme and persistent storage. Keep local storage unless a separate cloud cutover is approved.
3. Existing live DB: apply only pending forward migrations, inspect backfill dry-run, apply the approved backfill and repeat for idempotence. Do not use the baseline or demo seed on live.
4. Deploy both applications; smoke auth, approval, existing bookings, outlet isolation, voucher/files, reports, maker/checker and reconciliation. Use labelled sample records, no real transfers.
5. Record release IDs and client acceptance. For app rollback, keep additive DB columns and attribution. Database restore is a separately coordinated recovery decision because it discards later writes; do not issue destructive down-migrations.

No live deployment or database changes were performed in this task.
