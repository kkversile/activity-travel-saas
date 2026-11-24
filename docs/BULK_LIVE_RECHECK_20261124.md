# Live bulk upload and rate update recheck — 24 November 2026

Update, 25 November: all six findings below are fixed and verified locally/on
isolated staging. See `BULK_IMPORT_SIX_FIXES_20261125.md` for final evidence. No
push or deployment has occurred; this original review still describes the live
`b0d41ab` release.

**Decision: six remaining findings need fixes before an unrestricted client sign-off.**
The existing fixes still pass their acceptance checks, but additional supported
pricing and input combinations reproduce problems. One conditional regression was
introduced by public-code support; five gaps were already present in `8577575`.
No application source was edited, nothing was pushed/deployed, and no live import
or price save was performed during this review.

## Findings, ordered by impact

### 1. P1 — An adult-only upload removes infant and youth prices

Location: `activity-saas-backend/src/catalogue/bulk-rate-update.ts:22`.

On disposable PostgreSQL, use the normal prices editor API to save adult 1,800,
child 900, senior 1,400, youth 1,200 and infant 200. An adult-only bulk update to
1,900 passes preflight and completes, but the resulting December draft contains
only ADULT, CHILD and SENIOR. INFANT and YOUTH have disappeared. The helper
reconstructs prices from three hardcoded categories rather than preserving all
existing categories. Approval of such a draft can subsequently prevent quotes
for the missing categories.

Fix: start from every existing traveller price for each date segment and patch
only the supplied fields. Test INFANT/YOUTH/GROUP retention, zero values,
repeated updates, date boundaries and approval/quote behavior.

Attribution: pre-existing; the old adapter also reconstructed only three types.
Live exposure now: no undeleted products currently have these extra per-person
traveller prices. This is a supported-configuration risk, not observed live loss.

### 2. P1 — Bulk rates leave the Indian visitor price stale

Location: `activity-saas-backend/src/catalogue/bulk-rate-update.ts:44`.

The normal editor treats the ordinary price as the Indian visitor price. Seed an
adult price of 1,800 with Indian 1,800 / foreign 2,600. Bulk-upload adult 1,900.
Preflight and save succeed, but the stored visitor price remains Indian 1,800.
The commercial calculator still returns a supplier basis of **1,800.00** for one
Indian adult. The ordinary traveller price shows 1,900, so the update and quote
disagree. The preserved foreign price should remain 2,600.

Fix: synchronize supplied ordinary amounts into the corresponding Indian visitor
amounts per date segment, retaining foreign prices and verification settings; or
explicitly block this combination with guidance to advanced pricing. Test the
actual quote calculator after the update, not only stored traveller prices.

Attribution: pre-existing; the former adapter copied the same visitor payload.
Live exposure now: no undeleted products currently have visitor-price payloads.

### 3. P2 — Public/internal code collision can update the wrong product

Location: `activity-saas-backend/src/catalogue/catalogue.service.ts:2718`.

Conditional reproduction: within one vendor, one product's internal code equals
another product's public code. Both products have an option with the same code.
The public alias silently overwrites the internal-code entry in `productsByCode`.
An upload intended for the internal-code product completes against the other
product. The reproduction returned the other product ID in its saved result.
Tenant/outlet security remains enforced; this is wrong-target selection within
an otherwise authorized scope.

Fix: retain all possible matches and reject ambiguous identifiers before any
save, with the exact row and an instruction to use an unambiguous product code.
Cover both product and option aliases, mixed aliases and partial recovery.

Attribution: introduced by `b0d41ab`'s alias mapping. No such collisions currently
exist in the live database. The staging reproduction deliberately seeded this
valid-but-ambiguous internal code; it did not alter live identifiers.

### 4. P2 — Out-of-range money passes validation and fails during saving

Locations: `activity-saas-backend/src/catalogue/catalogue.dto.ts:144`,
`activity-saas-frontend/src/components/product-import/productImport.ts:273`.

An adult price and MRP of `100000000000000` pass the parser and live server
preflight. The Codex browser enables Apply and states validation passed. Saving
the same input on staging returns `PARTIAL`, zero saved groups, and a raw Prisma
numeric-overflow error. PostgreSQL money columns use decimal(18,4), whose maximum
positive value is 99,999,999,999,999.9999. The affected transaction rolls back,
but a later product in a batch could fail after earlier products were saved.

