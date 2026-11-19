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
