# Credential independent reporting and notification completion

The remaining implementation review found report authorization and reliability gaps that did not require a new provider, account or credential. These are fixed while preserving the configured theme, existing role definitions, tenant/outlet grants, financial ledger and payment controls. No schema migration is required.

## Report authorization

Report generation, queued exports, history and downloads now enforce report-type permissions in the service. Payout statements, commission invoices and tax certificates require the existing `payout.view` permission. Owners and finance employees retain access; catalogue, operations and viewer accounts cannot generate, enumerate or download those financial reports. Guest manifests require `manifest.view`; product performance requires `product.edit`; other catalogue/booking reports use their existing view permissions. Unknown types fail closed. Tenant and selected-outlet filters remain enforced, including guessed download IDs and legacy exports.

`GET /vendor/report-capabilities` supplies permitted types and owner/reply capabilities to the frontend. The reports page shows only allowed cards/history and skips catalogue-review requests for finance accounts. Read-only support sessions retain their restrictions. Only workspace owners can manage report email recipients and schedules; employees cannot bypass this by POST/PATCH requests or read saved recipient lists. Existing report endpoints now admit finance users through the common vendor outlet permission and enforce the actual type in the service, rather than excluding legitimate finance accounts with an unrelated product-view requirement.

## Recovery and delivery

Exports interrupted for more than 15 minutes, or missing their processing timestamp, become failed with an instruction to regenerate. Recent processing and pending jobs are preserved. Terminal updates compare the processing timestamp/status so a late worker cannot overwrite an interrupted job's state.

Scheduled reports catch up later on their scheduled local day. A per-schedule PostgreSQL transaction advisory lock serializes concurrent delivery, with a current state/last-run check after acquiring the lock. Generation, CSV persistence and download use the same transaction connection, including one-slot application pools. SMTP requests have bounded connection/greeting/socket timeouts. A committed successful daily send is skipped on subsequent checks. SMTP remains at least once: acceptance before a transaction commit failure can still produce a duplicate after retry. This does not guarantee inbox placement.

Scheduling remains gated by its existing deployment flag and SMTP settings. Deployment does not enable scheduling, create schedules or choose recipients. Client-approved recipients and delivery acceptance are still needed.

Legacy onboarding-decision and administrator product-edit emails now select an active workspace owner instead of the oldest arbitrary employee. Administrative submission notices use configured/active administrator recipients; hardcoded outside fallback mailboxes are removed. Explicit onboarding recipient configuration takes precedence. SMTP timeouts are bounded and product email success logs omit recipient addresses. The separately queued product-review decision sender retains its existing scoped editor delivery and durable retry behavior.

## Verification and rehearsal

Backend: **122 suites / 743 tests**. Frontend: **259 tests**. Both builds and the frontend budget pass. Database bootstrap guards pass **2/2** and operations checks pass **15/15**.

The isolated real PostgreSQL/NestJS security rehearsal passes **39 API checks** across owner, catalogue, operations, finance and viewer roles. It covers financial denial, legitimate finance access, tenant/outlet download isolation, owner-only scheduling, disabled delivery activation and interrupted export recovery. All 13 protected booking/finance/file table fingerprints match.

The authenticated loopback SMTP rehearsal captures **11 messages**, covering queued review decisions/retries, legacy owner-only notifications and one scheduled CSV attachment. Concurrent sends and same-day catch-up pass with both one-slot and six-slot pools. No external messages are sent. All 13 protected table fingerprints match.

All **19 historical lifecycle/finance phases** pass on independent synthetic database copies, including booking/cancellation/refund races, fulfilment/vouchers, maker/checker settlements/reconciliation, quality, demand and distribution. The harness now accepts a strictly named loopback matrix template copied from the synthetic fixture, avoiding disruption of an already-open local review server. It never accepts live database targets. The restored-data portal rehearsal passes 173 checks, two future-date searches and 200 concurrent reads with no finance/file changes.

Evidence is under `outputs/credential-independent-completion-20261119/`. Deployment and backup/restore results are appended after live verification. Tests establish the covered engineering behavior; final client UAT, training and sign-off remain open. OpenAI, DLT/SMS, genuine verification originals, real finance policies, approved mailbox/report recipients, offsite backup destinations, external alerts and production infrastructure acceptance still need client/provider decisions or input.