Fix: share decimal precision/range rules between templates, parsers, DTO/service
validation and canonical price inputs. Compare decimal strings exactly rather
than using floating-point values near the limit. Translate unexpected storage
errors into useful vendor guidance instead of exposing database diagnostics.

Attribution: pre-existing. Confirmed on live with validation only; Apply was not
clicked. Staging version counts were unchanged after the failed save.

### 5. P2 — Free child prices are accepted by the API but blocked by upload

Location: `activity-saas-frontend/src/components/product-import/productImport.ts:273`.

The normal editor API successfully saves child `0`, and the bulk API also saves
that same value. The CSV/Excel rate parser rejects it as requiring a positive
amount, leaving no valid rows. Blank should mean retain the current value;
explicit zero should remain a valid free price where the canonical editor
permits it. This was also reproduced in the live Codex browser without saving.

Fix: align upload validation with canonical non-negative money rules and preserve
the distinction between zero and blank. Test free child/infant prices and
mixed batches in both Excel and CSV.

Attribution: pre-existing; the same `Number(value) <= 0` check predates this release.

### 6. P3 — Duplicate keys in multi-product JSON lack actionable locations

Location: `activity-saas-frontend/src/components/product-import/productImport.ts:592`.

Two JSON envelope products with the same product_key and different names show
"2 valid products" locally with no issues. Server validation correctly rejects
the batch, but the UI shows only "Each product_key must be unique within the
batch." There is no offending product location, entered key, correction text or
downloadable error row. The API's productKeys list is not mapped into UI issues.
This recreates the client's guidance complaint for JSON even though the normal
Excel duplicate case now has correct source cells and correction text.

Fix: detect normalized duplicate keys across the envelope before preview and
return structured duplicate-key issues from the API. Identify both products,
their Basic_Info product_key fields and a correction; retain error downloads.

Attribution: pre-existing. Confirmed on live with validation only, no writes.

## Verification and protected data

- Live remains `b0d41ab904c63e90ebd6b1c8fd4f2ec83fe5cdbb`; both demo hostnames
  report database and storage ready.
- Fresh targeted regression run: **79/79 backend tests** and **101/101 frontend
  tests** pass. The earlier full suites (839 backend / 338 frontend) were not
  repeated because no application code changed in this review.
- The maintained **34 PostgreSQL/NestJS acceptance checks passed again** on a new
  disposable local copy, including outlet/tenant isolation, partial recovery,
  concurrent idempotency, published-price protection and date-segment inheritance.
- A separate confirmation run contains eight checks: six reproduced findings,
  correct Excel 1904-date handling and an unchanged protected-finance comparison.
  Its failed status is intentional review evidence, not a passing release gate.
- Codex browser: existing-product Excel rejection still identifies Products!A2/A3
  and supplies corrections; normal public-code rate preflight still succeeds.
  Oversized money, zero-child rejection and JSON duplicate guidance were checked
  without clicking an import/apply button. No live draft was created or changed.
- Live read-only comparison: all **12 protected booking/finance table hashes**,
  **five existing catalogue table hashes**, **73 upload hashes** and configured
  appearance match the deployment baseline. Existing demonstration December and
  January prices remain as previously verified. There are **99 finished
  migrations and zero unfinished**.
- No live infant/youth pricing, differential visitor pricing or public/internal
  product-code collisions were found. No existing records were found damaged by
  these conditional cases.
- Final live Bulk upload tab remains open in the Codex browser. Native Excel UI,
  external delivery/payment integrations and load/capacity were not retested.

## Evidence and reproduction

Evidence: `outputs/live-bulk-recheck-20261124/`, especially:

- `confirmation/staging-verification.json` and `confirmation/extended-*.json`.
- `backend-targeted-tests.json`, `frontend-targeted-tests.json`.
- `live-readonly-verification.json` and `review-summary.json`.
- Live accessibility traces, oversized-price screenshot, and synthetic fixtures.

Review harnesses are under `activity-saas-backend/tmp/live-bulk-recheck*.cjs`,
generated from the maintained staging runner and
`tmp/bulk-recheck-extended.fragment.cjs`. They guard the disposable loopback
database, disable delivery/scheduled workers and prohibit external HTTP. Do not
point these write reproductions at live. No migration, commit or deployment is
part of this review.
