import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createRateUpdateTemplateCsv, createRateUpdateWorkbook, createSampleImportCsv, createSampleImportJson, createSampleWorkbook, parseProductCsv, parseProductJson, parseProductWorkbook, parseRateUpdateCsv, parseRateUpdateWorkbook } from './productImport';

describe('product Excel import workbook', () => {
  it('ships a valid demo workbook that parses into all product setup sections', () => {
    const workbook = createSampleWorkbook();
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const result = parseProductWorkbook(buffer);
    expect(result.issues).toEqual([]);
    expect(result.model?.basic.product_name).toBe('Munnar Sunrise Spice Garden Walk');
    expect(result.model?.options).toHaveLength(2);
    expect(result.model?.ratePlans).toHaveLength(2);
    expect(result.model?.ratePlans[0]).toMatchObject({ mrp_mode: 'YES', mrp_amount: 2200 });
    expect(result.model?.availability).toHaveLength(2);
    expect(JSON.parse(String(result.model?.availability[0]?.slots_json))).toHaveLength(2);
    expect(result.model?.basic).toMatchObject({ duration_value: '2', duration_unit: 'HOURS', guide_included: 'WITH_GUIDE' });
    expect(String(result.model?.basic.itinerary_stops_json)).toContain('Spice garden entrance');
    expect(result.model?.media).toHaveLength(0);
    expect(result.model?.bookingQuestions).toHaveLength(0);
  });

  it('reports broken option references before creating anything', () => {
    const workbook = createSampleWorkbook();
    const rateSheet = workbook.Sheets.Rates;
    rateSheet.B2 = { t: 's', v: 'UNKNOWN-OPTION' };
    const changed = parseProductWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(changed.issues.some((issue) => issue.message.includes('Unknown option_code'))).toBe(true);
  });

  it('blocks MRP values below any sell price and malformed itinerary JSON', () => {
    const workbook = createSampleWorkbook();
    workbook.Sheets.Rates.T2 = { t: 'n', v: 100 };
    workbook.Sheets.Products.Z2 = { t: 's', v: '{bad json' };
    const result = parseProductWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(result.model).toBeNull();
    expect(result.issues.some((issue) => issue.message.includes('Selling prices cannot exceed'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('itinerary_stops_json'))).toBe(true);
  });

  it('keeps valid dependent rows importable when one option row is invalid', () => {
    const workbook = createSampleWorkbook();
    workbook.Sheets.Options.B3 = { t: 's', v: '' };
    const result = parseProductWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(result.model).not.toBeNull();
    expect(result.model?.options).toHaveLength(1);
    expect(result.model?.ratePlans).toHaveLength(1);
    expect(result.model?.availability).toHaveLength(1);
    expect(result.issues.some((issue) => issue.fatal === false)).toBe(true);
  });

  it('downloads the prototype five-sheet format and carries ticket types through parsing', () => {
    const workbook = createSampleWorkbook();
    expect(workbook.SheetNames).toEqual(['Products', 'Options', 'Ticket types', 'Rates', 'Time slots']);
    const result = parseProductWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(result.model?.ticketTypes).toHaveLength(2);
    expect(result.model?.ticketTypes[1]).toMatchObject({ ticket_type: 'Child', option_code: 'SUNRISE-SHARED', needs_adult: true });
  });

  it('enforces the prototype 2,000-row workbook limit', () => {
    const workbook = createSampleWorkbook();
    const sheet = workbook.Sheets.Options;
    const optionRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    XLSX.utils.sheet_add_json(sheet, Array.from({ length: 2000 }, (_, index) => ({ ...optionRows[0], option_code: `OPT-${index}` })), { origin: -1, skipHeader: true });
    const result = parseProductWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(result.models).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('2,000');
  });
});

describe('product JSON import', () => {
  it('ships a valid demo JSON file that parses into all product setup sections', () => {
    const result = parseProductJson(JSON.stringify(createSampleImportJson()));
    expect(result.issues).toEqual([]);
    expect(result.model?.basic.product_name).toBe('Munnar Sunrise Spice Garden Walk');
    expect(result.model?.options).toHaveLength(2);
    expect(result.model?.ratePlans).toHaveLength(2);
    expect(result.model?.availability).toHaveLength(2);
    expect(result.model?.media).toHaveLength(1);
    expect(result.model?.bookingQuestions).toHaveLength(2);
  });

  it('reports invalid JSON before creating anything', () => {
    const result = parseProductJson('{"Basic_Info": [');
    expect(result.model).toBeNull();
    expect(result.issues[0]?.message).toContain('valid JSON');
  });
});

describe('product CSV import', () => {
  it('parses the sectioned CSV sample into all product setup sections', () => {
    const result = parseProductCsv(createSampleImportCsv());
    expect(result.issues).toEqual([]);
    expect(result.model?.basic.product_name).toBe('Munnar Sunrise Spice Garden Walk');
    expect(result.model?.options).toHaveLength(2);
    expect(result.model?.ratePlans).toHaveLength(2);
    expect(result.model?.availability).toHaveLength(2);
    expect(result.model?.ticketTypes).toHaveLength(2);
    expect(result.model?.media).toHaveLength(0);
  });

  it('requires a section column instead of silently treating a flat CSV as complete', () => {
    const result = parseProductCsv('product_key,product_name\nDEMO,Demo activity');
    expect(result.model).toBeNull();
    expect(result.issues[0]?.message).toContain('section column');
  });

  it('enforces the 2,000-row limit for CSV imports', () => {
    const csv = ['section,product_key', ...Array.from({ length: 2001 }, () => 'Basic_Info,DEMO')].join('\n');
    const result = parseProductCsv(csv);
    expect(result.models).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('limit is 2,000');
  });
});

describe('vendor rate update import', () => {
  it('parses valid rate CSV rows and reports invalid rows without dropping valid updates', () => {
    const csv = [
      'product_code,option_code,valid_from,valid_to,adult_sell_inr,child_sell_inr,senior_sell_inr,base_sell_inr,mrp_inr',
      'TA-GA-0318,OPT-1,2026-12-01,2027-01-01,750,,,,1000',
      'TA-GA-9999,OPT-2,2026-12-01,2026-11-01,0,,,,',
    ].join('\n');
    const result = parseRateUpdateCsv(csv);
    expect(result?.rows).toEqual([{ productCode: 'TA-GA-0318', optionCode: 'OPT-1', validFrom: '2026-12-01', validTo: '2027-01-01', adultSellInr: '750', mrpInr: '1000' }]);
    expect(result?.issues.length).toBeGreaterThan(0);
    expect(result?.issues[0]?.rowData?.product_code).toBe('TA-GA-9999');
  });

  it('downloads a rate workbook template that the importer recognizes', () => {
    const bytes = XLSX.write(createRateUpdateWorkbook(), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const result = parseRateUpdateWorkbook(bytes);
    expect(result?.rows).toEqual([]);
    expect(result?.issues[0]?.message).toContain('Add at least one rate update row');
    expect(createRateUpdateTemplateCsv()).toContain('adult_sell_inr');
  });

  it('enforces the 2,000-row limit for rate CSV and Excel imports', () => {
    const headers = 'product_code,option_code,valid_from,valid_to,adult_sell_inr';
    const rows = Array.from({ length: 2001 }, (_, index) => `PROD-${index},OPT-${index},2026-12-01,2027-01-01,750`);
    const csv = parseRateUpdateCsv([headers, ...rows].join('\n'));
    expect(csv?.rows).toHaveLength(0);
    expect(csv?.issues[0]?.message).toContain('limit is 2,000');

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers.split(','), ...rows.map((row) => row.split(','))]), 'Rates');
    const excel = parseRateUpdateWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(excel?.rows).toHaveLength(0);
    expect(excel?.issues[0]?.message).toContain('limit is 2,000');
  });
});

describe('product JSON import limits', () => {
  it('enforces the 2,000-row limit for a single product JSON import', () => {
    const payload: any = createSampleImportJson();
    payload.Options = Array.from({ length: 2001 }, (_, index) => ({ ...payload.Options[0], option_code: `OPT-${index}` }));
    const result = parseProductJson(JSON.stringify(payload));
    expect(result.models).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('limit is 2,000');
  });
});
