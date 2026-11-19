# Product-review email live deployment

Deployed **19 November 2026, 17:35:24 UTC / 23:05:24 IST**, under the user's instruction to fix delivery, run regressions and deploy with a fresh backup.

## Release and result

Application revision: **`1f3e1913e5348014bc99a214a7efc2c3a65b0db7`**. Release: `/var/www/voya-vendor-platform-release-1f3e191`; service: `voya-api-demo-1f3e191.service`. The process working directory was checked against the active release. Runtime remains private Node **v22.23.5**; global Node and other applications were not changed.

The API is healthy at [the live demo](https://demo.dhisoft.in/voya/). `/api/health`, `/api/health/ready` and `/api/health/live` pass. No runtime error lines were found during the deployment verification window. The vendor notification table now treats product-review email as connected when SMTP is configured, while retaining the correct disconnected status for unconfigured SMS/WhatsApp. Existing preferences and theme were preserved. The live Codex verification tab was left open.

Approval, rejection and authorized direct publication now transactionally queue a dedicated review-delivery event. Delivery respects the saved preference, the reviewed revision, tenant/outlet grants and product-edit permissions. Durable recipient receipts avoid repeating recorded successful deliveries after partial failures. Bounded retries and review-only processing leases recover interrupted deliveries. Historical product-domain events are excluded from the new delivery path. No historical decisions were queued or replayed during rollout; new review-delivery event count remained zero in the read-only live verification.

Implementation details, reproduction and the at-least-once SMTP limitation are in [PRODUCT_REVIEW_EMAIL_DELIVERY_20261119.md](PRODUCT_REVIEW_EMAIL_DELIVERY_20261119.md). Admin submission/edit notices retain their existing separate implementation.

## Tests and staging

Both the local workspace and isolated server release passed:

- Backend: **120 suites / 723 tests** and NestJS build.
- Frontend: **256 tests**, TypeScript check, production build and JavaScript budget.
- Database-bootstrap safety guards: **2/2**. Operations tests: **15/15**.
- Server dependency audits: **zero reported vulnerabilities** in backend and frontend at verification time.

A disposable copy of the restored PostgreSQL 15 database passed the real outbox/SMTP integration. All eight messages were captured by an authenticated loopback sink that cannot forward mail. Cases covered approval/rejection content, tenant/outlet and role isolation, revoked grants, preferences, forged revision/tenant payloads, concurrent claims, partial retries, lease recovery, retry exhaustion and untouched historical events. All 13 protected booking, finance and asset fingerprints matched.

The candidate application's restored-data API rehearsal passed **173 checks**, two future-date catalogue searches with four Harbour offers each, and **200 concurrent reads** with zero failures. These are engineering regression checks, not a production capacity guarantee.

Live SMTP connection and authentication passed `verify()` without sending a message. No real recipient inbox was tested; external acceptance/inbox placement is not claimed. No synthetic product approvals or sample customer emails were created on live during verification.

## Backup and recovery proof

Consistent pre-cutover backup: `/root/voya-backups/product-review-email-1f3e191-20261119T173514Z`.

- Database: **2,679,842 bytes**, SHA-256 `53d9dee547c7069db5ac9a557e38c0c38782d55b9425d8c628c95404c2297901`.
- Uploads: **52,251,900 bytes**, SHA-256 `4b151b37d97359c4131ec3e8d7f877d086672a8204be8c09f1bdcc5d25afec84`.
- Includes private environment/configuration copies, the former service unit, Apache configuration, theme snapshot and before/after protected-table fingerprints. Secrets and backup bytes are excluded from Git.

The cutover took **8.62 seconds**. All **17 protected business/finance/outlet/asset table fingerprints** matched before and after cutover. The dump and uploads were independently checksum-verified after copying to private local recovery storage. The dump restored to a dedicated loopback PostgreSQL staging database; **all 125 data-table row counts/hashes matched**, **99 migrations** remained successfully applied, no unfinished migration existed, all **42 database-only invariants** remained present, cross-tenant grants and ledger/outlet mismatches were zero, and Prisma reported **no difference**. The uploads archive was independently extracted to a separate directory and all **73 file hashes** matched the source.

No migration, baseline, seed, business backfill or production database repair was required or run. Existing Harbour demonstration records, vouchers, financial collection policy, beneficiary approvals, ledger and blocked settlements remain unchanged.

The backup/monitor configuration now follows the new release, and both timers remain active. A fresh post-deployment scheduled backup was also taken at `/root/voya-backups/scheduled/voya-daily-20261119T173544Z-d751db83`, including hashes for both environment files. Backup integrity/freshness checks pass with zero new missing references. Monitoring retains the pre-existing warning for **10 unavailable original assets**; those originals remain a separate outstanding recovery/client-input issue.

## Live regression checks and rollback

The live API verification passed **173 authenticated/public checks** for original active accounts and Harbour Trails, including owner aggregate views/four outlet switches, single- and multi-outlet permissions, foreign booking/fulfilment/product/resource/private-voucher denial, finance restrictions, historical report downloads, all four current Harbour voucher PDFs, approved onboarding/readiness, existing settlements and blocked payouts. All 13 protected finance/file fingerprints matched throughout these read checks. No booking, fulfilment, payment, preference or approval records were changed by the live test. The notification display was also inspected in the existing browser session with the saved warm theme and no browser console warnings/errors.

The old `c1afde3` release, service definition and backup are retained. Code rollback consists of switching the service and Apache frontend alias back to that release using the preserved configuration, checking Apache configuration, reloading it and verifying readiness/theme. This code-only fix needs no database restore for ordinary rollback. Do not restore a database over subsequent client activity without a separate approved recovery plan.

Evidence is in `outputs/product-review-email-20261119/`: backend/frontend tests/builds, server preparation, SMTP capture, staging API/search/load results, live API results, deployment/backup manifest, fresh restore and schema comparison, uploads restore, live SMTP verification, final health and before/after browser screenshots. Private backup/secret material remains outside Git. This report is a documentation-only commit after the application release.
