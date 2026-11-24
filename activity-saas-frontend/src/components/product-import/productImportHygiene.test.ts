import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { importErrorsCsv, createSampleWorkbook, createSampleImportCsv, createSampleImportJson, parseProductWorkbook, parseProductCsv, parseProductJson, serverImportIssues } from './productImport';
import { createProductTemplateBytes } from './productImportTemplate';
import { importChoices } from '../../../../activity-saas-backend/src/common/product-import-contract';

const parse = (workbook: XLSX.WorkBook) => parseProductWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
function change(workbook: XLSX.WorkBook, sheet: string, field: string, row: number, value: string) {
  const columns = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheet], { header: 1 })[0];
  const cell = XLSX.utils.encode_cell({ r: row - 1, c: columns.indexOf(field) });
  workbook.Sheets[sheet][cell] = { t: 's', v: value };
  return cell;
}

describe('vendor import data hygiene', () => {
  it('writes real OOXML dropdowns, stop rules and instructions, and round-trips the downloaded file', () => {
    const bytes = createProductTemplateBytes();
    const archive = XLSX.CFB.read(bytes, { type: 'buffer' });
    const sections = ['Basic_Info', 'Options', 'Ticket_Types', 'Rate_Plans', 'Availability'];
    sections.forEach((section, index) => {
      const fileIndex = archive.FullPaths.findIndex((path: string) => path.endsWith(`/xl/worksheets/sheet${index + 1}.xml`));
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(new Uint8Array(archive.FileIndex[fileIndex].content)), 'application/xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      const rules = [...doc.querySelectorAll('dataValidation[type="list"]')];
      expect(rules).toHaveLength(Object.keys(importChoices[section]).length);
      for (const rule of rules) {
        expect(rule.getAttribute('type')).toBe('list');
        expect(rule.getAttribute('errorStyle')).toBe('stop');
        expect(rule.getAttribute('showErrorMessage')).toBe('1');
        expect(rule.getAttribute('sqref')).toMatch(/^[A-Z]+2:[A-Z]+2001$/);
        expect(rule.querySelector('formula1')?.textContent?.length).toBeLessThan(255);
      }
      if (!index) expect(rules.some((rule) => rule.textContent === '"HOURS,DAYS,FLEXIBLE"')).toBe(true);
    });
    expect(XLSX.read(bytes, { type: 'array' }).SheetNames).toContain('Instructions');
    expect(parseProductWorkbook(bytes.buffer as ArrayBuffer).issues).toEqual([]);
  });

  it('reports the real product cells and both duplicate rows, ignoring code case', () => {
    const workbook = createSampleWorkbook();
    const product = XLSX.utils.sheet_to_json(workbook.Sheets.Products)[0] as Record<string, unknown>;
    XLSX.utils.sheet_add_json(workbook.Sheets.Products, [{ ...product, product_code: 'munnar_sunrise_spice' }], { origin: 'A5', skipHeader: true });
    const issue = parse(workbook).issues[0];
    expect(issue).toMatchObject({ sheet: 'Products', row: 5, cell: 'A5', field: 'product_code' });
    expect(issue.message).toContain('Products!A2');
    expect(issue.correction).toContain('linked option, rate and time-slot');
    expect(issue.rowData).toHaveProperty('product_key');
  });

  it.each(['hour', 'Hour', 'hOur', 'HRS'])('normalizes %s in Excel and JSON', (unit) => {
    const workbook = createSampleWorkbook(); change(workbook, 'Products', 'duration_unit', 2, unit);
    expect(parse(workbook).model?.basic.duration_unit).toBe('HOURS');
    const json: any = createSampleImportJson(); json.Basic_Info[0].duration_unit = unit;
    expect(parseProductJson(JSON.stringify(json)).model?.basic.duration_unit).toBe('HOURS');
  });

  it('rejects arbitrary units in Excel, CSV and JSON with correction guidance', () => {
    const workbook = createSampleWorkbook(); const cell = change(workbook, 'Products', 'duration_unit', 2, 'BANANAS');
    const result = parse(workbook);
    expect(result.models).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ sheet: 'Products', row: 2, cell, field: 'duration_unit', value: 'BANANAS', correction: 'Choose HOURS, DAYS, FLEXIBLE.' });
    expect(parseProductCsv(createSampleImportCsv().replaceAll('HOURS', 'BANANAS')).models).toHaveLength(0);
    const json: any = createSampleImportJson(); json.Basic_Info[0].duration_unit = 'BANANAS';
    expect(parseProductJson(JSON.stringify(json)).models).toHaveLength(0);
  });

  it('checks every time-slot row before grouping schedules and keeps the actual row number', () => {
    const workbook = createSampleWorkbook();
    const cell = change(workbook, 'Time slots', 'capacity_unit', 3, 'BANANAS');
    const result = parse(workbook);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ sheet: 'Time slots', row: 3, cell, value: 'BANANAS' })]));
    expect(result.model?.availability).toHaveLength(1);
  });

  it('maps server errors to original workbook cells and exports actionable, formula-safe error rows', () => {
    const result = parse(createSampleWorkbook());
    const issues = serverImportIssues([{ productKey: 'MUNNAR_SUNRISE_SPICE', issues: [{ section: 'Basic_Info', row: 3, field: 'duration_unit', value: '=1+1', message: 'Invalid duration unit', correction: 'Choose HOURS, DAYS, FLEXIBLE.' }] }], result.models);
    expect(issues[0]).toMatchObject({ sheet: 'Products', row: 2, field: 'duration_unit' });
    const csv = importErrorsCsv(issues);
    expect(csv).toContain('"cell"'); expect(csv).toContain('"correction"'); expect(csv).toContain("'=1+1");
    expect(csv).toContain('Choose HOURS, DAYS, FLEXIBLE.');
  });
});
