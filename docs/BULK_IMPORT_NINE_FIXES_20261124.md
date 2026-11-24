# Bulk upload and rate update fixes — 24 November 2026

**Status: all nine findings fixed and verified locally/on staging.** This change addresses `BULK_UPLOAD_RATE_UPDATE_REVIEW_20261124.md`. No commit, push, deployment or live database mutation was performed.

## Implementation

| Finding | Fix |
| --- | --- |
| Omitted prices restored old values | `bulk-rate-update.ts` partitions the requested dates at existing commercial boundaries and inherits omitted prices and terms from the applicable version. Newer versions override older ones only over their own dates; an old incomplete draft cannot shadow its newer approved version. The canonical transaction creates draft ranges and preserves approved versions. |
| Identical retry failed | Rate submissions accept an optional UUID. The frontend reuses it across validation, response-loss retries and partial recovery, and replaces it when another file is selected. Cached results are checked after tenant/outlet authorization and before rebuilding mutable DTOs. Per-product transaction locks serialize concurrent retries. Changed rows under the same UUID are rejected; a new UUID permits an intentional new submission. Legacy API callers without a UUID receive deterministic replay for identical normalized rows. |
| Incompatible price columns ignored | Each date segment checks sell columns against its existing pricing basis. Per-person rates require traveller columns; group, booking and resource rates use the base column. The locked save rechecks basis/currency so a concurrent change cannot silently discard prices. |
| Request/resource settings missing | Rate projections and segment preparation preserve confirmation SLA, passenger limit, commission settings, booking mode, MRP, timezone, pricing days/slots, visitor settings and cancellation snapshots. |
| Impossible API dates accepted | The DTO requires strict, real YYYY-MM-DD dates, and the service repeats calendar/range validation for internal callers. End dates remain exclusive. |
| Wrong error rows and unclear guidance | Original CSV/Excel metadata stays in browser WeakMaps through normalization and partial recovery. Backend errors carry product/option/field and correction data. The UI translates template field names, locates physical cells, retains entered values and expands group errors to affected rows. Error CSVs include the same information. |
| Malformed JSON silently disappeared | Section shapes, unknown section names and invalid row entries are reported before parsing. Invalid products in an envelope are explicitly excluded with warnings; valid products can remain. Raw malformed entries count towards file limits. Recovery JSON retains the supported structure. |
| Duplicate content passed batch preflight | Both browser grouping and backend preflight detect repeated name/type/destination combinations under different codes. Backend validation rejects the batch before creating drafts and reports the repeated product. |
| Image URLs passed preflight then failed | Shared browser/API media checks reject unsupported image URLs and conflicting references. Backend preflight additionally checks asset ownership, purpose, public visibility, archive status and MIME kind. JSON samples now leave Media empty and explain uploading validated images in the editor. |

Bulk saves continue through the existing catalogue/commercial transaction and idempotency records. They do not replace ledger, booking, fulfilment, settlement or payout logic. Draft rate-only saves preserve approved plan base-price defaults and traveller/cancellation rules as well as active commercial versions. Existing UI colors and layout are unchanged.

Browser verification also exposed a successful-import navigation issue. The App now opens the imported draft through an explicit callback while preserving the selected outlet in state and the URL. This is covered by `App.bulk-import.test.tsx` and an actual browser save. Completion messages now state that rate changes are drafts awaiting review. Existing-product duplicate errors identify the source cell and explain editing the existing product or using rate-update mode; error messages visibly include entered values.

## Main files

- `activity-saas-backend/src/catalogue/bulk-rate-update.ts` and its regression tests.
- `activity-saas-backend/src/catalogue/catalogue.service.ts`, `catalogue.dto.ts`, `catalogue.import-batch.spec.ts`, `catalogue.import-recovery.spec.ts`.
- `activity-saas-backend/src/common/product-import-contract.ts`, `product-import-sample.ts`.
- `activity-saas-backend/scripts/verify-bulk-import-staging.cjs` and its package script.
- `activity-saas-frontend/src/components/product-import/productImport.ts`, `ProductImportModal.tsx`, `ProductImportModal.test.tsx`, `productImportReleaseRegression.test.ts`, and the JSON sample assertion in `productImport.test.ts`.
- `activity-saas-frontend/src/App.tsx`, `App.bulk-import.test.tsx`, `pages/PartnerHubPages.tsx` for the scoped navigation handoff and draft completion wording.
- `activity-saas-backend/scripts/verify-bulk-import-browser-results.cjs` verifies the real browser records and downloaded error report using read-only transactions.

Earlier uncommitted sanity/consistency fixes remain part of the working tree; unrelated evidence files were left intact. There are **no Prisma schema changes, migrations or backfills** for these fixes.

## Rehearsal

The maintained verification command is `npm run verify:bulk-import:staging` from the backend directory. It accepts `BULK_IMPORT_STAGING_DATABASE_URL` only when it names a disposable `voya_import_fixes_<digits>` database on `127.0.0.1:55445`, owned by the local staging user. It never reads the repository's database URL for its target. Create that copy from the previously restored PG15 snapshot before running it. `--serve` leaves the isolated API on port 4048 for browser verification after a passing rehearsal.

