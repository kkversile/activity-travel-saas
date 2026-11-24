# Bulk upload and rate update readiness review — 24 November 2026

Resolution: these findings were subsequently fixed and verified. See `BULK_IMPORT_NINE_FIXES_20261124.md` for the current implementation, test evidence and staging acceptance results. The HOLD decision below records the original review before those fixes.

**Decision: HOLD the push.** Existing regression tests pass, but the deeper PostgreSQL/API checks reproduced important cases that the current tests do not cover. The most serious case silently restores an old adult price during a child-only upload.

This was a review of the current working tree on top of `85775757e778fadc3db7e8da1e08c8e0dcc63835`. No application source was changed during this review. Nothing was committed, pushed or deployed, and the live database was not accessed or changed.

## Confirmed findings

### 1. P1 — Blank price columns can restore old prices

Location: `activity-saas-backend/src/catalogue/catalogue.service.ts:2713–2733`.

Reproduction on real PostgreSQL:

1. Import the supplied sample: adult INR 1,800, child INR 900.
2. Apply adult INR 1,900 for 1 December 2026 through 1 January 2027 (exclusive).
3. Apply child INR 950 for that same period, leaving adult blank.
4. The resulting December adult price is **INR 1,800**, rather than INR 1,900.

The bulk adapter uses `editablePlan.versions[0]`, ordered by version number, to fill omitted prices. After date splitting, the latest version can represent the unchanged period after the update. It is not necessarily the version applicable to the uploaded dates.

Required fix: apply only supplied price fields to each applicable date segment. Preserve omitted prices and other commercial settings separately across existing date boundaries. Add database assertions for adult-only then child-only updates, reverse order, multiple existing periods and unchanged dates outside the edited range.

### 2. P2 — Identical rate retries fail after a successful save

Location: `activity-saas-backend/src/catalogue/catalogue.service.ts:2782–2783`, with payload comparison at `4943–4951`.

After a successful rate upload, sending the same rows again returns HTTP 201 with `status: PARTIAL`, `updatedProductCount: 0` and `IDEMPOTENCY_KEY_REUSED`.

The bulk key hashes the original rows, but the generated apply DTO contains current version numbers and inherited prices. These change after the first save, so the same key is presented with a different payload fingerprint. This blocks safe recovery when the first response was lost.

Required fix: identify a submission/retry before reconstructing it from mutable commercial state; replay its stored result and preserve outlet/tenant authorization checks. Distinguish retrying an existing submission from intentionally submitting a new update. Cover response-loss retries and partially completed batches.

### 3. P2 — Price columns incompatible with the existing pricing basis are ignored

Location: `activity-saas-backend/src/catalogue/catalogue.service.ts:2730–2758`.

Both real API preflights incorrectly return `valid: true`:

- `base_sell_inr` alone for a PER_PERSON option; the current adult price satisfies the required-price check and the supplied base amount is ignored.
- `adult_sell_inr` alone for a GROUP option; the current base price satisfies the required-price check and the supplied adult amount is ignored.

Required fix: validate supplied sell columns against the existing pricing basis before constructing defaults. Identify the exact row/column and explain which sell columns to use. A successful update must never silently discard an entered sell price.

### 4. P2 — Valid on-request and per-resource options cannot use bulk rate updates

Locations: bulk DTO construction at `catalogue.service.ts:2742–2765`; required input checks at `4452–4459` and `4511–4519`; rate response mapping at `4860–4877`.

An existing MANUAL_ON_REQUEST option with a 120-minute confirmation SLA fails with “add a confirmation SLA for non-instant booking.” An existing PER_UNIT option with a stored passenger limit fails with “add maximum passengers per resource.” The adapter does not carry these settings forward, and the rate template offers no way to provide them.

Required fix: expose and preserve the existing confirmation SLA and per-resource passenger limit when preparing a rate-only update. Preserve booking rules, resource settings and commercial terms. Add integration cases for every supported pricing basis and booking mode.

### 5. P2 — Rate API accepts impossible calendar dates

