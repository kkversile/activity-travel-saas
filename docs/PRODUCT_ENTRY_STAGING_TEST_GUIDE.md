# Product entry and workbook testing

Use the isolated staging preview at http://127.0.0.1:3088. Its API is http://127.0.0.1:4088/api and its database is the disposable `voya_import_fixes_2026112801` on loopback port 55445. Nothing in this guide targets live.

1. Sign in as the existing Harbour Trails owner. Choose an outlet before adding a product. Business name and generated activity ID remain read-only.
2. On Basics, choose Country, State / region and City using the searchable controls. Changing country clears state and city; changing state clears city. Typing a query alone does not save an unsupported place. Existing historical values remain visible until explicitly changed.
3. Select a category and optionally select its tags. Choose Hours or Days with a positive number, or Flexible without a number. Save an incomplete draft, refresh and confirm the saved fields remain. Missing required review content must prevent submission while still allowing draft saving.
4. As a super administrator, open Configuration → Product destinations. Add a valid country/state/city combination. Adding it a second time must report that it already exists. Existing places and products must remain unchanged. Vendors cannot call the destination mutation API.
5. Return as owner and confirm the new destination appears under its correct parents. Download a new workbook and confirm it includes the new destination too.
6. Open Bulk upload. Download the blank product template and the separate completed sample. Instructions open first; the blank workbook has no sample products. In Excel, confirm wider descriptions, tall rows, wrapping, top alignment, frozen headings/identification columns, hidden header notes and dependent dropdowns. Required headers have `*`; Field guide explains whether each is needed for import or review.
7. Keep one product per row. Enter a unique temporary import reference in `product_code`, and repeat it in Options, Ticket types, Rates and Time slots. This is not the final Voya activity ID. The initial workbook includes rates and availability; a second rate file is not required.
8. Copy a product row with the same reference: upload must identify the duplicate cell, the original cell and the correction. Try an invalid duration unit and a city under the wrong state. Correct and re-upload. Pasted cells, CSV and direct API calls must also be validated.
9. Validate a corrected workbook. Confirm validation writes no products. Import it once and check the generated Voya code, options, rates and availability in the draft. Retry the same reference and confirm it cannot create a duplicate.
10. Complete required content, an eligible demonstration image, fulfilment, pricing and future availability. Review must list remaining problems and link to the relevant wizard step. Submit only a clearly labelled staging demonstration for QC; refresh and confirm Under review and locked editing. Publishing still needs the existing approval workflow.
11. To change existing INR rates, use the separate rate-update template with generated product/option codes. Validate, apply, reopen the product and select the effective date window. Confirm the saved value, unchanged other traveller/option prices and unchanged prices outside that window. Blank retains a price; zero is an explicit free price.
12. USD products must retain USD metadata/prices and show dollar amounts after refresh. The bulk rate-update template remains INR-only; use the existing advanced pricing editor for USD. A USD bulk update must be rejected without changing prices.
13. Check a 390 px mobile viewport: the location fields stack, dropdowns work and the page has no horizontal overflow. Restore the desktop viewport afterwards.
14. Sign in as an outlet employee and verify unauthorized outlets/products cannot be read or updated through APIs. Compare protected catalogue and finance hashes with the staging baseline.

Excel dropdowns are macro-free. After changing country, state, type or category, reselect the dependent Excel cells; pasted/stale combinations are rejected during validation. The web form clears child location selections immediately. Older supported file layouts and headers remain accepted.

Automated checks:

```powershell
# Frontend; bounded workers avoid exhausting this machine's memory.
npm test -- --maxWorkers=1
npm run build
npm run test:demo-build
# Backend (run from activity-saas-backend).
npm test
npm run build
```

The date-specific staging verification scripts under activity-saas-backend/scripts hard-code/validate a disposable loopback target and disable external delivery. They do not bootstrap or deploy production. The preservation script's `before` snapshot must not be replaced during a rehearsal; `after` checks the same protected IDs and finance tables.
