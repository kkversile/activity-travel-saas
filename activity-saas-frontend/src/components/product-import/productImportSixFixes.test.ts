import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createRateUpdateWorkbook, createSampleImportJson, importErrorsCsv, parseProductJson, parseRateUpdateCsv, parseRateUpdateWorkbook, serverImportIssues } from './productImport';
import { createProductTemplateBytes, createRateUpdateTemplateBytes } from './productImportTemplate';

const headers = ['product_code','option_code','valid_from','valid_to','adult_sell_inr','child_sell_inr','senior_sell_inr','base_sell_inr','mrp_inr'];
function rateFiles(amount: string, field = 'child_sell_inr') {
  const values = ['PRD','OPT','2026-12-01','2027-01-01','','','','',''];
  values[headers.indexOf(field)] = amount;
  const csv = [headers.join(','), values.join(',')].join('\n');
  const book = createRateUpdateWorkbook(); XLSX.utils.sheet_add_aoa(book.Sheets.Rates, [values], {origin:'A2'});
  return [parseRateUpdateCsv(csv,true)!, parseRateUpdateWorkbook(XLSX.write(book,{type:'array',bookType:'xlsx'}),true)!];
}
function product(key: string, name: string) {
  const source: any = structuredClone(createSampleImportJson());
  for (const rows of Object.values(source)) if (Array.isArray(rows)) for (const row of rows) {
    if (row && typeof row === 'object') (row as Record<string,unknown>).product_key=key;
  }
  source.Basic_Info[0].product_name=name;
  return source;
}

describe('six-finding import regressions',()=>{
  it.each(['0','0.0000','99999999999999.9999'])('retains explicit child price %s in Excel and CSV',amount=>{
    for (const parsed of rateFiles(amount)) {
      expect(parsed.issues).toEqual([]); expect(parsed.rows[0].childSellInr).toBe(amount);
      expect(parsed.rows[0]).not.toHaveProperty('adultSellInr');
    }
  });
  it.each(['adult_sell_inr','child_sell_inr','senior_sell_inr','base_sell_inr','mrp_inr'])('blocks overflowing %s with an exact cell and maximum before preflight',field=>{
    for(const parsed of rateFiles('100000000000000',field)) {
      expect(parsed.rows).toEqual([]);
      expect(parsed.issues).toContainEqual(expect.objectContaining({field,cell:`${XLSX.utils.encode_col(headers.indexOf(field))}2`,value:'100000000000000',correction:expect.stringContaining('99999999999999.9999')}));
    }
  });
  it('identifies both normalized JSON duplicate keys with their original paths and entered values',()=>{
    const parsed=parseProductJson(JSON.stringify({products:[product(' DUP ','First coastal walk'),product('dup','Second coastal walk')]}));
    expect(parsed.models).toEqual([]);
    const issues=parsed.issues.filter(issue=>issue.field==='product_key');
    expect(issues.map(issue=>issue.path)).toEqual(['products[0].Basic_Info[0].product_key','products[1].Basic_Info[0].product_key']);
    expect(issues.every(issue=>issue.fatal && issue.correction?.includes('unique product_key'))).toBe(true);
    const csv=importErrorsCsv(issues);
    expect(csv).toContain('products[0].Basic_Info[0].product_key');expect(csv).toContain('products[1].Basic_Info[0].product_key');
    expect(csv).toContain('"product_key"');expect(csv).toContain('unique product_key');
  });
  it('uses product indices to map structured API errors even if returned product keys repeat',()=>{
    const parsed=parseProductJson(JSON.stringify({products:[product('ONE','First coastal walk'),product('TWO','Second coastal walk')]}));
    const issues=serverImportIssues([1,2].map(productIndex=>({productIndex,productKey:'DUP',issues:[{section:'Basic_Info',row:3,field:'product_key',message:'Repeated key',correction:'Use a unique product_key.'}]})),parsed.models);
    expect(issues.map(issue=>issue.path)).toEqual(['products[0].Basic_Info[0].product_key','products[1].Basic_Info[0].product_key']);
    expect(issues.map(issue=>issue.rowData?.product_key)).toEqual(['ONE','TWO']);
  });
  it.each([createProductTemplateBytes,createRateUpdateTemplateBytes])('ships actual Excel amount rules for zero, storage limits and decimal scale',create=>{
    const bytes=create(),zip=XLSX.CFB.read(bytes,{type:'buffer'});
    // CFB names can be basenames, so inspect paths as the package reader exposes them.
    const xmls: string[]=zip.FullPaths.flatMap((name: string,index: number)=>/xl\/worksheets\/sheet\d+\.xml$/.test(name)?[new TextDecoder().decode(new Uint8Array(zip.FileIndex[index].content as Uint8Array))]:[]);
    expect(xmls.length).toBeGreaterThan(0);
    const rules=xmls.flatMap(source=>[...new DOMParser().parseFromString(source,'application/xml').querySelectorAll('dataValidation[type="custom"]')]);
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for(const rule of rules) {
      expect(rule.getAttribute('errorStyle')).toBe('stop');
      expect(rule.getAttribute('error')).toContain('99999999999999.9999');
      expect(rule.textContent).toContain('<100000000000000');expect(rule.textContent).toMatch(/>=0/);expect(rule.textContent).toContain(',4)');
    }
    if(create===createRateUpdateTemplateBytes)expect(parseRateUpdateWorkbook(bytes.buffer as ArrayBuffer,true)?.issues).toContainEqual(expect.objectContaining({message:'Add at least one rate update row.'}));
  });
});
