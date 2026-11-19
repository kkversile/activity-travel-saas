# Release readiness deployed to the live demo

Deployed to https://demo.dhisoft.in/voya/ on **19 November 2026 at 17:59:59 IST** (12:29:59 UTC).

Application revision: **`1c64f8fae19cf231a546202ac34993be6b89fcf3`**. The readiness implementation is commit `8c85e2f`; the subsequent commit isolates Vitest login fixtures from deployment credentials. Both are pushed to `origin/main`. Release: `/var/www/voya-vendor-platform-release-1c64f8f`. Service: `voya-api-demo-1c64f8f.service`.

## Release preparation

The server's unrelated dirty checkout was preserved. Its remote reference was fetched, and the candidate was prepared from the pushed source archive. Every candidate source file was compared with the final pushed archive. The final commit changes only Vitest configuration, so the already tested identical backend build was retained and the frontend suite/build rerun.

Voya uses a private **Node 22.23.5** runtime under `/opt/voya-runtime/node-v22.23.5-linux-x64`. The archive checksum was verified against the [official Node release checksums](https://nodejs.org/download/release/v22.23.5/SHASUMS256.txt). The shared system Node remains **20.20.2**, preserving other applications. Existing JWT/encryption configuration and shared uploads are retained; storage remains local. No S3/Spaces, OpenAI or SMS/DLT provider was enabled.

The initial server frontend run exposed three tests that depended on private local demo credentials. Vitest now supplies explicit synthetic email/password fixtures. Production Vite configuration and live login shortcuts were not enabled by this test-only change. The final server suite passes in the deployment environment.

## Fresh backups and restoration proof

Final consistent backup, taken while the old Voya API was stopped:

`/root/voya-backups/release-readiness-1c64f8f-20261119T122950Z`

| Artifact | Size / verification |
| --- | --- |
| PostgreSQL custom-format dump | 2,651,709 bytes; SHA256 `49b8e8742533e0d822c15ec6af698ee3bb1e39a0d8642a4f79fb485f9e387422` |
| Uploads archive | 52,248,476 bytes; SHA256 `d13ee1eee3be45fda5e56648d81af6230d65ff77fe9fd079b739a92dd8753aad` |
| Environment, runtime, prior service and Apache alias | Retained privately in the protected backup directory |
| Database restore | Restored into isolated PostgreSQL 15.20; all 16 critical table fingerprints matched the cutover snapshot |
| Uploads restore | 69 files, 54,849,904 uncompressed bytes; all restored SHA256 hashes matched the source |

An additional fresh preflight dump was restored and checked before deployment. Both dumps remain private, outside the repository. The final backup restore used `voya_readiness_final_20261119_122950` on the dedicated local PostgreSQL 15 cluster; no live restore or reset was performed.

## Database and cutover

The fresh snapshot contained **98 applied migrations, zero unfinished/pending migrations and all 42 database-only integrity constraints/indexes**. All 12 vendors had default outlets. There were zero unassigned products/bookings, ledger/outlet mismatches or cross-tenant grants. No new schema migration or backfill was required. The empty-database baseline was not applied to live, and no demo seed ran against live.

The database, uploads and configuration were backed up before starting the candidate service. Apache's Voya alias then switched to the new frontend. Previously published hashed assets remain available for already-open browser tabs. The API/static cutover, including the quiesced backup, took **8.02 seconds**. The prior Voya service is stopped/disabled; the new service is enabled, active and has zero automatic restarts. No service errors appeared in the checked journal. Other hosted applications and proxy routes were unchanged.

The configured appearance response was identical before/after. All **16 critical business/finance/access table fingerprints** were unchanged through cutover. Live API regression checks separately confirmed all **12 financial table fingerprints** unchanged. Counts remain 19 bookings, 7 payouts and 6 settlement batches. No real payments, releases, reconciliation decisions, bank approvals or customer-password resets were performed during deployment verification.

## Verification results

| Check | Result |
| --- | --- |
| Backend on deployment server | 117 Jest suites, **699 cases passed** |
| Frontend on deployment server | **254 cases passed** |
| Backend/frontend production builds | Passed on the server; frontend also passed locally after fixture correction |
| Dependency audits | Backend 0, frontend 0 reported vulnerabilities |
| Backend migration guard/manifest tests | 2 passed |
| Earlier isolated end-to-end/security rehearsal | 19 phases and 21 multi-outlet checks passed; includes actual booking, fulfilment, cancellation/refund races and maker/checker settlement mutation paths |
| Live authenticated API regression | **165 checks passed**, covering 13 original active accounts and Harbour demonstration scenarios |
| Actual password login | Owner, Kochi employee and two-outlet operations employee passed with existing credentials |
| Historical reports and vouchers | 3 stored reports downloaded; both Harbour agent vouchers ready and valid PDFs; cross-outlet private-file request denied |
| Owner outlet scope | Aggregate bookings plus individual dashboard/product scopes for all four outlets passed |
| Employee isolation | One/two-outlet grants enforced; missing selection rejected; foreign booking/fulfilment/product/resource/file requests denied; operations finance denied |
| Existing display fixes | Approved Harbour readiness remains 100%; approved onboarding has no obsolete approval blockers; current vouchers remain available |
| Settlement history | Both existing Harbour batches remain PAYOUT_BLOCKED; payment collection remains UNCONFIGURED; no Harbour payout was created |
| Live Codex browser | Owner switching, scoped bookings, one-outlet employee and two-outlet employee navigation verified in the configured warm theme |

The live verification reads existing business records and checks actual login/access/download behavior. Destructive lifecycle and finance mutation scenarios remain isolated staging checks; no fresh booking or payout was created merely to smoke-test deployment. This is the observed regression coverage, not formal client UAT acceptance or an exhaustive guarantee for every production condition.

## Evidence and rollback

Local verification evidence is under `outputs/live-release-readiness-20261119/`: deployment/preparation manifests, server test/audit JSON, 165-check API report, fresh staging and final-backup restoration checks, upload restoration proof and browser screenshots. Private dumps, encryption keys and real user data must not be committed or shared as client-facing evidence.

The preceding compatible multi-outlet release `/var/www/voya-vendor-platform-release-1caf83e` and its service/configuration remain available. If an application rollback is required, restore the backed-up Voya Apache alias, stop the new service, start/enable the prior `voya-api-demo-1caf83e.service`, validate Apache configuration and reload it. No schema down migration is needed. Coordinate any database restore separately because it discards subsequent writes.

The inherited migration checksum difference documented in the readiness operations guide remains unchanged. Real provider acceptance, OpenAI/SMS-DLT and client UAT sign-off remain external prerequisites. No browser window or user-owned tab was closed; the final live verification tab remains open.
