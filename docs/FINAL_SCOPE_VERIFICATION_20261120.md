# Credential independent scope verification

Verified **20 November 2026 IST**. The live application's implemented credential-independent scope is already deployed as **`3ec3915`**. No additional application implementation gap was found in this review. The remaining delivery-plan items need provider activation, genuine source documents, approved business policies/infrastructure destinations, recipient inbox acceptance or formal client participation. These were not fabricated or replaced with inferred decisions.

## Regression results

The current source was rebuilt and rechecked:

- Backend: **124 suites / 778 tests pass**.
- Frontend: **259 tests**, production build and JavaScript budget pass.
- All **19 lifecycle/finance phases** pass on isolated PostgreSQL copies.
- Bootstrap guards: **2/2**. Operations tests: **15/15**.
- Freshly restored-data reporting/security rehearsal: **40 API checks pass**; stored rows, signed amounts and all 13 protected booking/finance/file hashes remain unchanged.
- SMTP rehearsal: **11 locally captured messages**, with both one-slot and six-slot pools; review decisions/retries, owner-only legacy notices and concurrent/same-day scheduled CSV delivery pass. No external test email is sent.
- Live regression: **191 checks pass**, retaining original accounts, owner/employee outlet isolation, report permissions, historical downloads, vouchers and protected finance hashes. Rejected report/schedule POSTs create no records or messages. Actual SMTP connection/authentication passes without sending a message; inbox placement remains unverified.

The additional SMTP rehearsal exposed a timing-sensitive verification assumption: a newly inserted database event could still be slightly ahead of the host clock when immediately dispatched. It remained PENDING with zero attempts, rather than failing delivery. Only the guarded disposable fixture enqueue helper now explicitly makes its own event due. Production enqueue/dispatch/retry behavior is unchanged. Both pool rehearsals passed after this correction.

## Published verification fix and existing live release

Verification revision **`b74261266f9f20e3d1563022622d55f8ea1da66b`** is pushed. Its guarded staging verifier is archived on the live server at `/root/voya-verification/b74261266f9f20e3d1563022622d55f8ea1da66b/verify-product-review-mail.cjs`, SHA-256 `1f3884c4b153fa72735bf7c18c737be6d1394115bd4db88d9e5f39b997607234`. This archive is for use in a proper isolated backend checkout; it is not run against the live database.

Application source, Prisma artifacts, dependency/build manifests and frontend Git objects match the existing `3ec3915` release. All **611 deployed tracked source files** in those paths were independently checked against Git blob hashes. The only code change is the staging-verifier fixture; it does not require a runtime release or restart. The healthy `voya-api-demo-3ec3915.service` and its immutable application release are retained. No new application version, migration, baseline, seed, business backfill or production database repair is claimed or performed.

The live browser confirms the owner's report cards, existing report history and enabled scheduling controls. Its verification tab is marked to remain open. No schedule, recipient, booking, approval, payment, preference or finance policy was created or changed. Scheduled reporting remains enabled for owners; AI remains mock, mobile verification disabled and collection/tax policies unconfigured. Harbour retains four LIVE products, 124 OPEN sessions from 20 November, four completed demonstration bookings, four PAYOUT_BLOCKED batches and zero payouts.

## Fresh online backup and recovery proof

Fresh backup: `/root/voya-backups/scheduled/voya-daily-20261119T192801Z-070bd801`, created **20 November at 00:58:01 IST / 19 November at 19:28:01 UTC**. The API was not stopped.

- Database SHA-256: `d05967d679f22630e641cf6df2c061b112d46c70f78415c44c3662054f912722`.
- Uploads SHA-256: `3dd4c59eeb91d82d093b6b93eb63fe9612f0034b98a60cde154da14a58c2e46a`.
- Expected source-data fingerprint SHA-256: `21c136b64a765be2174de2b50910a8b0ba539d7bb58b7d17e367a59732c6ad28`.

All **125 live data-table fingerprints** matched immediately before/after the backup window. Private recovery environment files are included and hashed. Database/uploads/expected-fingerprint hashes were rechecked after copying to private recovery storage. The dump restored to a dedicated loopback PostgreSQL 15 database with all **125 counts/hashes matching**, **99 successful migrations**, zero unfinished migrations, all **42 database-only invariants**, zero cross-tenant grants and zero ledger/outlet mismatches. Prisma reports **no difference**. Independent uploads extraction matches all **73 file hashes**.

Readiness/liveness, backup freshness and archive/configuration integrity pass. The existing warning for **10 unavailable originals** remains explicit, with zero new missing references. Original bytes, approved finance values, external destinations and client acceptance cannot be manufactured by another code deployment.

Evidence is under `outputs/final-readiness-20261120/`, including the original timing-sensitive failure, corrected SMTP runs, new backup manifest/source fingerprints, restore/schema verification, source/tooling deployment proof and live checks. Private backup/configuration bytes are excluded from Git. This report is a documentation-only commit; it does not change the live application's code or data.
