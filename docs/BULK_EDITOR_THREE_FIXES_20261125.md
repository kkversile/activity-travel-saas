# Bulk editor regression fixes — 25 November 2026

The Rates editor now exposes every enabled traveller category, including Infant, Youth and Group. Returning to per-traveller pricing requires a price for each enabled type, with zero allowed for free admission. Both preview and transactional apply enforce completeness. The transaction retains loaded traveller rules across the Prisma plan update, and compatible legacy plans use the same validation. Editing an additional category sends only that category so untouched date periods retain their values.

Clearing enabled MRP is blocked with an inline error. Selecting No MRP suppresses that option's MRP and savings before save, after save and after reload, while preserving the other options' individual modes. Missing MRP configuration defaults to No; historical amount metadata can be retained for re-enabling without displaying an active MRP.

Pasted rows follow selected options in display order and skip unselected options. Blank leading cells preserve existing values without shifting columns. Mixed pricing bases, an unselected starting option and surplus rows or columns are rejected atomically with correction guidance.

## Verification

- Backend: 915 passing tests across 127 suites.
- Frontend: 395 passing tests across 53 files.
- Seventeen new unit regressions: six backend and eleven frontend.
- Seventy-seven PostgreSQL/NestJS staging acceptance checks, including eight new cases.
- Backend/frontend builds, two bootstrap tests, two demo-build tests and the frontend entry budget passed.
- Staging has 99 completed migrations; this change adds no schema migration or backfill.

Staging was an isolated local PostgreSQL 15 copy (`voya_import_fixes_2026112511`), cloned from a previously verified local restored snapshot, with external delivery and scheduled workers disabled. A failed initial rehearsal exposed a preview/apply mismatch; the transaction was corrected and all checks passed on a fresh copy.

The Codex browser verified the three reproductions through saving and reopening, JSON/CSV/XLSX/legacy XLS product imports, template downloads, actionable error downloads, duplicate/empty/date/amount/currency/outlet rejection, and rate updates across two products including zero child prices and 1904 Excel dates. Before/after checks preserved all 12 protected financial tables, all approved commercial versions and their traveller prices. Untouched option prices, cancellation terms and other commercial settings remained unchanged.

The existing UI layout and theme colours are preserved. Existing incomplete legacy prices require explicit entry; no amounts are invented or automatically backfilled. The verified scope does not include real payments or external delivery.

The acceptance harness is `activity-saas-backend/scripts/verify-bulk-import-staging.cjs`, with new cases in `verify-bulk-editor-three-cases.cjs`. It is restricted to disposable local databases and is not a production operation.
