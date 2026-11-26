# Product-list currency fix — 26 November 2026

Implemented locally; **not committed, pushed or deployed**. No live database or live API access was performed for this change.

The product-list API previously returned `startingPrice` without its currency. The React table formatted that value with the shared money formatter's INR default, so a USD product showed a rupee symbol even though its stored rates and Rates previews used USD.

The listing now returns `startingPriceCurrency` together with the amount. Both come from the same selected commercial version and displayed revision. It also returns `startingPrices`, containing the minimum for each currency. Multiple currencies are displayed separately, such as `₹900.00 / $90.25`; their numeric amounts are not compared or converted. For mixed currencies, the old scalar amount and its currency are null. Missing prices remain a dash and explicit zero remains a price. Legacy responses without the new fields keep the existing INR fallback. The layout, CSS, theme, price selection by commercial version, and financial calculations are unchanged.

## Source and regression coverage

- `activity-saas-backend/src/catalogue/catalogue.service.ts`: select the plan currency for legacy fallback, preserve amount/currency pairing, and calculate separate currency minima.
- `activity-saas-backend/src/catalogue/catalogue.listing.service.spec.ts`: 15 added cases covering USD, INR, EUR, zero, unusable amounts, legacy currency data, multiple options/currencies and revision/version selection.
- `activity-saas-frontend/src/api.ts`: additive listing response fields.
- `activity-saas-frontend/src/pages/Products.tsx`: format each minimum in its own currency.
- `activity-saas-frontend/src/pages/Products.test.tsx`: 9 added UI cases covering currency formatting, zero, legacy responses, missing prices and mixed rows/currencies.
- `activity-saas-backend/scripts/verify-product-list-currency-staging.cjs`: 7 new PostgreSQL/API acceptance checks, restricted to the existing disposable local database guard.
- `activity-saas-backend/scripts/verify-bulk-import-staging.cjs`: run the new acceptance checks with the existing regression harness.
- `activity-saas-backend/scripts/verify-bulk-editor-three-cases.cjs`: correct an existing order-dependent assertion to require each missing ticket type independently. Preview and transactional rejection checks remain intact.

## Verification

| Check | Result |
| --- | --- |
| Backend tests | 930 passed across 127 suites |
| Frontend tests | 404 passed across 53 files |
| Added unit regressions | 24: 15 backend and 9 frontend |
| PostgreSQL/API acceptance | 84 passed, including 7 added currency checks |
| Backend/frontend builds | Passed |
| Bootstrap / demo-build tests | 2 / 2 passed |
| Frontend entry budget | Passed |
| Diff whitespace check | Passed |
| Codex browser walkthrough | **Blocked: browser connection unavailable for this chat** |

The first staging run exposed the existing assertion's dependence on PostgreSQL traveller-rule ordering. The error correctly identified all missing types; the test expected one exact order. After correcting that assertion, the complete harness passed on a fresh isolated copy, `voya_import_fixes_2026112602` at `127.0.0.1:55445`. Its lineage is the previously verified local restored snapshot, not a new live database download. External delivery and scheduled workers were disabled. All 12 protected financial table fingerprints were unchanged. The currency-specific read-only comparisons also preserved Product, ProductRevision, ProductVariant, RatePlan, RatePlanCommercialVersion and RatePlanTravellerPrice.

No migration or backfill is needed. Source HEAD remains `70f9168a304c7496d59ff1742da436d717e484e1`; the fix is uncommitted. Existing unrelated local evidence-file modifications were left alone.

## Remaining browser verification

Staging is running at `http://127.0.0.1:3048` with its API at `http://127.0.0.1:4056/api`. The preview was queued in Codex and the user confirmed opening it, but the browser tool still reported `Local browser access is unavailable for this chat`. No browser test success, screenshot, console result or keep-open mark is claimed. No browser or tab was closed.

Once the connection is available:

1. Open `http://127.0.0.1:3048/vendor/products` and sign in with the existing Harbour Trails owner demonstration account.
2. Select **Fort Kochi**, then search **Demonstration currency**.
3. Check the `4FA740` fixtures: USD **$90.25**, INR **₹900.00**, MIXED **₹900.00 / $90.25**, ZERO **$0.00**.
4. Search USD product code **TA-KL-0109**, then reload and confirm its currency remains USD.
5. Open that product's Rates step and compare its USD amounts with the list; return to the list and leave the verification tab open.
6. Capture the screen and console results before treating browser verification as complete.

Evidence is under `outputs/usd-product-list-fix-20261126/`. The earlier failed rehearsal is retained separately; the final 84-check passing result is `staging-final/staging-verification.json`.
