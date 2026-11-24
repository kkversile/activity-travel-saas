# Remaining bulk-import sanity fixes — 24 November 2026

Implemented locally after the follow-up review found that numeric values, dates and operating days could pass preflight, and that missing sheets or misspelled optional headers produced misleading results. These changes have not been pushed or deployed. No live database was accessed or modified during this implementation.

## Behaviour

- The shared browser/backend import contract rejects nonnumeric or negative prices, more than four monetary decimal places, invalid fixed durations, fractional counts, negative capacity and invalid percentage/count ranges. Explicit zero prices and zero capacity remain allowed by the existing rules; blank optional draft fields remain optional.
- Dates must be real YYYY-MM-DD calendar dates. Rate valid_to must be after valid_from. Schedule effective_to may equal effective_from, preserving single-day schedules. Invalid dates such as 2026-02-30 and reversed ranges fail validation.
- Operating days accept MON through SUN, with case/whitespace normalization and duplicate removal. Unknown days such as FUNDAY fail. Invalid 24-hour slot times and reversed slot intervals fail too, including nested slots_json.
- Both import preflight and actual save use these checks before draft creation. Batch preflight prevents writes when a raw product payload is invalid. Existing valid-row exclusion/partial-import behaviour in the UI is retained: invalid option/rate/schedule rows are shown as excluded, while malformed workbook structure blocks the file entirely.
- Excel template cells have numeric stop rules as well as the existing dropdowns. Correctly typed Excel date/time cells are converted to the supported date/time format, including workbooks using the 1904 date system.
- Product workbooks missing any required sheet receive an error naming that sheet. They no longer fall back to unrelated Basic_Info errors or get misclassified as rate-update files when a product sheet is missing.
- Unknown, duplicate, blank populated or missing required headers receive specific errors. A duration_units typo points to its header cell and recommends duration_unit. Optional header typos cannot silently discard values. Formatting-only trailing columns are ignored.
- The five-sheet product layout and supported legacy layout remain importable. Product CSV headers are checked, and rate-update dates also use strict calendar-date checks.
- Sample JSON generation returns independent rows so modifying a returned sample cannot contaminate future template downloads.

## Files

- `activity-saas-backend/src/common/product-import-contract.ts`: shared numeric, calendar, range, day and time rules.
- `activity-saas-backend/src/catalogue/catalogue.import-recovery.spec.ts`: direct preflight/save rejection and no-write batch regression cases.
- `activity-saas-frontend/src/components/product-import/productImport.ts`: layout/header checks, source locations, Excel date/time conversion and sample isolation.
- `activity-saas-frontend/src/components/product-import/productImportStructure.ts`: header inspection and typo suggestions.
- `activity-saas-frontend/src/components/product-import/productImportTemplate.ts`: spreadsheet numeric stop rules and instructions.
- `activity-saas-frontend/src/components/product-import/ProductImportModal.tsx`: correct product-file recognition before rate-update detection.
- Associated modal, hygiene and sanity tests in the same frontend directory.

No Prisma migration, dependency update, theme/color change, production data correction or financial ledger change is included. The two pre-existing modified multi-outlet evidence files were left untouched.

## Verification

- Backend build passed; all **805 tests** passed, including financial regression and outlet-isolation coverage.
- Frontend build and JavaScript budget passed; all **299 tests** passed.
- Additional cases cover the six reproduced bad-data inputs, calendar rollover, monetary precision, numeric bounds, every missing sheet, header typos and duplicates, valid Excel serial dates/times, the legacy layout, raw row limits, and harmless trailing formatting.
- Codex browser testing of the actual local import modal confirmed numeric errors with source cells and disabled saving, missing Rates guidance, the duration_units header correction, and successful download/re-upload of the new sample template. No save request was submitted.
- An independent ExcelJS reader confirmed numeric stop rules in the generated workbook. Native Microsoft Excel was not used for this check.
- The initial simultaneous frontend build/test attempt exceeded the machine's available memory. A sequential build and a full single-worker test rerun passed. No application memory workaround or test exclusion was added.

Evidence and an updated workbook are in `outputs/import-sanity-fixes-20261124/`, including backend/frontend test JSON, rechecked negative cases, workbook-rule checks and browser screenshots. The local verification tab was left open.

## Review and release

Review these local source changes, then deploy backend and frontend together using the existing demo build configuration and backup process. This implementation turn intentionally made no live deployment. After deployment, repeat the validation-only browser checks and verify the API rejects raw invalid payloads before client acceptance. No universal claim that every possible client input is covered is implied by the passing test suite.
