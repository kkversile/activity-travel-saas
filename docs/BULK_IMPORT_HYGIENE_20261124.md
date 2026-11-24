# Bulk product import fixes — 24 November 2026

Implemented locally in response to the client's duplicate-product error and missing Excel dropdown feedback. Nothing was pushed or deployed, and no live database was accessed or changed.

## Result

- The downloaded XLSX has real Excel list validations with stop alerts for existing controlled fields: product type, meeting model, duration unit, guide mode, voucher fields, sharing, boolean choices, pricing unit, booking mode, supplier model, MRP mode, operating model and capacity unit. Rules cover data rows 2–2001. An Instructions sheet explains the format and product relationships.
- The normal five data sheets remain Products, Options, Ticket types, Rates and Time slots. CSV and JSON formats remain supported.
- A pure contract in `activity-saas-backend/src/common/product-import-contract.ts` supplies the frontend and backend choices and normalizers. Frontend-only build archives must include that source file; normal builds from the complete repository already do.
- `hour`, `Hour`, `hOur`, `hr` and `hrs` normalize to HOURS; `day` normalizes to DAYS. The existing supported units remain HOURS, DAYS and FLEXIBLE. Unknown values fail validation; boolean typos are rejected rather than silently becoming false. Supported case variations normalize for other controlled fields too.
- The backend validates and normalizes import rows before saving drafts. Ordinary product draft/revision DTOs also normalize and validate duration units. This prevents bypassing the Excel controls using pasted data, CSV, JSON or direct API calls.
- Duplicate product codes are compared without case sensitivity. Errors identify the actual source sheet and duplicate cell, refer to the first conflicting cell, and explain how to fix it. Repeating codes in linked option/rate/time-slot rows is explicitly allowed.
- Original Excel row locations survive blank rows, product grouping and conversion to the internal JSON format. Server validation details are flattened and mapped back to the uploaded workbook rather than displayed as raw JSON. CSV source row locations are retained too.
- Error CSV downloads include sheet, row, cell, field, entered value, message, correction and available original row data. Formula-like cell values are escaped for this error report.
- Existing save confirmation, draft creation, partial-import recovery, outlet permissions and theme styles are preserved. No dependencies, Prisma migrations or financial rules were changed.

## Verification

- Backend: all 125 suites / 793 tests passed, including financial, outlet isolation, import recovery and batch preflight tests.
- Frontend: full 270-test suite passed; the final focused import rerun also passed after additional correction wording was added.
- Backend and frontend builds passed; frontend JavaScript budget passed.
- New tests cover OOXML dropdown rules, stop alerts, row coverage, valid sample round-trip, duplicate physical cell locations, case-insensitive duplicates, normalization, rejection of invalid enum values in Excel/CSV/JSON, every time-slot row before schedule grouping, server error mapping and actionable error CSV output.
- An independent ExcelJS reader loaded the generated workbook and confirmed the duration list and stop rule through row 2001. Native Microsoft Excel was not used for this check.
- In the Codex browser, the actual Product template download was re-uploaded successfully and showed one valid product. A duplicate workbook showed Products!A3 and its conflict at Products!A2, correction guidance, and disabled saving. This used the actual import modal on an isolated local preview; no API save was submitted.
- Evidence is in `outputs/import-hygiene-20261124/`: test reports, independent workbook check, corrected XLSX template and the error-screen screenshot.

## Manual acceptance steps

1. Open Vendor → Bulk upload and download Product template (Excel).
2. Open it in Excel. Select a duration_unit cell and confirm the HOURS / DAYS / FLEXIBLE dropdown. Check sharing, booking mode and boolean dropdowns too.
3. Upload the unchanged sample: it should preview one product without parsing issues. Validate against the API before choosing to save. A previously imported sample can still be rejected by the existing duplicate-database-product protection; use a clean local/staging vendor or genuinely different sample product when checking creation.
4. Duplicate the Products row. Upload it and confirm both source cells and the correction guidance appear. Saving must remain disabled. Repeating product_code in linked sheets must remain valid.
5. Paste `hOur` into duration_unit and upload: the parsed/API value should be HOURS. Paste an unknown value: it should identify the cell and list valid choices. Repeat using CSV/JSON.
6. Download error rows and verify the location, entered value and correction columns.
7. With multiple product groups, invalidate one row in the second product and confirm the original file row is reported. Preserve the current valid-row exclusion and partial recovery behavior.

## Deployment and historical data

These are source changes awaiting review/deployment. Release both the backend and frontend together so that the template and API rules agree. Keep the existing demo-login build configuration and configured appearance. No schema migration is needed. Historical catalogue values were not audited or rewritten; any existing unsupported units may need correction through the normal product editor before a future save. The client's actual uploaded workbook was not provided, so the duplicate error was reproduced with a generated duplicate row rather than attributed to a particular edit in their file.
