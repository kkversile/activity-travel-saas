# Schedule consistency and rate-update headers — 24 November 2026

Implemented locally after the follow-up review reproduced silently ignored settings in time-slot groups and silently ignored misspelled optional price headers. These fixes are not pushed or deployed and do not change live data. They build on the pending numeric/date/header fixes documented in `BULK_IMPORT_SANITY_FIXES_20261124.md`.

## Schedule grouping

- Rows with one product/option/schedule identity must agree on schedule name, operating model, timezone, effective date range, operating days, capacity unit, default capacity and materialization choice.
- Explicit conflicting settings block that product group. Errors identify both the original setting's cell and the conflicting cell, and tell vendors to use consistent settings or a different schedule_code.
- Blank settings on later rows inherit the first row. Numeric equivalents such as 15 and 15.0, reordered day sets, and different slot times remain valid.
- Independent schedule codes can have different settings. The existing partial-batch behaviour can still import other valid product groups; conflicting groups are excluded with errors rather than merged silently.
- The product template Instructions sheet explains the grouping rule.
- The backend rejects duplicate option/schedule identities in raw Availability JSON during preflight and save, before draft creation. JSON callers must combine slots in a single Availability row with slots_json or provide a distinct schedule code.

## Rate-update structure

- Excel and CSV rate updates share the same allowed and required headers as the rate-update template.
- Unknown, misspelled, incorrectly cased, duplicate, blank populated and missing required headers block the file. An adult_sell_inrs typo reports its header cell and recommends adult_sell_inr, even when a valid child-price column is also present.
- Missing or renamed Rates worksheets receive explicit guidance when update mode is selected. Malformed rate CSVs are recognized without requiring all headers to be valid first.
- Optional price columns can still be omitted. A valid child-only update does not create an adult-price update. Existing pricing rules and confirmation steps are unchanged.
- Excel serial dates respect the workbook date system, including 1904. Row errors retain physical row numbers across blank lines.
- The disabled action is labelled Apply valid rate updates in update mode, even before valid rows exist.

## Regression coverage and manual checks

- New schedule tests cover all nine schedule-level settings, equivalent values, blank inheritance, independent codes and sectioned CSV.
- New rate tests cover both reported typos, duplicate/missing headers, renamed worksheets, optional price columns, physical rows and Excel dates. A modal regression test proves header rejection occurs before any server request.
- A backend test proves duplicate schedule identities fail both validate-only and save before creating a draft.
- Backend and frontend builds passed. All **806 backend tests** and **318 frontend tests** passed; the JavaScript budget passed. Final reports and reproduction evidence are stored under `outputs/import-consistency-fixes-20261124/`.
- Codex browser checks of the actual local import modal confirmed blocked capacity/day conflicts, both Excel and CSV header corrections, and an accepted valid-rate preview. No save request was submitted. The verification tab remains open.

No dependencies, Prisma migrations, theme/color settings, financial ledger rules or production records were changed. The pre-existing modified multi-outlet evidence files were left untouched.

The backend test heap limit used for the first focused attempt was too low; the run was repeated with adequate memory. One full run passed all tests but could not write its report because the destination folder did not exist; after creating it, a clean full run saved the report. These were verification-run issues, not application workarounds or skipped tests.

## Release status

These source changes and the preceding sanity fixes remain local. Deploy backend and frontend together through the established backup/release process, then repeat the validation-only checks on the demo and perform a staging save/update/retry acceptance test before final client sign-off. Passing tests do not imply coverage of every possible client workbook or native Excel version.
