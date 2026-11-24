# Bulk import/editor: six fixes and staging verification — 25 November 2026

All six findings from the latest live recheck are fixed in the local working
tree and verified on isolated staging. **No push, deployment or live-data access
occurred during that staging phase.** Verification started from
`d3d222bc36e4bdfd427f4503f69c3379da0715ba`. The subsequent Hostinger release was
authorized on 25 November; its fresh backup and post-deployment evidence are
recorded separately under `outputs/bulk-editor-six-live-deploy-20261125/`.

## Resulting behavior

| Finding | Resolution |
| --- | --- |
| Editor removed infant/youth/group prices | The simplified editor hydrates and resubmits unrendered traveller and visitor types. Repeated saves retain zero prices and four-decimal amounts while visible price edits update only the intended entries. Explicitly disabling visitor pricing still clears visitor configuration. Hidden eligibility/verification settings also retain their existing values when omitted from a price-only request; explicit changes still work. |
| Mixed traveller/group visitor pricing prevented saving | Backend visitor-adult validation applies to PER_PERSON options, matching the fields the UI renders. GROUP, PER_BOOKING and PER_UNIT options can be selected with traveller options without inventing foreign-adult prices. Traveller validation remains enforced. |
| Wrong-outlet error had no row or correction | Recognized access denials become safe batch errors tied to the supplied product code and row, with instructions to select an authorized outlet or remove the row. Input source mapping and error downloads retain the physical CSV cell. Authorization runs before cached results, and any rejected group blocks the whole batch before writes. |
| Preview called rejected rows valid and counted aliases twice | Records are labelled parsed until server validation passes. Validated rate previews use the server's resolved product count, so public/internal aliases for different options of one product display one product. Failed validation shows zero records ready to save; Apply remains disabled. |
| Empty replacement retained previous filename/errors | File metadata, models, rows, issues, progress and validation state reset before size/extension checks. The actual replacement filename appears even for an empty file. |
| Impossible start date incorrectly flagged a valid end | Both dates must pass strict calendar validation before their ordering is checked. End dates remain exclusive, leap dates remain supported, and reversed real ranges remain rejected. |

Existing styling/colors are preserved. No CSS, dependencies, Prisma schema,
migrations, backfills, ledger, payout, reconciliation or accounting rules changed.

## Final verification

| Check | Result |
| --- | --- |
| Backend production build | Passed |
| Full backend suite | **889/889 tests**, 126 suites, no failures/skips |
| Frontend production build | Passed |
| Full frontend suite | **364/364 tests**, no failures/skips |
| Demo-build checks | **2/2 passed** |
| Entry-size budget | Passed: 264,600 bytes / 80,767 gzip; heavy screens remain deferred |
| Real NestJS/PostgreSQL staging checks | **51/51 passed** |
| Codex browser positive flow | JSON product, sectioned CSV product, two-product Excel batch, CSV rates, Excel zero-child rates, mixed editor save twice and reopen |
| Codex browser rejection/recovery flow | Wrong outlet with physical cell/correction, failed-preview labels, empty file after rejection and success, invalid calendar date, JSON duplicate paths/download, existing-product protection, template downloads |
| Read-only post-browser comparison | Passed: 12 existing catalogue/pricing/inventory tables, 12 booking/finance tables and approved commercial versions unchanged |

The final staging database is `voya_import_fixes_2026112505`, cloned locally from
`voya_readiness_recovery_review_20261119192801`. API/UI are bound to
`http://127.0.0.1:4050/api` and `http://127.0.0.1:3042`. External delivery, OpenAI
and scheduled workers are disabled. The final Codex browser tab remains open on
Bulk upload with Fort Kochi selected.

The price readback after CSV import, Excel zero prices and two normal editor saves
contains ADULT 2050, CHILD 0, SENIOR 1400, INFANT 0, YOUTH 1200.1234 and GROUP 2000.
All six visitor entries remain; foreign amounts, NATIONALITY eligibility,
DOCUMENT_AT_BOOKING verification and MRP 3000 remain intact. The selected GROUP
option retains its own price of 7300. All four browser-imported products remain
unpublished drafts in the intended outlet.

Downloaded workbook inspection confirms 20 product dropdown rules, five product
monetary stop rules and five rate-update monetary stop rules. Downloaded error
rows preserve `CSV!A4`, its correction and both original duplicate JSON paths.

## Modified files

- Backend `src/catalogue/catalogue.service.ts` and regression tests in
  `activity-prices-availability.spec.ts`, `catalogue.import-batch.spec.ts`.
- Frontend `src/components/product-wizard/ActivityPricesAvailability.tsx` and its
  tests; `src/components/product-import/ProductImportModal.tsx`, `productImport.ts`
  and their tests; `src/App.bulk-import.test.tsx` follows the parsed/validated labels.
- Staging runner `activity-saas-backend/scripts/verify-bulk-import-staging.cjs`.
- New maintained regressions/fixtures:
  `activity-saas-backend/scripts/verify-bulk-editor-six-cases.cjs`.
- New read-only browser/database verifier:
  `activity-saas-backend/scripts/verify-bulk-editor-browser.cjs`.
- This report. Pre-existing multi-outlet evidence-file edits were preserved.

## Reproduction and evidence

Use `npm run verify:bulk-import:staging -- --serve` in the backend with
`BULK_IMPORT_STAGING_DATABASE_URL` pointing to a fresh disposable
`voya_import_fixes_<digits>` database on `127.0.0.1:55445`, user `voya_staging`.
Set `BULK_IMPORT_EVIDENCE_DIR`, `BULK_IMPORT_STAGING_PORT` and
`BULK_IMPORT_STAGING_UI_ORIGIN` for the local run. The guard refuses other database
targets. Build the backend first. Run the frontend dev server with
`VITE_API_BASE_URL` pointing to that isolated API.

The runner generates `editor-browser-session-fixtures.json`, product files,
alias rates, Excel zero prices and negative fixtures. With the same database and
evidence environment, `node scripts/verify-bulk-editor-browser.cjs --baseline`
records the pre-browser state. After the documented browser flow, the command
without `--baseline` verifies exact saved prices and protected data in a read-only
transaction.

Final evidence is under `outputs/bulk-editor-six-fixes-20261125/`:

- `backend-tests-final.json`, `frontend-tests.json`, production-build logs,
  `demo-build-checks.log` and `frontend-budget.json`.
- `staging-final/staging-verification.json`: all 51 acceptance checks.
- `staging-final/editor-browser-baseline.json` and
  `editor-browser-verification.json`: protected data and exact prices/policies.
- `staging-final/editor-browser-artifact-verification.json`, downloaded templates,
  error CSVs and captured browser states/screenshots.

An initial browser readback caught the omitted visitor-policy reset. The final
backend includes the preservation fix, two unit regressions and an additional
HTTP/PostgreSQL check; verification was repeated against a fresh staging copy.
The final results above supersede the initial run.

## Limits

Staging uses the previously restored local snapshot, not a new live database copy.
Native Microsoft Excel dropdown interaction was not opened; actual downloaded
OOXML validations and parser round-trips were inspected. External mail, OTP,
OpenAI and real payments were not exercised. Published-price protection and
approval/finance regressions ran on isolated staging fixtures, not live data.
These results establish the covered flows; they are not a guarantee for every
possible spreadsheet or external integration. Live release verification is a
separate phase from this staging report.
