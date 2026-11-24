# Bulk upload: six fixes and staging verification — 25 November 2026

**All six findings in `BULK_LIVE_RECHECK_20261124.md` are fixed and verified
locally/on isolated staging.** This report records the completed staging phase
on a working tree based on `b0d41ab904c63e90ebd6b1c8fd4f2ec83fe5cdbb`. No live
changes were made during that phase. The subsequent live release was authorized
on 25 November; its backup and deployment evidence are recorded separately.

## Resulting behavior

| Finding | Implementation |
| --- | --- |
| Infant/youth prices disappeared | Rate patches start from all existing traveller types, including INFANT, YOUTH and GROUP. Only entered columns replace values, separately for every effective-date segment. Zero amounts are retained. |
| Indian visitor prices stayed stale | An entered per-person amount also updates its corresponding Indian visitor amount. Foreign prices, unedited categories, eligibility and verification settings remain intact. Actual quote calculations and catalogue approval were verified. |
| Ambiguous aliases selected the wrong product | Product and option indexes detect multiple actual entities for a normalized public/internal code. The API rejects ambiguous rows before saving any product group or replaying a cached result. Tenant/outlet authorization remains enforced. Unambiguous public/internal aliases still work together. |
| Oversized prices passed validation | Shared exact decimal-string rules enforce decimal(18,4): 0–99,999,999,999,999.9999, at most four decimals. Product/rate parsers, DTOs and canonical editor validation use those rules. Actual downloaded workbooks include money stop rules and instructions. Unexpected storage failures receive vendor retry guidance rather than raw database diagnostics. |
| Free child prices were blocked | CSV and Excel accept explicit zero. Blank still means preserve the existing price. Both paths were saved and checked against PostgreSQL. |
| JSON duplicate keys lacked locations | Normalized duplicate keys identify both original `products[n].Basic_Info[0].product_key` paths, values and corrections. Backend errors include both product indices and field details. The UI and downloaded error CSV retain those locations. |

Existing design/colors are preserved. Financial ledger, booking, settlement,
payout, reconciliation and accounting implementations were not changed. There
are no Prisma schema changes, migrations, backfills or new dependencies.

## Final verification

| Check | Result |
| --- | --- |
| Backend build | Passed |
| Full backend suite | **881/881 tests**, 126 suites, no failures/skips |
| Frontend production build | Passed |
| Full frontend suite | **353/353 tests**, no failures/skips |
| Demo build configuration | **2/2** |
| JavaScript entry budget | Passed; 264,600 bytes / 80,758 gzip; import screens remain deferred |
| Prisma schema validation | Passed |
| Real PostgreSQL/NestJS acceptance | **44/44 checks** on `voya_import_fixes_2026112502` |
| Codex in-app browser | Positive imports/rate saves, negative validation, downloads and visual error guidance verified |
| Post-browser database verification | Passed; exact prices, dates, categories, visitor settings and draft status confirmed |
| Approved prices | Identical before/after browser draft edits |
| Protected financial/booking data | All 12 table counts/hashes unchanged through the API and browser runs |

The 44 API/database checks include the original 34 acceptance scenarios and ten
new checks. They exercise tenant/outlet denial, all four pricing bases and three
booking modes, partial recovery, concurrent/idempotent retries, published-price
protection, every overflowing monetary field, exact decimal boundaries,
normalized aliases and JSON duplicate errors. The new pricing cases also pass
the normal vendor submission/admin publication path and then verify calculator
results for the approved versions.

Approval fixtures have a validated existing image asset, a complete option,
short future inventory and matching starting advanced-category/visitor prices.
Only newly created disposable fixtures receive this setup. Normal submission
and approval gates remain intact. Initial fixture/build-check failures were
corrected; the final runs above have no outstanding failures.

## Codex browser results

The browser used only `http://127.0.0.1:3041` with the isolated API on port 4049.
The final verification tab remains open on Bulk upload with Fort Kochi selected.

- Created four labelled demonstration drafts: one JSON product, one sectioned
  CSV product and two products in one Excel batch. Successful imports open the
  correct draft editor and retain the selected outlet.
- Uploaded CSV rate changes for two product groups using internal and displayed
  public product codes. The displayed code `TA-KL-0046` updated the intended new
  CSV draft.
- Applied a subsequent child-only Excel update: December adult **INR 1,930**,
  child **INR 0**, senior INR 1,400 and MRP INR 2,200. January adult INR 1,800 and
  child INR 900 remain unchanged.
- Applied a combined rate file to the advanced fixtures. Additional traveller
  prices remain INFANT 0, YOUTH 1,200 and GROUP 2,000 while adult becomes 2,000.
  The visitor fixture has ordinary/Indian adult 2,100 and foreign adult 2,600;
  child Indian 0 / foreign 1,500 and verification settings are retained.
