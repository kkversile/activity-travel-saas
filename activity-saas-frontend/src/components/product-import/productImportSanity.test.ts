import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createSampleImportCsv, createSampleImportJson, createSampleWorkbook, parseProductCsv, parseProductJson, parseProductWorkbook, PROTOTYPE_IMPORT_SHEETS } from './productImport';
import { createProductTemplateBytes } from './productImportTemplate';

const parse = (w: XLSX.WorkBook) => parseProductWorkbook(XLSX.write(w, { type: 'array', bookType: 'xlsx' }));
function edit(w: XLSX.WorkBook, sheet: string, field: string, value: string | number) {
  const fields = XLSX.utils.sheet_to_json<string[]>(w.Sheets[sheet], { header: 1 })[0];
  const cell = XLSX.utils.encode_cell({ r: 1, c: fields.indexOf(field) });
  w.Sheets[sheet][cell] = { t: typeof value === 'number' ? 'n' : 's', v: value };
  return cell;
}

describe('product import sanity checks', () => {
  it.each([
    ['Products', 'duration_value', -2], ['Products', 'duration_value', 'two'], ['Products', 'duration_value', 0],
    ['Rates', 'adult_price', 'banana'], ['Rates', 'adult_price', -1], ['Rates', 'adult_price', '1.12345'],
    ['Rates', 'min_pax', 1.5], ['Rates', 'valid_from', 'not-a-date'], ['Rates', 'valid_from', '2026-02-30'],
    ['Rates', 'valid_to', '2020-01-01'], ['Time slots', 'effective_to', '2020-01-01'],
    ['Time slots', 'operating_days', 'FUNDAY'], ['Time slots', 'default_capacity', -1], ['Time slots', 'start_time', '25:00'],
  ])('identifies the source cell for invalid %s.%s (%s)', (sheet, field, value) => {
    const w = createSampleWorkbook(); const cell = edit(w, String(sheet), String(field), value);
    const result = parse(w);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ sheet, cell, field, correction: expect.any(String) })]));
  });

  it('preserves valid decimals, explicit zero prices, flexible duration and single-day schedules', () => {
    const w = createSampleWorkbook(); edit(w, 'Products', 'duration_value', 2.5); edit(w, 'Rates', 'child_price', 0);
    edit(w, 'Time slots', 'effective_to', '2026-10-24'); edit(w, 'Time slots', 'operating_days', ' mon | fri |MON');
    const slots = w.Sheets['Time slots']; slots.H3 = { t: 's', v: '2026-10-24' }; slots.I3 = { t: 's', v: 'MON|FRI' };
    expect(parse(w).issues).toEqual([]);
    expect(parse(w).model?.availability[0].operating_days).toBe('MON|FRI');
    const json: any = createSampleImportJson(); json.Basic_Info[0].duration_unit = 'FLEXIBLE';
    expect(parseProductJson(JSON.stringify(json)).issues).toEqual([]);
  });

  it('validates calendar and numeric fields in CSV and JSON too', () => {
    expect(parseProductCsv(createSampleImportCsv().replace('1800', 'banana')).issues.some((issue) => issue.field === 'adult_price')).toBe(true);
    const json: any = createSampleImportJson(); json.Rate_Plans[0].valid_from = '2026-02-30';
    expect(parseProductJson(JSON.stringify(json)).issues.some((issue) => issue.field === 'valid_from')).toBe(true);
  });

  it.each([...PROTOTYPE_IMPORT_SHEETS])('reports the missing %s sheet without falling back to Basic_Info', (name) => {
    const w = createSampleWorkbook(); delete w.Sheets[name]; w.SheetNames = w.SheetNames.filter((sheet) => sheet !== name);
    const result = parse(w);
    expect(result.models).toHaveLength(0);
    expect(result.issues).toEqual([expect.objectContaining({ sheet: name, message: `Missing required sheet: ${name}.`, fatal: true })]);
  });

  it('rejects an optional header typo and suggests its correct name', () => {
    const w = createSampleWorkbook(); w.Sheets.Products.Q1 = { t: 's', v: 'duration_units' };
    const result = parse(w);
    expect(result.models).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ sheet: 'Products', cell: 'Q1', field: 'duration_units', correction: 'Rename this column to duration_unit. Use the exact template header.' });
    expect(parseProductCsv(createSampleImportCsv().replace('duration_unit,', 'duration_units,')).issues[0].field).toBe('duration_units');
  });

  it('rejects duplicate and missing required headers before parsing any products', () => {
    const w = createSampleWorkbook(); w.Sheets.Products.B1 = { t: 's', v: 'product_code' };
    const result = parse(w);
    expect(result.issues.some((issue) => issue.cell === 'B1' && issue.message.startsWith('Duplicate column'))).toBe(true);
    expect(result.issues.some((issue) => issue.message === 'Missing required column: product_name.')).toBe(true);
  });

  it('ignores formatting-only trailing columns but rejects populated columns without headers', () => {
    const w = createSampleWorkbook(); w.Sheets.Products.BZ2 = { t: 'z' }; w.Sheets.Products['!ref'] = 'A1:BZ2';
    expect(parse(w).issues).toEqual([]);
    w.Sheets.Products.BZ2 = { t: 's', v: 'unmapped value' };
    expect(parse(w).issues.some((issue) => issue.cell === 'BZ1' && issue.message === 'A column header is blank.')).toBe(true);
  });

  it('reads real Excel date/time cells for both workbook date systems', () => {
    for (const date1904 of [false, true]) {
      const w = createSampleWorkbook(); w.Workbook = { WBProps: { date1904 } };
      const serial = date1904 ? 44857 : 46319; // 2026-10-24
      edit(w, 'Rates', 'valid_from', serial); edit(w, 'Time slots', 'start_time', 6.5 / 24);
      expect(parse(w).issues).toEqual([]);
      expect(parse(w).model?.ratePlans[0].valid_from).toBe('2026-10-24');
      expect(parse(w).model?.availability[0].start_time).toBe('06:30');
    }
  });

  it('keeps the supported legacy workbook layout importable', () => {
    const json: any = createSampleImportJson(); const w = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(json)) {
      if (name === 'README' || !Array.isArray(rows) || !rows.length) continue;
      const fields = [...new Set((rows as Record<string, unknown>[]).flatMap(Object.keys))];
      const ws = XLSX.utils.aoa_to_sheet([['VOYA import'], ['Keep headers'], fields, ...rows.map((row: any) => fields.map((field) => row[field] ?? ''))]);
      XLSX.utils.book_append_sheet(w, ws, name);
    }
    expect(parse(w).issues).toEqual([]);
  });

  it('counts physical time-slot rows before schedule grouping for the row limit', () => {
    const w = createSampleWorkbook(); const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(w.Sheets['Time slots']);
    w.Sheets['Time slots'] = XLSX.utils.json_to_sheet(Array.from({ length: 2001 }, (_, index) => ({ ...rows[0], slot_code: `SLOT-${index}` })));
    expect(parse(w).issues[0].message).toContain('limit is 2,000');
  });

  it('includes numeric stop rules in the downloaded Excel file', () => {
    const zip = XLSX.CFB.read(createProductTemplateBytes(), { type: 'buffer' });
    const sheet = (index: number) => new DOMParser().parseFromString(new TextDecoder().decode(new Uint8Array(zip.FileIndex[zip.FullPaths.findIndex((p: string) => p.endsWith(`/xl/worksheets/sheet${index}.xml`))].content)), 'application/xml');
    expect(sheet(1).querySelector('dataValidation[type="decimal"][operator="greaterThan"] formula1')?.textContent).toBe('0');
    expect(sheet(4).querySelector('dataValidation[type="custom"]')?.getAttribute('errorStyle')).toBe('stop');
    expect(sheet(4).querySelector('dataValidation[type="custom"] formula1')?.textContent).toContain('<100000000000000');
  });
});
