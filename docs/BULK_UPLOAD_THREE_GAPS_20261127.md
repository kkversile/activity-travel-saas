# Bulk upload and rate update: three remaining gaps

Verified on 27 November 2026 (Asia/Calcutta). Base revision: `432fb161323a36bbb6b8f4cae36aaae6e298de90`. Changes remain local and uncommitted. No push, deployment, production migration or live data repair was performed.

## Result

1. **Imported products with multiple rate plans can be edited.** Rates now has an Individual rate plans selector with offer name, code, currency and effective selling period. It shows saved values and supports an explicit, optimistic-lock-protected PATCH of the selected offer. The backend validates ownership, variant, active status and contract/channel protection. Invalid selections never fall back to another offer. Protected offers remain read only. The ordinary editor excludes options that require individual selection instead of presenting blank editable rows.
2. **Historical default-currency metadata has a safe repair path.** New imports already inferred their currency correctly. A separate, reviewed, idempotent repair script now handles confirmed older records whose product currency incorrectly stayed INR. Five confirmed demonstration records were repaired only on a restored staging copy, including TA-KL-0061. The script changes Product.currency and its audit record, preserving rates, bookings and finance. No schema migration is required.
3. **Minute cutoffs have readable summaries.** Options now displays `1 minute`, `30 minutes`, or `1 hour 30 minutes` instead of fractional-hour decimals. Storage and the existing hours input are unchanged. A one-minute cutoff survived price-only editing, option editing and refresh.

Existing theme variables, CSS and reusable form classes are retained. Individual-plan price edits preserve cancellation rules, currency, booking limits, other offers, original ACTIVE commercial versions and confirmed booking economics. Ordinary saves also omit an untouched global visitor-pricing flag, so a sibling offer's foreign prices are preserved. Selected-plan version snapshots are retained until an explicit reload or save; another editor's refresh cannot silently bypass optimistic locking.

## Verification

| Check | Result |
| --- | --- |
| Backend Jest | 958 passed, 130 test files |
| Frontend Vitest | 447 passed, 56 test files |
| Backend NestJS build | Passed |
| Frontend TypeScript/Vite build | Passed |
| PostgreSQL/API staging checks | 104 passed |
| Codex in-app browser checks | 54 passed |
| Final API readback groups | 8 passed |
| Operations/bootstrap checks | 2 passed |
| Demo-build checks | 2 passed |
| Frontend entry budget | Passed |
| Diff whitespace check | Passed |

Added 39 unit regressions (18 backend, 21 frontend) and 9 staging acceptance checks. The browser walkthrough used the running frontend and backend against PostgreSQL, with actual uploads and draft saves rather than mocked browser responses.

Browser coverage includes JSON, CSV, modern Excel and legacy Excel product imports; mixed currencies; both downloaded templates and error-row download; duplicate products and keys; missing mixed-currency default; wrong import mode; invalid columns, dates, amounts and missing products; empty-file preview reset; outlet isolation; multi-product traveller/group rate batches; zero child rates; four decimal places; 1904 Excel dates; targeted USD editing and reload; protected-offer controls; cutoff round-trips; selected paste; partial MRP changes; and group/traveller basis transitions. Date readbacks covered changed windows and untouched gaps before/after them. USD, INR and CAD were checked, including refresh.

The seven browser-created products remain DRAFT (TA-KL-0104 through TA-KL-0110, cohort CE66381E). Every original ACTIVE commercial version and its price rows remained identical. Rejected browser batches left pricing unchanged. Across the browser work, hashes and counts matched for 12 existing catalogue tables and 12 finance tables. Original cancellation rules and traveller rules remained unchanged; the standard editor can add a missing eligibility rule for an already priced ticket category, as in the existing save logic.

The restored archive came from the existing authorized backup `import-three-gaps-20261126T175756Z/database.dump`, SHA256 `b01c5e0f9a4fcefee427f13855bb8a2173d5fbf9f1b016ceee60b725f82f52ba`. Only the backup file was downloaded; no live database connection was used. PostgreSQL 16 decoded the archive into an isolated local PostgreSQL 15 database, `voya_import_fixes_2026112701` on loopback port 55445. The repair rehearsal preserved 23 non-product finance/catalogue tables, created five audit events, and reran with zero additional changes. Its final dry run found zero remaining candidates.

Evidence is in `outputs/remaining-three-gaps-fixes-20261127/`: test/build logs, staging/staging-verification.json, browser-checks.json, invalid-batch-atomicity.json, final-browser-data-verification.json, repair manifests/results, database hashes, API readbacks and screenshots. FINAL_VERIFICATION.json records the tested source hashes. These are internal engineering evidence, not a client export of the restored database.

## Files changed

