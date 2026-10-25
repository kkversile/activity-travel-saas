import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createSampleImportJson, createSampleWorkbook, parseProductJson, parseProductWorkbook } from './productImport';

describe('product Excel import workbook', () => {
  it('ships a valid demo workbook that parses into all product setup sections', () => {
    const workbook = createSampleWorkbook();
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const result = parseProductWorkbook(buffer);
    expect(result.issues).toEqual([]);
    expect(result.model?.basic.product_name).toBe('Munnar Sunrise Spice Garden Walk');
    expect(result.model?.options).toHaveLength(2);
    expect(result.model?.ratePlans).toHaveLength(2);
    expect(result.model?.availability).toHaveLength(2);
    expect(result.model?.media).toHaveLength(1);
    expect(result.model?.bookingQuestions).toHaveLength(2);
  });

  it('reports broken option references before creating anything', () => {
    const workbook = createSampleWorkbook();
    const rateSheet = workbook.Sheets.Rate_Plans;
    rateSheet.B4 = { t: 's', v: 'UNKNOWN-OPTION' };
    const changed = parseProductWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(changed.issues.some((issue) => issue.message.includes('Unknown option_code'))).toBe(true);
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
