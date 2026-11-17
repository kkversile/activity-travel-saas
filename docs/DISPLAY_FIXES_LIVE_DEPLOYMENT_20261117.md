# Display fixes deployed to the live demo

Application commit `1caf83e` was pushed to origin/main and deployed to https://demo.dhisoft.in/voya/ on 17 November 2026 at 11:22 IST. Release: `/var/www/voya-vendor-platform-release-1caf83e`. Service: `voya-api-demo-1caf83e.service`.

## Changes

1. Agent vouchers have explicit loading, request-error, generation and supplier-evidence states. A current voucher displays its code and download controls. A ready voucher still being generated refreshes every five seconds; polling stops on success, failure, cancellation or unmount. Manual refresh supports retry. Cancellation hides previously available entry/download controls. The existing sharing and viewer permissions are retained. Booking details load independently of voucher requests.
2. Admin onboarding detail no longer computes or renders approval-action blockers for an already approved application. Both normal and read-only approval actions remain disabled after approval. Submitted applications retain their document blockers. The backend approval authorization helper was not relaxed; new regression tests explicitly confirm it still rejects inappropriate approval attempts.
3. Dashboard profile readiness derives 100% from the canonical APPROVED onboarding application instead of a stale stored score. Incomplete and legacy profiles retain their existing score. No stored scores, onboarding statuses or verification decisions were rewritten.

Existing theme colors and styles remain in use. No dependency, Prisma schema or migration changed. No migration or backfill was needed or run.

## Verification

| Check | Result |
| --- | --- |
| Complete backend Jest suite | 116 suites, 681 tests passed |
| Complete frontend Vitest suite | 47 files, 253 tests passed |
| Backend Nest build | Passed locally and on server |
| Frontend TypeScript/Vite production build | Passed locally and on server |
| Existing staging-copy HTTP checks | 150 checks across 13 existing active accounts, including 3 historical report downloads; financial fingerprints unchanged |
| Live HTTP checks | 147 checks across existing accounts and Harbour scenarios; 3 historical report downloads; no failures |
| Live browser | Readiness 100%; current voucher visible, refresh works and PDF download succeeds; approved admin panel has no obsolete blocker and approval actions stay disabled |
| Financial preservation | All 12 checked table fingerprints unchanged across deployment and live HTTP verification |
| Theme preservation | Public appearance configuration unchanged; same CSS asset hash |
| Service | Active, zero automatic restarts; previous service inactive |
| Git diff whitespace check | Passed |

The new tests cover delayed voucher responses, failed requests and retry, asynchronous generation refresh, unmount cleanup, cancellation, viewer restrictions, approved vs submitted admin display, strict backend approval gates, and approved/draft/legacy readiness with unchanged earnings/payout assertions. The existing cancellation test now targets its financial status message specifically, since the voucher panel has its own accessible status region.

Live verification included owner consolidation, employee outlet selection, denied cross-outlet booking/fulfilment/private-file reads, both current Agent vouchers and their PDF content, and existing settlement statements. The two Harbour batches remain PAYOUT_BLOCKED and the global collection mode remains UNCONFIGURED. No payment, release or reconciliation was performed. These checks define the tested regression coverage; they are not an exhaustive guarantee for every workflow.

## Backup and cutover

Fresh backup used for the successful cutover:

`/root/voya-backups/display-fixes-1caf83e-20261117T055222Z`

- Custom-format PostgreSQL backup: 2,650,318 bytes; archive contents validated.
- SHA-256: `3b2a3ab734d1a5548ea87fcc9bfd9fc53f6ae992aa3c60808d513d16367c31df`.
- Uploads backup: 52,248,476 bytes; archive validated.
- Protected environment, previous service and Apache configuration retained privately.
- Successful API/static cutover took 3.37 seconds. Prior hashed assets remain available for already-open pages. Upload storage and existing JWT/encryption settings were preserved.

Earlier candidate attempts automatically rolled back on verification failures: public asset permissions were too restrictive, followed by a raw HTML comparison that treated CRLF and LF line endings as different content. Corrected public-directory permissions, normalized generated HTML and fixed the comparison before the successful cutover. No database restore or migration was performed during those attempts. The server's unrelated dirty checkout was preserved; the release came from the pushed source archive.

Rollback for these display-only changes can use the preserved `be71cc3` multi-outlet release and its backed-up Apache/service configuration. No schema down migration or financial data restoration is required.

## Evidence and retest

Local evidence: `outputs/display-fixes-20261117/` contains unit test JSON/logs, build logs, staging smoke results, deployment manifest, live API verification and screenshots. The full-screen MP4 from the previous walkthrough was not changed by this task.

1. Owner → Home → Account health: approved Harbour Trails shows Profile readiness 100%.
2. Harbour demonstration agency → My bookings → AG-26110013 → Details: current voucher VOY-P8DW-LFGR is visible, Refresh voucher retains it, and Download voucher returns a PDF.
3. Admin → Vendors → Harbour Trails → Review full onboarding: APPROVED is shown, the obsolete resubmission warning is absent, and review decision buttons remain disabled.

The final Codex browser tab is left open on the Harbour owner dashboard. No browser windows or user tabs were closed. The existing Vite large-bundle warning remains; no new failing check remains in the tested scope.
