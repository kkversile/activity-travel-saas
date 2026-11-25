# Bulk upload and rate editor: five fixes — 25 November 2026

All five findings from the expanded live audit are fixed and verified on isolated local staging. **At staging sign-off, no commit, push, deployment or live database change had been made.** Any subsequent release and live verification are recorded separately.

The final checks passed: **909 backend tests, 384 frontend tests, 69 PostgreSQL/NestJS acceptance checks, both production builds and Codex browser verification**. The browser remains open on the staging Bulk upload page at http://127.0.0.1:3045.

## Resulting behavior

| Finding | Implemented fix |
| --- | --- |
| Edits during saving could lose their change tracking while success was displayed. | Price, date, option, policy and upload controls are disabled from the initial draft save through preview, apply and readback. A synchronous guard prevents duplicate saves. The wizard also disables navigation, Back/Next and repeated Save actions. Success appears after pricing completes; failed or pending saves retain the unload warning and pending edits. |
| A confirmation edit copied the first option's cancellation terms onto other options. | Confirmation mode, SLA and cancellation rules have independent change tracking. A confirmation-only or SLA-only request omits cancellation; a cancellation-only request omits confirmation controls. The server inherits each option and date segment's untouched terms. A mixed-policy notice explains shared edits. Empty, fractional, zero and excessive edited SLAs are blocked with inline guidance. |
| Clearing an existing child price left CHILD enabled without a price. | The editor explains that an existing ticket price must be retained or set to zero for free admission. The backend independently rejects PATCH removals of an existing priced or enabled traveller category, before saving. Zero prices remain supported. Rules are retained for other selling periods. |
| Invalid unselected options blocked saving valid selected options. | Only selected rows take part in option validation. Unselected rows do not display active field errors. Shared constraints still apply. |
| USD offers used rupee symbols in previews. | MRP, sell, commission, supplier net, final and seasonal previews use each offer's currency. Previews identify the currency code and pricing basis. Flat adjustments are labelled “Amount”; seasonal previews show each selected option. |

The existing layout, theme colors and style classes are preserved. There are no Prisma schema, migration, ledger, payout, settlement or accounting changes.

The safe behavior for an existing ticket type is deliberate: **blank does not remove an enabled ticket type; zero means free**. The frontend and backend both enforce this rule.

## Modified files

Backend:

- [activity-price-patch.ts](C:/wamp64/www/voya-vendor-platform/activity-saas-backend/src/catalogue/activity-price-patch.ts): rejects removal of configured traveller prices while keeping segment inheritance.
- [catalogue.service.ts](C:/wamp64/www/voya-vendor-platform/activity-saas-backend/src/catalogue/catalogue.service.ts): loads traveller rules for preview and transactional validation.
- [activity-price-patch.spec.ts](C:/wamp64/www/voya-vendor-platform/activity-saas-backend/src/catalogue/activity-price-patch.spec.ts): category-removal, zero-price and independent policy regressions.
- [verify-bulk-editor-five-cases.cjs](C:/wamp64/www/voya-vendor-platform/activity-saas-backend/scripts/verify-bulk-editor-five-cases.cjs), new: eight additional PostgreSQL/API acceptance cases and browser fixtures.
- [verify-bulk-editor-five-browser.cjs](C:/wamp64/www/voya-vendor-platform/activity-saas-backend/scripts/verify-bulk-editor-five-browser.cjs), new: read-only browser checkpoints, protected-data comparisons, exact price/policy assertions and multi-product rate fixtures.
- [verify-bulk-import-staging.cjs](C:/wamp64/www/voya-vendor-platform/activity-saas-backend/scripts/verify-bulk-import-staging.cjs): runs the new cases, supports an opt-in browser save delay and safely reopens an already verified disposable database.

Frontend:

- [ActivityPricesAvailability.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ActivityPricesAvailability.tsx): form locking, independent policy patches, scoped validation, required existing-category prices and currency formatting.
- [ExperienceWizardModal.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ExperienceWizardModal.tsx): coordinates the pricing save with navigation, notices and unload protection.
- [WizardNavigation.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/WizardNavigation.tsx): disables all step buttons while a save is pending.
- [types.ts](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/types.ts): optional pricing-busy callback shared with the wizard.
- [ActivityPricesAvailability.test.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ActivityPricesAvailability.test.tsx): delayed-save phases, retry, independent policy fields, SLA validation, child clearing/zero, unselected validation and mixed-currency previews.
- [ExperienceWizardModal.test.tsx](C:/wamp64/www/voya-vendor-platform/activity-saas-frontend/src/components/product-wizard/ExperienceWizardModal.test.tsx): navigation, success timing and unload protection for successful and interrupted pricing saves.

