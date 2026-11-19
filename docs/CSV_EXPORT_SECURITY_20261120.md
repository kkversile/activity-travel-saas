# Spreadsheet export security

The credential-independent review found that CSV downloads quoted fields but did not neutralize formula-like user text. A shared `csvCell` formatter now covers vendor reports (including scheduled attachments and legacy report downloads), paginated booking exports, fulfilment manifests and settlement statements. Permissions, tenant/outlet filters, financial calculations, stored rows and UI design/theme are unchanged. No schema migration or new provider credential is required.

Formula prefixes, full-width variants, leading whitespace/Unicode format controls and leading tab/newline controls are protected inside quoted CSV fields. Quotes and embedded separators/newlines remain in their original cell. Plain negative decimal/scientific numeric values remain unchanged, including Prisma Decimal amounts. Headers, identifiers, ordinary text and existing optional quoting conventions are retained. Native XLSX text cells stay unchanged and are verified not to become formula objects.

The mitigation follows [OWASP CSV Injection guidance](https://community.owasp.org/attacks/CSV_Injection). CSV downloads are intended for human spreadsheet viewing: dangerous text receives a literal leading tab inside the quoted field, which remains part of the exported value for programmatic consumers. Stored data is never rewritten. Use the native XLSX export when typed spreadsheet interchange is needed. There is no universal CSV sanitization guarantee across all spreadsheet applications and save/reopen/import workflows; actual Excel/LibreOffice UI execution is not claimed by these automated checks.

## Verification

- Backend: **124 suites / 778 tests pass**, including shared prefix/control/Unicode/quoting cases, all four export surfaces, negative financial amounts, unchanged stored rows and native XLSX text behavior.
- Frontend: **259 tests pass**, production build and JavaScript budget pass. Backend build passes.
- All **19 lifecycle/finance regression phases** pass on isolated synthetic PostgreSQL copies. Bootstrap guards **2/2** and operations tests **15/15** pass.
- The real PostgreSQL/NestJS reporting rehearsal passes **40 API checks**, including a persisted formula-text download with an unchanged negative amount and unchanged original rows. Existing role and outlet denials remain enforced; all 13 protected booking/finance/file hashes match.
- The loopback SMTP rehearsal captures **11 messages**, retaining scoped review delivery/retry behavior, owner-only legacy notices and one concurrent/same-day scheduled CSV delivery. No external messages are sent; all 13 protected hashes match.
- Restored-data portal compatibility passes 173 API checks, two catalogue searches and 200 concurrent reads. The live database was not modified by these staging rehearsals.

Evidence is under `outputs/export-security-20261120/`. Deployment and fresh backup/restore verification are recorded below after cutover. Client/provider dependencies remain: OpenAI, DLT/SMS, authentic originals, approved business finance policies and report recipients, actual inbox acceptance, offsite storage/external alert destinations, production capacity acceptance, UAT/training and sign-off.

## Deployment and operational completion

Application revision **`3ec3915caa1711c6c9e9b3d81e7af7205cf19cf2`** was deployed on **20 November 2026 at 00:10:20 IST / 19 November at 18:40:20 UTC**. Active release `/var/www/voya-vendor-platform-release-3ec3915`, service `voya-api-demo-3ec3915.service`, private Node v22.23.5. The server reran all **778 backend and 259 frontend tests**, builds, budget, bootstrap/operations guards and dependency audits; both audits reported zero vulnerabilities.

The existing SMTP connection/authentication passed without sending a message. All saved report schedules were confirmed absent both before and after quiescing the prior service. `VENDOR_REPORT_SCHEDULER_ENABLED=true` was then set in the candidate runtime configuration. This enables the already-tested owner-created scheduling feature without any new credentials, default recipients, saved schedules or outgoing messages. Only owners can choose a recipient and create/resume a schedule. Real recipient inbox acceptance remains unverified; it is separate from making the feature available. Existing notification preferences, provider secrets, mobile verification, AI provider and finance policy were preserved.

Fresh consistent pre-cutover backup: `/root/voya-backups/csv-security-3ec3915-20261119T184011Z`.

- Database: 2,679,842 bytes; SHA-256 `eb646c3ac0c36483d0ffcca4f5c1f3da927b6602b6a77a4c54ac5e2df598f6c9`.
- Uploads: 52,251,896 bytes; SHA-256 `fe4f6817793c2efd462d63b04ea558102b9e029895146cc83f05b1f52686e741`.
- Environment/runtime, prior service and Apache configuration, appearance snapshot, and protected/all-data fingerprints are retained privately with the backup. Secret bytes are excluded from Git.

The cutover took **8.50 seconds**. All **17 protected business/finance/access/asset table fingerprints** and appearance matched before/after. Copied archives passed independent checksum verification. The dump restored to isolated PostgreSQL 15 with **125 matching data-table counts/hashes**, **99 successful migrations**, zero unfinished migrations, all **42 database-only invariants**, zero cross-tenant grants and zero ledger/outlet mismatches. Prisma reported **no difference**. Independent extraction matched all **73 stored-file hashes**. No baseline, migration, seed, business backfill or live restore was run.

The live regression passed **191 checks**: existing portal, multi-outlet, voucher, finance and report/security checks plus booking/manifest CSV downloads and enabled owner delivery with an empty schedule list. All 13 protected finance/file hashes match. No booking, approval, payment, preference, report schedule or recipient was created or changed for these checks. The browser shows nine owner report types, the scheduling form without the disabled-delivery notice, the saved warm theme and no console warnings/errors. The final verification tab remains open.

Database/storage readiness and liveness pass, with no runtime error lines in the checked window. Backup/monitor timers now follow this release. A fresh post-deployment backup `/root/voya-backups/scheduled/voya-daily-20261119T184055Z-87b4a406` includes hashes for both recovery environment files and the enabled scheduler setting. Freshness/integrity checks pass with zero new missing references. The inherited warning for **10 unavailable originals** remains: 83 references and 73 stored files. Those absent originals were not fabricated or removed.

Harbour retains four LIVE products, 124 OPEN sessions from 20 November, four completed demonstration bookings, four PAYOUT_BLOCKED batches and zero payouts. Collection mode remains UNCONFIGURED and tax fields remain unset. AI remains mock; mobile verification remains disabled. Scheduled reporting is now available for owner configuration; authentic missing originals, business/finance decisions, provider acceptance, offsite/infrastructure destinations and formal client UAT/training/sign-off still need external input.

Prior `28b3100` code/service/configuration is retained for rollback, including its disabled scheduler setting. Ordinary rollback switches the service/frontend alias and verifies health/theme; it requires no database restore. A data restore over later client activity needs separate coordination. This deployment record is a documentation-only commit after application cutover.
