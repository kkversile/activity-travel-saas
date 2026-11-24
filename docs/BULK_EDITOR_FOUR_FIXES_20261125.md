# Bulk upload and activity editor: four fixes — 25 November 2026

All four findings from the live audit are fixed and verified on isolated staging. At this staging sign-off, no commit, push, deployment or live database change had been made. Any subsequent release and live verification are recorded separately.

## Resulting behavior

| Finding | Fix |
| --- | --- |
| A multi-option save copied the first option's days, timezone, slots and seasonal adjustments onto other options. | Existing rates use explicit field patches. Untouched rules inherit from each option and date segment. Shared control edits intentionally apply to selected options; the UI explains mixed settings. |
| An earlier-period edit copied hidden traveller/visitor prices from the latest period. | The API resolves each affected interval independently and merges changed categories only. Hidden categories, untouched prices and outside dates retain their own values. Selecting an earlier start date reloads that period's visible prices without discarding edits. |
| GROUP, PER_BOOKING and PER_UNIT previews said “per traveller”. | Previews now show per traveller, per booking, per resource / vehicle or per group, according to the basis. |
| Zero prices appeared missing. | Zero displays as ₹0.00 in the breakdown and final preview. Blank values retain the missing-price prompt. Zero commission/settlement amounts display correctly when the commission is configured. |

The field-patch API validates complete inherited values in preview and again inside the apply transaction. MRP limits, visitor requirements, booking rules, expected versions, idempotency, tenant/outlet checks and approval boundaries remain enforced. Product locking serializes patch/bulk saves before replay/version checks. Existing full-save API callers retain their contract.

Untouched legacy Indian visitor prices are preserved even when they differ from ordinary prices. Editing an ordinary category updates its corresponding Indian visitor price; a foreign-only edit uses the ordinary value from that particular segment.

## Modified and added files

Backend:

- `activity-saas-backend/src/catalogue/catalogue.dto.ts`: optional PATCH mode and explicit category removals, with validation.
- `activity-saas-backend/src/catalogue/activity-price-patch.ts` (new): segment-aware inheritance and category merging.
- `activity-saas-backend/src/catalogue/catalogue.service.ts`: resolved preview/apply validation, shared-rule preservation, canonical traveller-rule preservation, transaction locking and segmented draft writes.
- `activity-saas-backend/src/catalogue/activity-price-patch.spec.ts` (new): date boundaries, hidden prices, visitor amounts, currencies, explicit overrides, zero and DTO compatibility regressions.
- `activity-saas-backend/src/catalogue/activity-prices-availability.spec.ts`: inherited-MRP validation and incomplete-patch rejection.
- `activity-saas-backend/scripts/verify-bulk-import-staging.cjs`: includes the new acceptance cases.
- `activity-saas-backend/scripts/verify-bulk-editor-four-cases.cjs` (new): real PostgreSQL/API checks and browser fixtures, guarded to disposable loopback databases.
- `activity-saas-backend/scripts/verify-bulk-editor-four-browser.cjs` (new): read-only verification of browser results and protected-data hashes.

Frontend:

- `activity-saas-frontend/src/components/product-wizard/ActivityPricesAvailability.tsx`: edited-field tracking, earlier-period values, mixed-setting guidance and corrected previews. Existing theme/style classes are retained.
- `activity-saas-frontend/src/components/product-wizard/ActivityPricesAvailability.test.tsx`: patch-request regressions and positive/zero/blank display coverage across all four bases. Earlier full-snapshot assertions were updated to assert the new preservation contract; database tests verify the retained values.

No Prisma schema, migration, dependency, ledger, settlement or payout implementation changes were needed. Existing unrelated multi-outlet evidence files remain outside this change.

## Automated verification

| Check | Final result |
| --- | --- |
| Backend Jest | **903 passed**, 127 suites, no failures/skips |
| Frontend Vitest | **370 passed**, 53 files, no failures/skips |
| Backend operations tests | **2 passed** |
| Frontend demo-build configuration tests | **2 passed** |
| Backend production build | Passed |
| Frontend production build | Passed |
| JavaScript entry budget | Passed; 264,600 bytes / 80,755 gzip bytes |
| Guarded PostgreSQL/NestJS acceptance | **61 passed**, no findings |
| Staging migration status | 99 migrations; schema up to date |
| Post-browser database and template checks | Passed |
| `git diff --check` | Passed |

The PostgreSQL cases include all pricing bases and booking modes, date-spanning bulk changes, public/internal aliases, exact decimals and overflow, free child prices, duplicates, outlet and tenant isolation, concurrent bulk retry, partial-failure recovery, stale editor patches, idempotency, explicit clearing of rules, inherited MRP rollback, legacy visitor prices and zero group prices.

Final evidence is under `outputs/bulk-editor-four-fixes-20261125/`:

- `staging-final/staging-verification.json`: 61 acceptance checks.
- `staging-final/four-browser-verification.json`: actual saved browser values, imports and hash comparison.
- `staging-final/template-verification.json`: downloaded workbook rules.
- `migration-status-final.log`, `bundle-budget.log` and browser states/screenshots.
- Full unit/build logs are named `outputs/bulk-editor-four-fixes-20261125-*.log`.

## Codex browser verification

Verified using the Harbour Trails owner account and Fort Kochi outlet at **http://127.0.0.1:3044**. Its API is **http://127.0.0.1:4052/api**. The final verification tab remains open.

The final browser run covered:

1. JSON and sectioned CSV product creation, a two-product XLSX batch, and BIFF8 XLS creation: five drafts, each with two options, two rate plans, two schedules and 28 future sessions.
2. XLS 1904-system dates retained December 2026–March 2027 dates. Mixed-case `hOuR` normalized to Hours.
3. Duplicate create rejection with original key, correction guidance and downloadable error rows.
4. Empty replacement cleared the prior preview, success and errors.
5. A mixed valid/wrong-outlet rate file was blocked at CSV A4, with an authorized-outlet correction and error download.
6. An impossible calendar date identified C2 without blaming the valid end date.
7. A mixed traveller/GROUP CSV rate upload saved one product draft; an XLSX 1904-date rate upload saved zero child pricing with adult blank.
8. Two ordinary multi-option editor saves retained distinct rules and hidden categories.
9. An adult-only 10–20 December edit and a 15 December–15 January edit retained different December/January child, infant, youth, group and visitor prices. Prices outside the edited ranges remained correct.
10. The GROUP preview showed ₹0.00 per group, zero saved successfully, then its positive price was restored. Reload showed the persisted adult and group prices.
11. Product/rate template downloads retained 20 product dropdown rules and five monetary stop rules per template, including zero, maximum amount and four-decimal restrictions.
12. Desktop and responsive navigation worked during verification. No approval, publication, booking, fulfilment or payout actions were performed.

The final fixture prefixes are `BROWSER-EDITOR-7722E4` and `EDITOR-FOUR-7722E4`. The primary editor draft is `3359978d-02be-4205-94f4-23b172dd01ca`. Its expected person prices include:

| Service date | Adult | Child | Infant | Youth | Group category |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5 December | 1850.4321 | 0 | 0 | 1200.1234 | 2000 |
| 12 December | 1950 | 0 | 0 | 1200.1234 | 2000 |
| 17 December | 2000 | 0 | 0 | 1200.1234 | 2000 |
| 10 January | 2000 | 950 | 100 | 1300.1234 | 2100 |
| 20 January / 5 February | 2050 | 950 | 100 | 1300.1234 | 2100 |

The private GROUP option remains 7300, weekends only, Asia/Dubai, slot 06:00, with its February premium intact at all six verification dates.

During the final rerun, two files were initially selected from the earlier local evidence folder. Those two disposable local drafts were removed with strict ID/status/booking guards; the correct fixtures were then imported. `fixture-correction.json` records that correction. The final hash comparison passed against the original baseline, and the final browser evidence uses the correct prefixes above.

## Isolation and remaining limits

The final database is `voya_import_fixes_2026112507`, on loopback PostgreSQL port 55445. It was cloned from the already-local `voya_readiness_recovery_review_20261119192801` snapshot, dated 19 November. New demonstration fixtures recreate the live audit's distinct option rules and price periods. It is not a fresh production snapshot.

External HTTP delivery, SMTP and scheduled workers were disabled. No live server or live database was accessed by this implementation task. The final read-only comparison confirms all 12 protected financial tables, all 12 pre-existing catalogue/pricing/inventory tables outside the new fixture scope, and the primary fixture's approved commercial versions remained unchanged.

These fixes prevent the reproduced overwrites; they do not repair any previously altered historical draft automatically. No schema migration or backfill is required. The frontend and backend must ship together because existing-rate saves use the new PATCH contract. Live smoke verification is required after deployment.

## Manual staging checks

1. Open http://127.0.0.1:3044 and use the existing Harbour Trails owner login. Select Fort Kochi.
2. Open Bulk upload and inspect the downloaded templates, then use the files in `outputs/bulk-editor-four-fixes-20261125/staging-final/`. Already-imported product files should now show duplicate guidance; use new product codes for another create test.
3. Open the primary editor draft's Rates section. Both options should show the mixed-rule notice. Edit one adult value and save with both selected; verify the private option's weekend/slot/seasonal settings remain intact.
4. Select a December range and edit only the adult value. Use preview and saved date segments to confirm December/January hidden prices remain distinct.
5. Enter zero for the group price: preview should read ₹0.00 per group. Restore the prior positive amount after the check. All changes stay as staging drafts.

The maintained staging runner produces fresh fixtures when run against a new guarded disposable `voya_import_fixes_<digits>` database. The browser verifier supports `--baseline` before UI mutations and a read-only comparison afterwards; the expected values correspond to the browser sequence documented above.