This report is also new. The two previously modified multi-outlet evidence files were preserved with unchanged hashes and are unrelated to this work.

## Automated verification

| Check | Final result |
| --- | --- |
| Backend Jest | **909 passed**, 127 suites |
| Frontend Vitest | **384 passed**, 53 files |
| New unit regressions | **20**: six backend, fourteen frontend |
| Guarded PostgreSQL/NestJS rehearsal | **69 passed**, including eight new cases |
| Backend production build | Passed |
| Frontend TypeScript and production build | Passed |
| Operations unittest discovery | **15 passed** |
| Demo-build configuration tests | **2 passed** |
| JavaScript entry budget | Passed; 264,600 bytes, approximately 80.76 KB gzip |
| Staging migrations | **99**, schema up to date |
| Final browser/database comparison | Passed |
| `git diff --check` | Passed |

The new backend acceptance cases verify confirmation-only, SLA-only and cancellation-only changes across different options/periods; atomic rejection of a child-price removal in a multi-option request; a zero child price without missing-price readiness/calculation errors; cross-tenant PATCH rejection; USD preservation and whole-batch INR/USD rejection; unchanged approved versions and financial records.

The broader rehearsal also covers JSON/CSV/Excel parsing and creation, duplicate prevention, partial failure/recovery, exact decimals, MRP, all pricing bases and booking modes, overlapping date periods, aliases, outlet/tenant access, concurrent idempotent retries and published-product draft isolation.

The first rehearsal exposed a test-helper lookup that assumed the API version included `ratePlanId`; it was corrected to use the returned plan ID. The complete rehearsal then passed on a new copy. Production TypeScript checks also caught unsupported `exact` options in the new Testing Library assertions; those were corrected before the final build and test run. No unresolved failures remain in the executed checks.

## Codex browser verification

Used the existing Harbour Trails owner account, Fort Kochi outlet, **http://127.0.0.1:3045**, with the local API at **http://127.0.0.1:4053/api**.

Browser-created products have prefix `BROWSER-FIVE-A6D8D7`. All six remain unpublished DRAFTs:

1. INR JSON product.
2. USD JSON product.
3. Sectioned CSV product.
4. Two-product XLSX import, both records retained.
5. Legacy BIFF8 XLS with the 1904 date system and mixed-case `hOuR`, retained as December 2026–March 2027 and Hours.

The advanced pricing fixture is `EDITOR-FIVE-A6D8D7`, product ID `29a76b07-2baf-4ff6-83fc-99438991e5ff`, internal code `PRD-AADA999669`. Its initial advanced terms were prepared through normal authenticated staging APIs.

Verified in the browser:

- Duplicate creation was blocked with its original JSON key, correction guidance and downloaded error rows.
- Empty files cleared parsed/validated state after both rejected and successfully validated uploads.
- Mixed valid/missing-product and wrong-outlet rate batches were blocked as a whole, with source cells and correction guidance. Overflow identified CSV E2 and the supported limit.
- A mixed INR/USD batch was blocked at CSV A3 and directed the vendor to the advanced editor for USD.
- CSV updated two options of the primary product; XLSX with 1904 dates updated child pricing to zero with adult blank. Different January prices were preserved.
- Separate two-product CSV adult updates and two-product XLSX zero-child updates saved both products. January prices remained unchanged.
- USD previews displayed dollars and USD, and a saved adult edit retained USD.
- With an actual **2.5-second staging apply delay**, price controls and wizard navigation stayed disabled. A read-only probe measured 2,576 ms; the browser save took 2,925 ms including the surrounding requests. Successive readbacks returned **1951**, then **1952**.
- Clearing the January child price showed actionable guidance and did not change the saved child amount. An invalid unselected private option did not block saving the selected adult price at **1953**; its excluded field error was suppressed.
- Changing only confirmation to On request/SLA 60, then only SLA to 90, preserved the person option's period-specific cancellation and the private option's 100% charge.
- Clearing the edited SLA was blocked; correcting it to 90 saved successfully.
- Reload retained the prices. The configured Warm theme and editor layout remained intact.
- Downloaded product templates retained **20 dropdown rules**. Product and rate templates each retained **five monetary stop rules**, including zero, the amount limit and four-decimal validation.

Primary final readback:

| Selling period | Adult | Child | Infant | Youth | Group category | Person cancellation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| December | 1920 | 0 | 0 | 1200.1234 | 2000 | 0% charge from seven days before |
| January–February | 1953 | 950 | 100 | 1300.1234 | 2100 | 25% charge from three days before |

Senior stays 1400. All six traveller and visitor categories remain present. The private GROUP option remains **7300**, with a **100% cancellation charge**, weekends, Asia/Dubai, slot 06:00 and its February premium. January–February confirmation is On request with SLA 90; untouched earlier terms remain separate.

## Isolation and evidence

Final database: **`voya_import_fixes_2026112509`**, PostgreSQL on **127.0.0.1:55445**. It was cloned from the already-local `voya_readiness_recovery_review_20261119192801` snapshot dated **19 November**. It is not a fresh production restore. Advanced fixtures reproduce the live audit's relevant policies, currencies and price periods.

External HTTP delivery, SMTP and scheduled workers were disabled. The harness accepts only the guarded local staging database pattern. Reuse mode requires an existing passing verification result for that exact database. The artificial save delay is confined to this staging harness.

The final read-only comparison confirmed:

- All **12 protected financial tables**, including existing booking/ledger/settlement records: unchanged.
- All **12 pre-existing catalogue/pricing/inventory tables** outside the new browser/audit fixture prefixes: unchanged.
- The primary fixture's ACTIVE commercial versions: unchanged throughout browser edits.
- Both unrelated working-tree evidence files: unchanged hashes.

Evidence directory: [bulk-editor-five-fixes-20261125](C:/wamp64/www/voya-vendor-platform/outputs/bulk-editor-five-fixes-20261125).

Key records:

- `FINAL_VERIFICATION.json`: final consolidated receipt.
- `staging/staging-verification.json`: all 69 database/API checks.
- `staging/five-browser-verification.json`: exact saved values and protected-data comparison.
- `staging/five-browser-first-price-save.json` and `five-browser-second-price-save.json`: independent 1951/1952 readbacks.
- `staging/five-browser-before-rate-apply.json` and `five-browser-after-rate-uploads.json`: preview non-persistence and successful rate uploads.
- `staging/delayed-save-probe.json`, `delayed-save-browser-check.json`: real save-delay and control-locking evidence.
- `staging/template-verification.json`, downloaded workbooks/errors, browser states and screenshots.
- Complete test/build logs: `outputs/bulk-editor-five-*.log`.

## Manual test steps

1. Open [local staging](http://127.0.0.1:3045), sign in with the existing Harbour Trails owner account and choose Fort Kochi. The final verification tab is already open.
2. Open Products and search `PRD-AADA999669`. Open Rates. January adult/child should show 1953/950 and the private group 7300.
3. Edit the adult amount and save. Controls and step navigation should stay disabled during the staging delay. After completion, make a second edit, save and reload; the second value should persist.
4. Clear the child price: saving should explain that it needs a price or zero. Restore the value. Clear the private price and unselect that option; a selected valid person update should save without an error for the unselected row.
5. Open Policies. Change only the SLA, then save. Cancellation should retain its distinct saved terms. A blank, zero, fractional or out-of-range SLA should show guidance. Read-only checkpoints below can inspect each option's stored rules.
6. On Bulk upload, use the fixture files in the evidence directory. The existing product files now correctly exercise duplicate rejection. For another successful create, use a fresh fixture set from a new disposable rehearsal, or consistently change the product keys and related references. Rate files target the existing staging drafts and can be validated without saving.
7. Inspect the USD demonstration product's Rates preview and the downloaded Excel dropdown/amount rules.

Read-only checkpoint command, from the backend directory:

```powershell
$env:BULK_IMPORT_STAGING_DATABASE_URL='postgresql://voya_staging@127.0.0.1:55445/voya_import_fixes_2026112509?schema=public'
$env:BULK_IMPORT_EVIDENCE_DIR='C:/wamp64/www/voya-vendor-platform/outputs/bulk-editor-five-fixes-20261125/staging'
node scripts/verify-bulk-editor-five-browser.cjs --checkpoint manual-review
```

The final strict verifier checks the exact sign-off values; deliberate manual edits will change those expected values. Use a checkpoint for exploratory testing.

## Remaining limits

No migration or backfill is required. These changes prevent the reproduced failures; they do not automatically repair older drafts that were previously altered. The staging snapshot predates recent live data, so an approved deployment still requires a fresh backup and live smoke verification. These results describe staging sign-off before release; subsequent publication and live verification are recorded separately.
