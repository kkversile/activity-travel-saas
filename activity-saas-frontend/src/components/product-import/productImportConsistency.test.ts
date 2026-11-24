import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createSampleWorkbook, createRateUpdateWorkbook, parseProductWorkbook, parseProductCsv, parseRateUpdateWorkbook, parseRateUpdateCsv } from './productImport';

const bytes = (workbook: XLSX.WorkBook) => XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
function editSlot(workbook: XLSX.WorkBook, field: string, value: string | number | boolean, row = 3) {
  const sheet = workbook.Sheets['Time slots']; const fields = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0];
  const cell = XLSX.utils.encode_cell({ r: row - 1, c: fields.indexOf(field) });
  sheet[cell] = { t: typeof value === 'number' ? 'n' : typeof value === 'boolean' ? 'b' : 's', v: value };
  return cell;
}
function rates(header = 'adult_sell_inr') {
  const workbook = createRateUpdateWorkbook(); workbook.Sheets.Rates.E1 = { t: 's', v: header };
  XLSX.utils.sheet_add_aoa(workbook.Sheets.Rates, [['PRODUCT', 'OPTION', '2026-12-01', '2026-12-31', '1800', '900', '', '', '']], { origin: 'A2' });
  return workbook;
}
const csv = (header = 'adult_sell_inr') => `product_code,option_code,valid_from,valid_to,${header},child_sell_inr\nPRODUCT,OPTION,2026-12-01,2026-12-31,1800,900`;

describe('multi-slot schedule consistency', () => {
  it.each([
    ['default_capacity', 6], ['operating_days', 'MON|TUE'], ['effective_from', '2026-11-01'], ['effective_to', '2027-11-01'],
    ['capacity_unit', 'BOOKING'], ['operating_model', 'FIXED_SLOT'], ['timezone', 'UTC'], ['schedule_name', 'Another schedule'], ['materialize', false],
  ])('rejects conflicting %s instead of discarding the entered setting', (field, value) => {
    const workbook = createSampleWorkbook(); const cell = editSlot(workbook, String(field), value);
    const result = parseProductWorkbook(bytes(workbook));
    expect(result.models).toHaveLength(0);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ sheet: 'Time slots', row: 3, cell, field, fatal: true, correction: expect.stringContaining('different schedule_code') })]));
    expect(result.issues.find((issue) => issue.field === field)?.message).toContain('Time slots!');
  });

  it('does not treat different slots, equivalent values or inherited blank settings as conflicting schedules', () => {
    const workbook = createSampleWorkbook(); editSlot(workbook, 'default_capacity', '15.0');
    editSlot(workbook, 'operating_days', 'sun|sat|fri|thu|wed|tue|mon');
    editSlot(workbook, 'schedule_name', ''); editSlot(workbook, 'timezone', '');
    const result = parseProductWorkbook(bytes(workbook));
    expect(result.issues).toEqual([]);
    expect(result.model?.availability).toHaveLength(2);
    expect(JSON.parse(String(result.model?.availability[0].slots_json))).toHaveLength(2);
    expect(result.model?.availability[0].default_capacity).toBe(15);
  });

  it('allows distinct schedule codes to have different settings', () => {
    const workbook = createSampleWorkbook(); editSlot(workbook, 'schedule_code', 'SEPARATE-SCHEDULE'); editSlot(workbook, 'default_capacity', 6);
    const result = parseProductWorkbook(bytes(workbook));
    expect(result.issues).toEqual([]);
    expect(result.model?.availability).toHaveLength(3);
    expect(result.model?.availability[1].default_capacity).toBe(6);
  });

  it('checks sectioned CSV schedules using the same rules and actual CSV row locations', () => {
    const workbook = createSampleWorkbook(); editSlot(workbook, 'default_capacity', 6);
    const rows = workbook.SheetNames.flatMap((section) => XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[section]).map((row) => ({ section, ...row })));
    const contents = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
    const result = parseProductCsv(contents);
    expect(result.models).toHaveLength(0);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ sheet: 'CSV', field: 'default_capacity', fatal: true })]));
  });
});

describe('rate-update header validation', () => {
  it.each(['adult_sell_inrs', 'Adult_Sell_Inr'])('rejects the optional header %s in Excel and CSV before any price is accepted', (header) => {
    const excel = parseRateUpdateWorkbook(bytes(rates(header)));
    expect(excel?.rows).toEqual([]);
    expect(excel?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ cell: 'E1', field: header, correction: 'Rename this column to adult_sell_inr. Use the exact template header.', fatal: true })]));
    const text = parseRateUpdateCsv(csv(header));
    expect(text?.rows).toEqual([]);
    expect(text?.issues.some((issue) => issue.field === header && issue.fatal)).toBe(true);
  });

  it('rejects duplicate and missing required headers without misclassifying the CSV', () => {
    const workbook = rates(); workbook.Sheets.Rates.F1 = { t: 's', v: 'adult_sell_inr' };
    expect(parseRateUpdateWorkbook(bytes(workbook))?.issues.some((issue) => issue.cell === 'F1' && issue.message.startsWith('Duplicate column'))).toBe(true);
    const result = parseRateUpdateCsv(csv().replace('product_code', 'product_cod'));
    expect(result?.rows).toEqual([]);
    expect(result?.issues.some((issue) => issue.message === 'Missing required column: product_code.')).toBe(true);
  });

  it('identifies a renamed rate worksheet when update mode is selected', () => {
    const workbook = rates(); workbook.Sheets.Prices = workbook.Sheets.Rates; delete workbook.Sheets.Rates;
    workbook.SheetNames = workbook.SheetNames.map((name) => name === 'Rates' ? 'Prices' : name);
    expect(parseRateUpdateWorkbook(bytes(workbook), true)?.issues[0]).toMatchObject({ sheet: 'Rates', message: 'Missing required sheet: Rates.', fatal: true });
    expect(parseRateUpdateCsv('unknown_header\nvalue', true)?.rows).toEqual([]);
  });

  it('preserves valid optional and omitted price columns', () => {
    expect(parseRateUpdateWorkbook(bytes(rates()))?.rows[0]).toMatchObject({ adultSellInr: '1800', childSellInr: '900' });
    const result = parseRateUpdateCsv('product_code,option_code,valid_from,valid_to,child_sell_inr\nPRODUCT,OPTION,2026-12-01,2026-12-31,900');
    expect(result?.issues).toEqual([]);
    expect(result?.rows[0]).toMatchObject({ childSellInr: '900' });
    expect(result?.rows[0]).not.toHaveProperty('adultSellInr');
  });

  it('keeps real Excel dates correct for the 1904 date system and physical error rows', () => {
    const workbook = rates(); workbook.Workbook = { WBProps: { date1904: true } };
    workbook.Sheets.Rates.C2 = { t: 'n', v: 44857 }; workbook.Sheets.Rates.D2 = { t: 'n', v: 44858 };
    expect(parseRateUpdateWorkbook(bytes(workbook))?.rows[0]).toMatchObject({ validFrom: '2026-10-24', validTo: '2026-10-25' });
    const blankRows = parseRateUpdateCsv(csv().split('\n')[0] + '\n\nPRODUCT,OPTION,2026-12-01,2026-12-31,banana,900');
    expect(blankRows?.issues[0].row).toBe(3);
  });
});
