# Bulk import metadata, option defaults and ordering — 26 November 2026

Uniform rate currencies now initialize product currency metadata consistently across JSON, CSV and Excel imports. The optional product currency column is appended to the template, preserving existing column positions. Mixed-currency imports require an explicit matching product default and receive actionable validation guidance. No rate amount is converted. Valid existing currencies outside the common dropdown choices remain visible in Basics.

Each imported option initializes its booking limits from its own plans when those values agree. Legacy null defaults display agreed plan limits without a database backfill; differing limits are explained rather than replaced with invented defaults. Existing-plan price PATCHes omit untouched limits. The backend preserves plan limits independently of option limits unless the user explicitly edits them, including zero cutoff. The hours form supports existing whole-minute values, such as 1, 30 or 90 minutes, without rounding them to whole hours.

Product detail and pricing APIs both order options by `createdAt`, then `id`, retaining deterministic order through saves and refreshes, including equal creation timestamps.

## Verification before release

- Backend: 940 tests, 128 suites passed; Nest build passed.
- Frontend: 426 tests, 55 files passed; TypeScript/Vite build passed.
- Added 32 unit regressions: 10 backend and 22 frontend.
- PostgreSQL/API staging harness: 95 checks passed, including 11 new checks.
- Operations/bootstrap tests: 2 passed; demo-build tests: 2 passed; frontend build budget passed.
- Codex browser: 52 assertions passed across product JSON/CSV/XLSX/legacy XLS imports, duplicate and invalid-file guidance, outlet isolation, CSV and Excel rate updates, date-window preservation, MRP, pricing-basis changes, selected paste, save/reload and minute cutoffs.
- Final readback/template verification: 74 assertions passed. Before/after hashes matched for 12 financial tables and 6 existing catalogue tables. Original ACTIVE commercial prices, cancellation rules and future inventory remained intact.

The staging database was an isolated local PostgreSQL copy, `voya_import_fixes_2026112603`, cloned from the previously verified staging snapshot, with scheduled workers and external delivery disabled. No production database or deployment was used for these staging tests.

The original theme and layout are preserved. There is no schema migration, backfill or financial calculation change. Existing product currency metadata is not automatically rewritten; any historical data repair requires a separately reviewed scope. The INR rate-update template continues to direct USD edits to the pricing editor.

New staging regressions are in `activity-saas-backend/scripts/verify-import-three-gaps-staging.cjs`, called by the existing local-only bulk-import harness. These scripts must never target production. Evidence is in `outputs/import-three-gaps-fixes-20261126/`; subsequent release evidence is maintained separately.
