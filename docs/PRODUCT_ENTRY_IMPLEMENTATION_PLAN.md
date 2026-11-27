# Product entry and workbook usability implementation

Scope: row-based workbooks, spacing and readable guidance, separate blank/sample downloads, generated activity IDs versus import references, shared controlled values, dependent locations, stage-aware required fields and duration, actionable errors, and staging regression verification. Keep existing themes, imports, currencies, finance, outlet isolation and published records. No push, deployment or live database writes.

## Phases

- [x] Baseline: 958 backend / 483 frontend tests passed; restored a disposable staging copy and recorded protected data hashes.
- [x] Shared rules: field guidance, import-stage requirements, controlled subtypes, destination hierarchy and normalization; unchanged historical values preserved.
- [x] Workbook: instructions first, version, separate blank/sample downloads, wrapping, widths/heights, frozen headers, hidden notes, required guidance and dependent dropdowns.
- [x] Product entry: searchable dependent locations, shared choices and duration guidance; existing business/content defaults and draft recovery retained.
- [x] Backend: supplied/changed values validated, submission completeness enforced, unrelated rate updates and published bookability retained.
- [x] Import UX: initial rates versus later INR updates, import references versus generated codes, and existing actionable cell/row corrections verified.
- [x] Regression: backend/frontend suites and builds; integration checks for imports, rates, isolation, failure-before-write and protected finance records.
- [x] Staging: Codex browser manual/bulk/correction/submission/rate-update/refresh/mobile checks; real Excel spacing and dependent dropdown verification. See PRODUCT_ENTRY_STAGING_TEST_GUIDE.md and outputs/product-entry-20261128 for evidence.

## Acceptance

One product remains one row. Existing workbook headers and supported older formats remain accepted. Missing data can be saved as a draft; new submission requires positive Hours/Days or explicit Flexible duration. Location parent changes clear incompatible child selections and submitted locations must belong together. Unsupported input gets a specific correction. No credentials or external messaging/payment services are required. Production is untouched.

Pre-existing workspace changes in docs/multi-outlet-evidence and unrelated untracked files are outside this change.