The script disables scheduled workers, SMTP, OTP delivery and AI, blocks external HTTP requests, and uses protected local backup encryption keys without logging them. New demonstration records are clearly named. It checks actual NestJS HTTP requests, PostgreSQL records, source parsers, partial failure/recovery, concurrent retry behavior, tenant/outlet isolation, normal catalogue submission/publication, and the four pricing bases across three booking modes.

Protected row counts/hashes cover Booking, BookingEconomicsSnapshot, FinancialEvent, Payout, SettlementBatch, SettlementLine, SettlementEventAllocation, SettlementHold, PayoutAttempt, PayoutReleaseApprovalRequest, CommissionInvoice and FinanceConfiguration. The rehearsal creates no bookings, financial events, settlements, approvals of payouts or payments.

Evidence and final test/browser results are recorded under `outputs/import-nine-fixes-20261124/`. The staging Vite UI uses port 3040 and the isolated API on port 4048; it does not point at live.

## Manual acceptance steps

1. Sign into the isolated staging UI, select the Harbour Trails outlet indicated in `staging/browser-fixtures.json`, and open Bulk upload.
2. Upload `staging/browser-products.xlsx`, review the preview, validate, then save. Confirm one draft is created. Upload it again and confirm duplicate validation prevents saving another product.
3. Choose Update rates and upload `browser-adult-rates.csv`. Validate and apply; repeat with `browser-child-rates.csv`. Confirm December adult INR 1,930 and child INR 970, with dates outside the period retaining their prior prices.
4. Upload `browser-rate-error.csv`. Validate and confirm the missing product is identified at physical CSV row 4, with a correction. Download the error report.
5. Upload `browser-numeric-error.csv` and confirm the exact cell, entered value and amount-format correction are shown before any server save. Upload `browser-invalid.json` and confirm malformed Media entries are reported.
6. For a response-loss retry, validate/apply the same submission again without reselecting the file. Confirm no duplicate versions or side effects. For an intentional new submission, reselect the file so it receives a new submission UUID.
7. Use an outlet employee and a different vendor to confirm foreign outlet imports/rate updates remain forbidden. The automated rehearsal additionally injects second-product/second-rate-group interruptions and verifies remaining-record retries.

## Limits

Staging is a disposable copy of the previously restored snapshot, not a fresh copy of today's live database. Native Microsoft Excel's interactive dropdown UI, external mail/payment delivery and production capacity are outside this verification. Excel OOXML validation rules, legacy layouts and parser round-trips are tested. A deployment still needs separate approval and a fresh live backup; nothing in this report performs or authorizes one.

## Final results

| Check | Result |
| --- | --- |
| Backend build | Passed |
| Backend regression suite | **834/834**, 126 suites, no skipped tests |
| Frontend production build | Passed |
| Frontend regression suite | **337/337**, no skipped tests |
| Demo-build configuration checks | **2/2** |
| JavaScript build budget | Passed; initial entry 264,600 bytes / 80,764 gzip; import screens remain lazy |
| Prisma schema validation | Passed; no schema changes or migrations |
| Real PostgreSQL/NestJS staging rehearsal | **33/33** on `voya_import_fixes_2026112403`, including four pricing bases × three booking modes |
| Codex browser | Product import → scoped draft editor; adult then child rates; duplicate blocking; numeric/JSON errors; source cells, entered values, corrections and downloaded error rows |
| Browser database verification | One navigation-test product, correct outlet, December adult **INR 1,930** / child **INR 970** / senior INR 1,400 / MRP INR 2,200; outside-period adult INR 1,800 / child INR 900 preserved |
| Protected finance/booking records | All 12 table row counts and hashes match the restored source, including after browser uploads |
| Isolated API readiness | Database and storage up |
| Commit/push/deploy/live DB | None; HEAD remains `8577575` |

Final evidence: `backend-tests.json`, `frontend-tests.json`, build logs, `frontend-budget.json`, `demo-build-tests.log`, `prisma-validate.log`, `staging/staging-verification.json` and `staging/browser-database-verification.json` under `outputs/import-nine-fixes-20261124/`.

Browser screenshots and accessibility traces are in the `staging/` subdirectory, including `browser-draft-navigation.jpg`, `browser-final-duplicate-guidance.jpg`, `browser-final-numeric-guidance.jpg`, source-row errors, JSON errors and the downloaded error CSV. The final verification tab is kept open at the isolated Bulk upload page on port 3040; API port 4048 uses only the local staging copy.

Initial verification attempts encountered transient local Jest dependency-read errors and a Docker engine interruption. The final clean uncached backend run passed all 126 suites; Docker was restored and the entire staging rehearsal and post-browser financial comparison passed again. Final results above have no failed or skipped tests.

When committing later, include the new helper, regression test and verification script files as well as the earlier untracked `productImportStructure.ts`, `productImportSanity.test.ts` and `productImportConsistency.test.ts`. No dependencies were added. Unrelated multi-outlet evidence files, backups and recordings were left intact.