## Live deployment and recovery verification

The implementation release `f9504f2` passed the full backend/frontend suites, builds, bootstrap/operations guards and zero-vulnerability dependency audits on the deployment server and was deployed with a fresh backup. Browser verification then identified a misleading existing notice about SMTP configuration. The frontend-only correction is in final application revision **`28b3100d6655d20a06923703db5958540f3d81ee`**, deployed **19 November 2026 at 18:22:24 UTC / 23:52:24 IST**. It accurately says scheduled report delivery is disabled. The final release reran all 259 frontend tests, production build and budget. Its backend Git tree and every archived backend source byte match `f9504f2`; its verified 743-test backend build/dependencies were copied into the new isolated release. Dependency audits remain zero. No global runtime change was made.

Active release: `/var/www/voya-vendor-platform-release-28b3100`. Active/enabled service: `voya-api-demo-28b3100.service`, using private Node v22.23.5. The process working directory was checked against this release. Prior releases/services remain available for code rollback. Shared uploads and original environment/encryption keys are preserved. There was no schema migration, baseline, seed, business backfill or finance-policy change.

Final consistent pre-cutover backup: `/root/voya-backups/credential-completion-28b3100-20261119T182216Z`.

- Database: 2,679,842 bytes; SHA-256 `a178402d9959d62977029b447db17dd9a2f1973a8765bde5a1794ac8e8321601`.
- Uploads: 52,251,901 bytes; SHA-256 `057cc1f8e6460d0560364895cfda794d2366c1805b1309f3cebe123cc7517103`.
- Private copies of the environment/runtime, previous service and Apache configuration, theme snapshot and original-data/protected-table fingerprints are retained with the backup. Secrets and backup bytes are excluded from Git.

The final cutover took **7.19 seconds**. All **17 protected business/finance/access/asset table fingerprints** and the configured appearance matched before/after. Backup archives were independently checksum-verified after transfer to private recovery storage. The database restored to isolated loopback PostgreSQL 15 with **all 125 data-table counts/hashes matching**, 99 successful migrations, zero unfinished migrations, all 42 database-only invariants, zero cross-tenant grants and zero ledger/outlet mismatches. Prisma reported **no difference**. The uploads archive was independently extracted and all **73 stored-file hashes** matched the source. The preceding `f9504f2` deployment backup was also independently restored/verified before the wording follow-up.

Final live verification passed **188 checks**, including the existing portal/outlet/voucher/finance checks plus owner capabilities, employee report history filtering, and denied financial export/schedule POSTs. These denied requests produced no report, schedule or message. Three historical reports and all four current Harbour vouchers still download. All 13 protected finance/file hashes match throughout the live checks. No booking, approval, payment or preference was created/changed for verification.

Readiness, liveness and database/storage health pass with no runtime error lines in the checked window. The Codex browser shows nine report types for the owner, the corrected disabled-scheduling notice and the saved warm theme, with no console warnings/errors. The verification tab remains open. SMTP connection/authentication passes without sending a message; real inbox receipt is not claimed.

Backup and monitor timers follow the final release and remain active. An additional post-deployment backup is `/root/voya-backups/scheduled/voya-daily-20261119T182241Z-e9af9bbc`, with both recovery environment files hashed. Backup freshness/integrity pass with zero newly missing references. The inherited warning for **10 unavailable original assets** remains explicit: 83 references, 73 stored files. These originals cannot be recreated from backups that never contained them.

Harbour remains at four LIVE products, 124 future OPEN sessions, four completed bookings, four PAYOUT_BLOCKED batches and zero payouts. Report scheduling remains disabled with no schedules. Mobile verification is disabled, AI uses the mock provider, collection mode remains UNCONFIGURED and tax fields remain unset. Client/provider dependencies were not silently activated or substituted with fabricated verification.

For rollback, use the preserved service/frontend configuration to switch code back to the previous compatible release and verify readiness/theme. No database restore is required for ordinary code rollback. A data restore over later client activity requires a separately coordinated recovery decision. This final section is a documentation-only commit after the application deployment.