Location: `activity-saas-backend/src/catalogue/catalogue.dto.ts:167–168`, and the initial row checks in `catalogue.service.ts:2682–2690`.

The direct rate preflight accepts `validFrom: "2026-02-30"` and reports `valid: true`. The frontend rejects this date, but `@IsDateString()` without strict calendar validation and `new Date()` comparison permit normalization in the API.

Required fix: enforce real YYYY-MM-DD calendar dates and the exclusive end-date rule in the backend as well as the parser. Test leap years, impossible dates, reversed/equal dates and datetime strings according to the documented contract.

### 6. P2 — Rate errors lose source locations and some correction guidance

Locations: `productImport.ts:234–278`, `productImport.ts:597–611`, `ProductImportModal.tsx:83–86`; backend rate errors use compacted array indices.

With a blank CSV row before an otherwise valid rate row, a server-side unknown-product error for physical row 3 is displayed as row 2. `serverImportIssues` only receives product models, so it cannot restore rate-row metadata. Preview errors also use row 0 and an empty option code. Local numeric errors display the internal field name `adultSellInr`, without a cell or “How to fix” text; this was confirmed in the Codex browser.

Required fix: retain original sheet/row/column metadata for normalized rate rows without trusting client metadata for authorization. Map backend option/group errors back to all affected source rows and template field names. Include the entered value and actionable correction in both the UI and downloaded error report.

### 7. P2 — Malformed optional JSON rows disappear without a warning

Location: `activity-saas-frontend/src/components/product-import/productImport.ts:555–558` and its callers.

Adding `Media: [null, 42]` to the otherwise valid JSON sample yields a valid model and **no issues**. `jsonRows()` filters the entries out before validation or reporting. Other import sections use the same filtering helper.

Required fix: report invalid section shapes and malformed entries with their original JSON section/index. If partial import remains supported, explicitly list excluded rows rather than silently losing them. Verify recovery JSON still round-trips.

### 8. P2 — Same-content duplicates inside a batch pass preflight

Location: `activity-saas-backend/src/catalogue/catalogue.service.ts:2580–2588` and `2610–2619`.

Two new products with different product keys but identical product name/type/destination pass batch validation with `productCount: 2`. The save path subsequently rejects the second using the content fingerprint. Internal duplicate checking currently compares keys; fingerprint lookup only compares against products already in the database.

Required fix: detect duplicate normalized content fingerprints inside the submitted batch before any draft is saved, with both product/source locations. Preserve the established rule that the same content cannot be imported again under a different code.

### 9. P2 — Unsupported image URLs pass validation, then fail during saving

Locations: Media checks in `productImport.ts` and `catalogue.service.ts:2050–2054`; canonical image policy in `catalogue.service.ts:6263–6267`.

An otherwise valid JSON import with an IMAGE `external_url` is accepted by the frontend and batch preflight. Single-product saving then fails with HTTP 409: “External image URLs cannot be quality-checked; upload a validated image asset instead.” The rule is correct, but it is applied only after draft creation. This is a validation/save mismatch for legacy/JSON media imports.

Required fix: enforce the canonical media rules during preflight, including image asset purpose, visibility, ownership and supported references. Explain that images require an uploaded validated asset, and point to the affected Media row. Keep the image-quality rule intact. Verify rejected media causes no writes.

## What passed

