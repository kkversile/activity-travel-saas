import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { createSampleImportJson, createSampleWorkbook, parseProductJson, parseProductWorkbook } from './productImport';

describe('product import currency metadata', () => {
  it.each(['USD', 'EUR', 'INR'])('infers %s from uniform rate rows without changing amounts', currency => {
    const source: any = createSampleImportJson();
    source.Rate_Plans.forEach((row: Record<string, unknown>) => { row.currency = currency; });
    const parsed = parseProductJson(JSON.stringify(source));
    expect(parsed.issues).toEqual([]);
    expect(parsed.models[0].basic.currency).toBe(currency);
    expect(parsed.models[0].ratePlans[0].adult_price).toBe(source.Rate_Plans[0].adult_price);
  });
  it('blocks ambiguous defaults and identifies the product currency field', () => {
    const source: any = createSampleImportJson(); source.Rate_Plans[0].currency = 'USD';
    const parsed = parseProductJson(JSON.stringify(source));
    expect(parsed.models).toHaveLength(0);
    expect(parsed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'currency', correction: expect.stringContaining('Set currency') })]));
  });
  it('accepts an explicit mixed-currency default and normalizes its code', () => {
    const source: any = createSampleImportJson(); source.Rate_Plans[0].currency = 'USD'; source.Basic_Info[0].currency = ' usd ';
    const parsed = parseProductJson(JSON.stringify(source));
    expect(parsed.issues).toEqual([]); expect(parsed.models[0].basic.currency).toBe('USD');
  });
  it('blocks an explicit default that conflicts with every rate currency', () => {
    const source: any = createSampleImportJson(); source.Basic_Info[0].currency = 'USD';
    expect(parseProductJson(JSON.stringify(source)).models).toHaveLength(0);
  });
  it('retains the optional product currency through the Excel mapping', () => {
    const book = createSampleWorkbook();
    for (const sheet of ['Products', 'Rates']) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[sheet], { defval: '' });
      book.Sheets[sheet] = XLSX.utils.json_to_sheet(rows.map(row => ({ ...row, currency: 'USD' })));
    }
    const parsed = parseProductWorkbook(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
    expect(parsed.issues).toEqual([]); expect(parsed.models[0].basic.currency).toBe('USD');
  });
});
