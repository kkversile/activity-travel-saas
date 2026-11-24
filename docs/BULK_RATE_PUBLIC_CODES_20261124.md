# Bulk rate imports: displayed code compatibility

The deployed product list and editor display public product identifiers, while
rate imports previously matched only the stored supplier/internal product code.
Rate uploads now accept either code and resolve both through the tenant-scoped
product query. Outlet authorization is checked before accessing cached results.
Public option identifiers are resolved only within the authorized product.

Rows using different aliases for the same actual option are rejected. Distinct
options using different product aliases are grouped into one product save.
Partial results explicitly list completed source codes so retries retain only
unsaved rows, including files that mix public and internal identifiers.

Validation on 24 November 2026:

- Backend: 839 tests across 126 suites passed; build passed.
- Frontend: 338 tests passed; production build and entry budget passed.
- Demo build configuration: 2 tests passed.
- Disposable PostgreSQL/NestJS rehearsal: 34 checks passed, including public
  codes from the actual listing API, public option aliases, alias duplicates,
  tenant/outlet denial, retries, date boundaries and financial hash comparisons.
- No Prisma schema changes or migrations.

Live verification evidence and deployment results are recorded separately under
`outputs/bulk-nine-live-deployment-20261124/`. Only clearly labelled demo drafts
are used for write verification; existing financial records are compared to a
read-only baseline. Backups precede each deployment.