- Backend build and existing backend regression suite: **125 suites / 806 tests**.
- Frontend regression suite: **318 tests**, frontend production build, JavaScript bundle budget and **2 demo-build configuration checks** all passed.
- Real NestJS HTTP requests with the normal guards and ValidationPipe against a **new disposable local PG15 database cloned from the existing restored staging copy**: `127.0.0.1:55445/voya_import_review_20261124`.
- Single Excel-derived product import, with two options, rate plans, schedules and materialized availability; multi-product batch creation.
- Existing-product duplicate preflight and duplicate save rejection; a mixed new/existing batch saves nothing.
- Preflight leaves catalogue/commercial-version counts unchanged.
- Outlet employees cannot import into another outlet. Unauthorized outlet employees and a separate vendor tenant cannot validate or apply foreign rate updates.
- Initial rate update and preservation of omitted child/senior amounts and MRP in that initial update. The subsequent date-range retention failure is finding 1.
- Imported a new staging-only fixture with an existing authorized image asset, completed its category, submitted it through the vendor API and published it through the admin API. A subsequent bulk rate update created a draft price change while preserving the approved active commercial versions until review. Historical booking/finance hashes remained unchanged.
- Fault injection after the second product draft is created: the first saved product remains; the interrupted draft releases its import identity; remaining-record JSON parses and saves successfully.
- Fault injection in the second rate group: the first group remains applied; the reported remaining group retries successfully.
- **Twelve protected booking/finance/accounting tables retain identical row counts and hashes** throughout these import/update/recovery checks. No bookings, ledger events, settlements, payout approvals or payments were created or changed.
- Codex browser check of rate error display; the final verification tab remains open. Screenshot: `outputs/import-end-to-end-review-20261124/rate-price-guidance.jpg`.

## Regression attribution and limits

The backend `importRateBatch`, `importBatch`, rate DTO, frontend `jsonRows`, and `serverImportIssues` implementations are byte-equivalent to HEAD after newline normalization. These are **remaining pre-existing gaps**, rather than demonstrated regressions introduced by the pending sanity/consistency fixes. The pending changes do not resolve them. Existing green unit tests therefore do not establish readiness for these scenarios.

The local database is a copy of the previously restored staging snapshot, not a fresh pull of today's live database. All mutations occurred only on that disposable copy. External HTTP delivery, SMTP and scheduled workers were disabled. This review did not release payouts, use real payment credentials, change existing approvals or test native Microsoft Excel's interactive dropdown UI. A new demonstration fixture was approved only in the disposable copy. Template OOXML/dropdown/numeric-rule round-trips and legacy-format support are covered by parser tests.

One first-pass on-request fixture used a nonexistent enum value (`REQUEST`) and was corrected to `MANUAL_ON_REQUEST`; exclude that harness error from application findings. The corrected real API reproduction is in `staging-additional-review.json`. Product and rate fault injection intentionally affects only the disposable local copy; original methods are restored in `finally` blocks.

## Evidence and release gate

All evidence is in `outputs/import-end-to-end-review-20261124/`:

- `staging-review.json`: create/preflight/duplicate/isolation/rate/retention checks.
- `staging-additional-review.json`: corrected request/resource fixtures, wrong-basis rates, physical CSV rows, partial rate recovery and JSON shape check.
- `staging-product-recovery.json`: interrupted product recovery and within-batch fingerprint check.
- `staging-published-review.json`: normal staging product submission/publication, draft rate save and approved price/history preservation.
- `source-comparison.json`: comparison of affected methods with HEAD.
- `backend-build.log`, `backend-tests.json`, `backend-tests.log`.
- `frontend-tests.json`, `frontend-tests.log`, `frontend-build.log`, `frontend-budget.json`.
- `imported-rate-state.json`, `updated-rate-state.json` and browser evidence.
- Reproduction runner: `tmp/recheck-bulk-flow-20261124.cjs`. It hardcodes and guards the disposable loopback database, disables workers/delivery, and blocks external fetches.

Before pushing: fix the findings, turn the reproductions into maintained regression tests, rerun the complete suites/builds and the database rehearsal, and verify successful/rejected/recovery states through the actual vendor bulk-upload page. Rehearse a fresh migration only if the selected fixes add schema changes. Deployment requires its own fresh backup and approval; this review performs neither.

## Final verification summary

- Both builds: pass.
- Existing regression tests: backend **806/806**, frontend **318/318**, demo-build **2/2**.
- New targeted scenarios: reproduced the nine findings above; these are **not** a passing release acceptance run.
- Protected finance/accounting hashes: unchanged across create, update, interrupted recovery and published-product checks.
- Initial JavaScript: 264,568 bytes (80,755 gzip); heavy import screens remain deferred; budget passes.
- Existing uncommitted application changes and unrelated evidence files were left intact. No migration, commit, push, deployment or live database mutation occurred.
- Release recommendation: **hold until these cases are fixed and verified**.