- `activity-saas-backend/src/catalogue/catalogue.dto.ts`: optional explicit rate-plan id.
- `activity-saas-backend/src/catalogue/catalogue.service.ts`: exact offer selection, protection and preservation.
- `activity-saas-backend/src/catalogue/catalogue.explicit-plan.spec.ts`: targeting/security regressions.
- `activity-saas-backend/src/catalogue/import-currency-repair.spec.ts`: repair eligibility/review/staleness regressions.
- `activity-saas-backend/scripts/repair-import-currency.cjs`: reviewed metadata repair CLI.
- `activity-saas-backend/scripts/verify-remaining-three-gaps-staging.cjs`: nine PostgreSQL/API checks.
- `activity-saas-backend/scripts/verify-bulk-import-staging.cjs`: runs the additional checks using its validated database target.
- `activity-saas-frontend/src/components/product-wizard/RatePlanEditor.tsx`: individual offer editor.
- `activity-saas-frontend/src/components/product-wizard/RatePlanEditor.test.tsx`: editor/period/concurrency regressions.
- `activity-saas-frontend/src/components/product-wizard/ActivityPricesAvailability.tsx`: integration and safe standard saves.
- `activity-saas-frontend/src/components/product-wizard/ActivityPricesAvailability.test.tsx`: individual/standard editor integration and visitor preservation.
- `activity-saas-frontend/src/components/product-wizard/bookingDefaults.ts`: cutoff summary formatter.
- `activity-saas-frontend/src/components/product-wizard/bookingDefaults.test.ts`: formatter regressions.
- `activity-saas-frontend/src/components/product-wizard/OptionsStep.tsx`: human-readable cutoff summary.
- This report/runbook.

Unrelated pre-existing evidence changes and untracked artifacts were left intact. No financial formula, payout approval, reconciliation or ledger code was changed.

## Staging demonstration

The staging API remains available at `http://127.0.0.1:4072/api`; the Codex browser verification tab remains open at `http://127.0.0.1:3072/vendor/products`. Workers and external delivery are disabled.

1. Sign in using the existing Harbour Trails owner demo account. Choose Fort Kochi and search for `CE66381E`.
2. Open **Demonstration individual plans CE66381E**, then **5. Rates**. In **Individual rate plans**, select JANUARY-USD and its January selling period. Adult is 1900.1234, child is 0, and currency is USD. Select the INR offer to see its unchanged values. A protected-plan demonstration is separately available as TA-KL-0102.
3. Open **Demonstration bulk review USD CE66381E**, then **4. Options & tickets**. The shared option reads `Booking: 2–12 travellers · cutoff 1 minute`. Rates retains USD and adult 1811 after reload.
4. Open **Bulk upload**. Use product or rate files from the evidence directory. Existing cohort product files will correctly produce duplicate guidance; use new unique product keys for a new import. Rate files reference the existing public product and option codes.
5. Select **Update rates on existing products** for rate files. Validate, review the server preview, then apply. A preview alone does not save. Invalid batches remain blocked. Changing outlet demonstrates server-enforced isolation.
6. For INR and CSV cohort products, inspect December 1, January 5, January 20 and February 15 in Rates. January 20 has the Excel-specific four-decimal adult rate and free child admission; January 5 and February 15 retain original prices. Dates are inspected without saving another patch.

Full backend/frontend suites can be repeated with `npm test -- --runInBand` in the backend and `npm test` in the frontend. Run `npm run build` in both. The staging harness is `node scripts/verify-bulk-import-staging.cjs --serve` in the backend, with BULK_IMPORT_STAGING_DATABASE_URL, BULK_IMPORT_EVIDENCE_DIR, BULK_IMPORT_STAGING_PORT and BULK_IMPORT_STAGING_UI_ORIGIN pointing to a **fresh restored disposable loopback copy**. Its historical-repair scenario expects the original unrepaired backup. Do not rerun it against the already-repaired demonstration database; `--serve-existing` can reopen a previously verified copy without repeating destructive fixture preparation.

## Historical repair runbook

Do not run this on live without separate deployment/data-change approval. A live repair requires a fresh backup and a new manifest generated from the actual target; staging approvals cannot be reused.

From `activity-saas-backend`, an example for the current disposable copy is:

```powershell
$repairUrl = 'postgresql://voya_staging@127.0.0.1:55445/voya_import_fixes_2026112701?schema=public'
node scripts/repair-import-currency.cjs --database-url $repairUrl --plan currency-review.json
```

The plan operation is read only and refuses to overwrite an existing output file. It never reads DATABASE_URL from the environment. Candidates default to approved:false. Review original import intent and all offer currencies. For each confirmed default bug, set approved:true, reviewDecision:`CONFIRMED_IMPORT_DEFAULT_BUG`, a meaningful reviewNote, and a named reviewedBy on the manifest. Leave legitimate explicit INR defaults unapproved. Mixed/protected/manual/deleted records are excluded.

```powershell
node scripts/repair-import-currency.cjs --database-url $repairUrl --apply currency-reviewed.json
```

Apply binds the exact host/port/database, locks products, checks the snapshot digest and prevalidates the selected set in a serializable transaction before any write. Stale inputs require a newly generated/reviewed manifest. Each update produces PRODUCT_IMPORT_CURRENCY_REPAIRED audit evidence. Repeating an already applied matching manifest changes nothing. The CLI defaults to disposable local databases only. A separately authorized remote operation additionally requires `--allow-remote-apply`; that flag itself is not approval.

## Remaining limits

No failures remain in the requested staging checks. Historical currency metadata cannot be safely inferred for every old record without human review, so repair stays an explicit operation. Client production data and external delivery were not exercised. The staging copy predates this verification, so a future release must use a fresh backup and target-specific readback checks. No deployment readiness statement here authorizes deployment or a live data change.