- Confirmed all browser changes to published fixtures remain drafts; their
  approved active commercial versions are byte-equivalent to the baseline.
- Oversized amounts are blocked locally at CSV!E2 and CSV!I2 with entered values
  and the supported maximum. Apply/Validate stay disabled for that invalid file.
- Ambiguous product and option identifiers receive separate API errors at
  CSV!A2 and CSV!B3. No rates are saved.
- Duplicate JSON keys show both original paths and correction guidance before
  contacting the server; downloaded error rows contain both locations.
- Re-uploading the saved Excel batch is blocked with Products!A2/A3 corrections;
  no extra drafts are created.
- Downloaded the actual product and rate workbooks. The product workbook has
  20 dropdowns and 42 total validation rules, including five bounded amount
  rules. The rate workbook has five bounded amount rules. Zero, four-decimal
  scale and the storage limit are covered by the formulas and parser checks.

## Files changed

Backend:

- `src/catalogue/bulk-rate-update.ts` and `bulk-rate-update.spec.ts`.
- `src/catalogue/catalogue.service.ts`, `catalogue.dto.ts`,
  `catalogue.import-batch.spec.ts`, `activity-prices-availability.spec.ts`.
- `src/common/product-import-contract.ts` and its spec.
- `scripts/verify-bulk-import-staging.cjs`.
- New `scripts/verify-bulk-import-six-cases.cjs` and
  `scripts/verify-bulk-six-browser.cjs`.

Frontend:

- `src/components/product-import/productImport.ts`, `ProductImportModal.tsx`,
  `productImportTemplate.ts`.
- `ProductImportModal.test.tsx`, `productImportReleaseRegression.test.ts`,
  `productImportSanity.test.ts` and new `productImportSixFixes.test.ts`.

Documentation: this report and the resolution note on the original six-finding
review. Unrelated multi-outlet evidence, backups and recordings remain intact.
When committing later, include the new script and test files as well as tracked
edits. The staging phase concluded before any commit or deployment.

## Reproduction and evidence

From the backend, use `npm run verify:bulk-import:staging` with
`BULK_IMPORT_STAGING_DATABASE_URL` pointing to a fresh disposable
`voya_import_fixes_<digits>` copy on `127.0.0.1:55445`, user `voya_staging`.
The runner refuses other targets. Optional `BULK_IMPORT_STAGING_PORT` and
`BULK_IMPORT_STAGING_UI_ORIGIN` select loopback API/UI ports; `--serve` keeps the
passing isolated API available. Delivery, scheduled workers and AI are disabled;
the runner blocks external HTTP requests.

Evidence is under `outputs/bulk-six-fixes-20261125/`:

- `backend-tests.json`, `frontend-tests.json`, build/budget/config/schema logs.
- `staging/staging-verification.json`: 44 acceptance checks.
- `staging/six-browser-before.json` and `six-browser-verification.json`:
  approved-version and protected-finance comparisons plus exact saved prices.
- `staging/browser-six-template-verification.json`, downloaded Excel templates,
  downloaded duplicate-error CSV, browser traces and screenshots.
- `verification-summary.json`: consolidated final results.

`verify-bulk-six-browser.cjs --baseline` records the pre-browser state using a
read-only transaction. Without `--baseline`, it checks the resulting browser
fixtures, draft/approved prices, financial hashes and downloaded corrections.
Set `BULK_IMPORT_EVIDENCE_DIR` to the evidence directory when running it.

## Live verification follow-up — 25 November 2026

The first live draft check exposed a pre-existing commercial-version edge case:
editing the exact original imported date range reused its older draft version
number. A later bulk rate save could therefore read the newer active version and
miss the draft's additional traveller or visitor prices. Reused draft edits now
advance the version number, including for optimistic concurrency checks.

The PostgreSQL/HTTP regression creates an imported product, edits the same date
range through the normal prices API, rejects the stale expected version, then
applies an adult/child bulk update and checks all other traveller and visitor
prices plus approved-version immutability. The follow-up passed 881 backend
tests, 353 frontend tests and 45 isolated staging checks. Evidence is under
`outputs/bulk-six-live-deploy-20261125/` (`followup-*`). No schema migration is
required. Live verification uses clearly labelled, unpublished demonstration
drafts and compares existing catalogue, upload and protected financial data with
the pre-deployment baseline.

## Verification limits

Staging was cloned from the previously restored snapshot, not freshly copied
from today's live database. Native Microsoft Excel's interactive dropdown/formula
UI was not opened; actual downloaded OOXML and parser round-trips were checked.
External SMTP, OpenAI, OTP delivery and real payment processing were disabled and
are outside this verification. No real payments, settlements or payout approvals
were performed. Those limits do not affect the six reproduced import defects
covered here. Live deployment and its verification are a separate release phase.
