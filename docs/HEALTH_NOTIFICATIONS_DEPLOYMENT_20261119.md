# Notification, readiness and operations release — 19 November 2026

## Changes

Application revision: `c1afde3c8a9f92753bf00bc0f4849d6e9e4217a2`.

Document-expiry email now uses the actual SMTP delivery capability in the notification settings display. No preferences, saved theme colors or account permissions were changed. Unsupported review email, WhatsApp and SMS remain visibly unavailable.

Readiness probes the real application database schema and private storage write/read/delete operations. Dependency failures return HTTP 503; independent liveness remains HTTP 200. Probes are bounded, coalesced, cached briefly, and do not create business records or disclose infrastructure details. Compose upload persistence and readiness dependency configuration were added.

Credential-independent operations now include a daily local database/uploads/recovery-environment backup and a minute-level readiness/backup-freshness monitor. Retention only removes marked, completed backups belonging to this tool, keeps at least two, and defaults to 14 days. The operations guide describes controls and commands in detail.

## Regression and staging evidence

- Backend: 119 Jest suites, **712 tests passed**; backend build passed.
- Frontend: **255 tests passed**; production build and size budget passed.
- Python operations: **9 tests passed**, including backup completeness, inherited/new missing-file handling, stale-backup monitoring and retention isolation.
- All **19** existing integration verification phases passed on isolated PostgreSQL copies. These cover onboarding, products, bookings, fulfilment, reports, finance, outlet authorization and concurrency.
- S3 emulator: four purpose round trips, four denied anonymous private reads, 20 concurrent uploads without collisions, health round trip passed with zero remaining probes. No cloud credentials used.
- Actual PostgreSQL 15/storage fault rehearsal: healthy HTTP 200; disconnected database, reachable database without the application schema, and unusable storage each HTTP 503. Liveness stayed HTTP 200. This was performed on disposable local copies, never by disabling live dependencies.
- A fresh live snapshot at `2026-11-19T13:52:00Z` was restored into isolated PostgreSQL 15.20: 98 applied migrations, zero pending, 42 database constraints/indexes present, zero missing default outlets, unattributed products/bookings, ledger/outlet mismatches or cross-tenant grants. Actual readiness fault scenarios passed again against that copy.
- Backend/frontend npm audits: zero reported vulnerabilities. Baseline guard tests passed. Compose configuration validated; a full Docker-stack deployment was not performed because live uses Apache/systemd.

Raw evidence is in `outputs/health-notifications-20261119/` locally. Protected database/configuration backups are excluded from Git.

## Deployment evidence

Deployed to `https://demo.dhisoft.in/voya/` at **13:56:22 UTC / 19:26:22 IST** on 19 November 2026. Active service: `voya-api-demo-c1afde3.service`, isolated release `/var/www/voya-vendor-platform-release-c1afde3`, private Node 22.23.5. The shared global Node runtime and dirty server checkout were preserved. Both builds, all 712 backend and 255 frontend tests, nine Python operations tests, build budget and dependency audits also passed in the server candidate before cutover.

Fresh quiesced recovery backup: `/root/voya-backups/health-notifications-c1afde3-20261119T135613Z`. It contains database, uploads, previous service/Apache configuration, environment files and before/after table fingerprints. Database: 2,651,714 bytes, SHA-256 `89856a50f93052fb9a9f9fdbcd8aeff2bba746c8053e2f09683b3a9832f4258a`. Uploads: 52,248,476 bytes, SHA-256 `d13ee1eee3be45fda5e56648d81af6230d65ff77fe9fd079b739a92dd8753aad`.

The exact cutover database archive was restored into disposable PostgreSQL 15.20 and all **17** critical table fingerprints matched. All 98 migration records and 42 database constraints/indexes were preserved; integrity checks remained zero. The archived uploads were extracted into a protected proof directory: **69 files / 54,849,904 uncompressed bytes**, all hashes matching the source. The same restore and hash checks passed for the first automated online backup, `/root/voya-backups/scheduled/voya-daily-20261119T135632Z-34f40887`.

Cutover took **8.71 seconds**. The configured theme and 17 critical tables, including FileAsset, were unchanged. The previous `voya-api-demo-1c64f8f.service` is retained for rollback and disabled; the new service is enabled. No Prisma schema or migration changes were needed. Live received no baseline, backfill or seed.

**169 live HTTP checks passed**, covering 13 existing active accounts, three Harbour Trails password logins, owner aggregate/four-outlet access, single/two-outlet employee grants, required outlet selection, denied cross-outlet products/resources/bookings/fulfilment/private vouchers, denied operations finance access, three historical report downloads, both current Harbour voucher PDFs, and blocked settlement statements. Twelve financial-table hashes plus the FileAsset hash stayed unchanged. No payment was released. Public health/readiness/liveness responses, no-store headers and the corrected SMTP notification capability passed. Browser verification confirmed the document-expiry email cell no longer says “Not connected”, while WhatsApp/SMS still do; saved theme and preferences remain intact. No browser warning/error was observed, and the live verification tab remains open. The first 507 API log lines since startup contained zero detected errors.

Both operational timers are enabled and active. First backup and subsequent monitor invocations succeeded under the systemd hardening rules. Backup runs daily at 01:30 UTC / 07:00 IST with up to five minutes jitter; readiness/freshness monitoring runs about every minute. The next daily trigger observed was `2026-11-20 01:30:15 UTC`. The monitor confirms database/storage up, fresh backup, zero newly missing files, and an explicit **warning for the ten inherited missing originals**. This warning is retained deliberately and is not a clean-document certification. Report scheduling remains disabled (the unset flag defaults false). External alerts and offsite storage have not been configured.

Review `prepared.json`, `deployed.json`, `final-backup-restore.json`, `scheduled-backup-restore.json`, `live-api-verification.json`, `operations-verification.json` and `notifications-live-fixed.jpg` under the local evidence directory. Recovery/configuration archives stay root-private on the server and are not committed.

## Remaining external work and limits

The inherited uploads audit found **79 FileAsset references and 69 originals**, with ten pre-existing missing assets: eight vendor documents, one product-media asset and one non-current voucher. Five have document-version references; no current voucher points to a missing asset. Seven historical uploads archives and two unique storage roots had no recoverable originals. Rows and review decisions are preserved; genuine originals must be recovered from their source. Monitoring and backup manifests keep this warning visible and fail on newly missing references.

OpenAI activation, SMS/DLT, actual provider credentials, approved report recipients/schedules, offsite backup/key custody, external alert destinations and genuine document/client acceptance require client input. Existing SMTP stays configured, but this deployment does not enable unsolicited report email or claim mailbox acceptance. No real payment is released. Client UAT, training and production sign-off remain necessary.
