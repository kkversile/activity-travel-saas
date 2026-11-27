import { describe,expect,it } from 'vitest';
import * as XLSX from 'xlsx';
import { createProductTemplateBytes,createRateUpdateTemplateBytes } from './productImportTemplate';
import { createSampleWorkbook,parseProductWorkbook,parseRateUpdateWorkbook,PROTOTYPE_IMPORT_SHEETS } from './productImport';

const normalize=(value:unknown)=>String(value).replace(/\s+\*$/,'');
function parts(bytes:Uint8Array) {const book=XLSX.read(bytes,{type:'array',cellStyles:true}),zip=XLSX.CFB.read(bytes,{type:'buffer'});const file=(suffix:string)=>new DOMParser().parseFromString(new TextDecoder().decode(new Uint8Array(zip.FileIndex[zip.FullPaths.findIndex((path:string)=>path.endsWith(suffix))].content)),'application/xml');return {book,file,sheet:(name:string)=>file(`/xl/worksheets/sheet${book.SheetNames.indexOf(name)+1}.xml`)};}
const categories=[{code:'DAY_TOURS_SIGHTSEEING',name:'Day tours',subcategories:[{code:'CITY_TOURS',name:'City tours'}]}];
describe('row-based workbook usability and compatibility',()=>{
  it('separates an empty template from the completed sample and opens instructions first',()=>{
    const blank=parts(createProductTemplateBytes({blank:true,categories})).book,sample=parts(createProductTemplateBytes({categories})).book;
    expect(blank.SheetNames[0]).toBe('Instructions');expect(sample.SheetNames[0]).toBe('Instructions');
    for(const name of PROTOTYPE_IMPORT_SHEETS){expect(XLSX.utils.sheet_to_json(blank.Sheets[name])).toHaveLength(0);expect(XLSX.utils.sheet_to_json(sample.Sheets[name]).length).toBeGreaterThan(0);}
    expect(blank.Sheets.Instructions.B2.v).toBe('2.0');
  });
  it('retains original column order and accepts both marked and older headers',()=>{
    const older=createSampleWorkbook(),fresh=createProductTemplateBytes({categories}),book=parts(fresh).book;
    expect((XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Products,{header:1})[0]).map(normalize)).toEqual(XLSX.utils.sheet_to_json(older.Sheets.Products,{header:1})[0]);
    expect(book.Sheets.Products.B1.v).toBe('product_name *');
    expect(parseProductWorkbook(fresh.buffer as ArrayBuffer).issues).toEqual([]);
    expect(parseProductWorkbook(XLSX.write(older,{type:'array',bookType:'xlsx'})).issues).toEqual([]);
  });
  it('provides roomier rows, wider descriptions, top-aligned wrapping, theme headers and frozen identification columns',()=>{
    const {book,file,sheet}=parts(createProductTemplateBytes({colors:{primary:'#0b625e',raised:'#a8d5cb'}}));
    const products=sheet('Products'),styles=file('/xl/styles.xml');
    expect(products.querySelector('pane')?.getAttribute('xSplit')).toBe('2');expect(products.querySelector('pane')?.getAttribute('ySplit')).toBe('1');
    expect(Number(products.querySelector('row[r="2"]')?.getAttribute('ht'))).toBeGreaterThanOrEqual(72);
    expect(styles.querySelector('alignment[wrapText="1"][vertical="top"]')).not.toBeNull();
    expect(styles.querySelector('fgColor[rgb="FF0b625e"]')).not.toBeNull();expect(styles.querySelector('fgColor[rgb="FFa8d5cb"]')).not.toBeNull();
    expect(book.Sheets.Products['!merges']).toBeUndefined();
    const blank=parts(createProductTemplateBytes({blank:true}));expect(blank.sheet('Products').querySelector('sheetFormatPr')?.getAttribute('defaultRowHeight')).toBe('96');expect(blank.sheet('Products').querySelector('col')?.getAttribute('style')).toBeTruthy();
    const columns=XLSX.utils.sheet_to_json<string[]>(book.Sheets.Products,{header:1})[0].map(normalize);
    expect(book.Sheets.Products['!cols']?.[columns.indexOf('full_description')].wch).toBeGreaterThan(40);
  });
  it('writes dependent destination, subtype and category dropdowns without truncated inline lists',()=>{
    const {book,sheet}=parts(createProductTemplateBytes({categories})),rules=[...sheet('Products').querySelectorAll('dataValidation[type="list"] formula1')].map(node=>node.textContent||'');
    expect(rules).toContain('VOYA_COUNTRIES');expect(rules.some(rule=>rule.includes('_STATES'))).toBe(true);expect(rules.some(rule=>rule.includes('_CITIES'))).toBe(true);expect(rules.some(rule=>rule.includes('_SUBTYPES'))).toBe(true);expect(rules).toContain('VOYA_CATEGORIES');expect(rules.some(rule=>rule.includes('_TAGS'))).toBe(true);
    expect(book.Workbook?.Names?.some(item=>item.Name==='VOYA_COUNTRIES')).toBe(true);expect(book.Workbook?.Sheets?.find(item=>item.name==='Lists')?.Hidden).toBe(1);
  });
  it('includes administrator-added destinations in generated references',()=>{
    const added={country:'India',state:'Kerala',city:'Athirappilly'},book=parts(createProductTemplateBytes({destinations:[added]})).book;
    expect(XLSX.utils.sheet_to_json(book.Sheets.Destinations)).toContainEqual(added);
  });
  it('keeps header notes hidden so opening Excel does not cover the data',()=>{
    const zip=XLSX.CFB.read(createProductTemplateBytes(),{type:'buffer'}),files=zip.FullPaths.map((name:string,index:number)=>({name,file:zip.FileIndex[index]})).filter((item:{name:string})=>item.name.endsWith('.vml'));
    expect(files.length).toBeGreaterThan(0);
    for(const item of files){const vml=new TextDecoder().decode(new Uint8Array(item.file.content));expect(vml).toContain('visibility:hidden');expect(vml).not.toContain('<x:Visible/>');}
  });
  it('supports copying complete product rows and linked rows into the blank template',()=>{
    const blank=parts(createProductTemplateBytes({blank:true,categories})).book,sample=createSampleWorkbook();
    for(const name of PROTOTYPE_IMPORT_SHEETS){const rows=XLSX.utils.sheet_to_json<unknown[]>(sample.Sheets[name],{header:1}).slice(1);XLSX.utils.sheet_add_aoa(blank.Sheets[name],rows,{origin:'A2'});}
    const parsed=parseProductWorkbook(XLSX.write(blank,{type:'array',bookType:'xlsx'}));expect(parsed.issues).toEqual([]);expect(parsed.models).toHaveLength(1);
  });
  it('keeps optional category tags optional in import as well as the manual wizard',()=>{
    const book=createSampleWorkbook();book.Sheets.Products.E2={t:'s',v:''};
    expect(parseProductWorkbook(XLSX.write(book,{type:'array',bookType:'xlsx'})).issues).toEqual([]);
    expect(parts(createProductTemplateBytes()).book.Sheets.Products.D2.v).toBe('GUIDED_TOUR');
  });
  it('retains exact physical row numbers for invalid copied values in a marked template',()=>{
    const book=parts(createProductTemplateBytes({categories})).book,columns=XLSX.utils.sheet_to_json<string[]>(book.Sheets.Products,{header:1})[0].map(normalize),column=columns.indexOf('duration_unit');
    book.Sheets.Products[XLSX.utils.encode_cell({r:1,c:column})]={t:'s',v:'weeks'};
    expect(parseProductWorkbook(XLSX.write(book,{type:'array',bookType:'xlsx'})).issues).toContainEqual(expect.objectContaining({sheet:'Products',row:2,field:'duration_unit',cell:`${XLSX.utils.encode_col(column)}2`}));
  });
  it('keeps INR-only guidance, decimal/zero protections and existing rate headers',()=>{
    const bytes=createRateUpdateTemplateBytes(),{book,sheet}=parts(bytes);expect(book.Sheets.Instructions.B14.v).toContain('INR only');
    const rules=[...sheet('Rates').querySelectorAll('dataValidation[type="custom"]')];expect(rules).toHaveLength(5);expect(rules.every(node=>node.getAttribute('errorStyle')==='stop')).toBe(true);
    XLSX.utils.sheet_add_aoa(book.Sheets.Rates,[['PRD-1','OPT-1','2026-12-01','2027-01-01',0,'','','','']],{origin:'A2'});
    const parsed=parseRateUpdateWorkbook(XLSX.write(book,{type:'array',bookType:'xlsx'}),true);expect(parsed?.issues).toEqual([]);expect(parsed?.rows[0].adultSellInr).toBe('0');
  });
});
