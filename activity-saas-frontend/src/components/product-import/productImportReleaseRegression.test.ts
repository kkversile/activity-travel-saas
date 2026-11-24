import {describe,it,expect} from 'vitest';
import * as XLSX from 'xlsx';
import {createSampleImportJson,createSampleWorkbook,parseProductJson,parseProductWorkbook,parseRateUpdateCsv,parseRateUpdateWorkbook,serverImportIssues,importErrorsCsv,createRateUpdateWorkbook} from './productImport';

const csv='product_code,option_code,valid_from,valid_to,adult_sell_inr\n\nPRD,OPT,2026-12-01,2027-01-01,1900';
const bytes=(book:XLSX.WorkBook)=>XLSX.write(book,{type:'array',bookType:'xlsx'});
describe('release import regression cases',()=>{
  it('maps server rate errors back to physical CSV rows and template columns',()=>{
    const parsed=parseRateUpdateCsv(csv)!;
    const issues=serverImportIssues([{row:2,productCode:'PRD',optionCode:'OPT',field:'adultSellInr',message:'Above MRP',correction:'Reduce adult_sell_inr.'}],[],parsed.rows);
    expect(issues).toEqual([expect.objectContaining({sheet:'CSV',row:3,cell:'E3',field:'adult_sell_inr',value:'1900',correction:'Reduce adult_sell_inr.',fatal:true})]);
    expect(importErrorsCsv(issues)).toContain('E3');expect(importErrorsCsv(issues)).toContain('Reduce adult_sell_inr.');
  });
  it('maps compacted Excel rate errors and expands product-level errors to every source row',()=>{
    const book=createRateUpdateWorkbook();XLSX.utils.sheet_add_aoa(book.Sheets.Rates,[['PRD','OPT','2026-12-01','2027-01-01','1900'],['PRD','OPT2','2026-12-01','2027-01-01','1800']],{origin:'A4'});
    const parsed=parseRateUpdateWorkbook(bytes(book))!;
    const issues=serverImportIssues([{row:0,productCode:'PRD',optionCode:'',message:'Concurrent price change'}],[],parsed.rows);
    expect(issues.map(issue=>[issue.sheet,issue.row,issue.cell])).toEqual([['Rates',4,'B4'],['Rates',5,'B5']]);expect(issues.every(issue=>issue.correction)).toBe(true);
  });
  it('shows exact numeric cell, original value and actionable correction',()=>{
    const parsed=parseRateUpdateCsv(csv.replace('1900','banana'))!;
    expect(parsed.issues[0]).toMatchObject({sheet:'CSV',row:3,cell:'E3',field:'adult_sell_inr',value:'banana',message:expect.stringContaining('adult_sell_inr'),correction:expect.stringContaining('positive INR amount')});
  });
  it.each([null,42,'not an object',[]])('reports malformed optional JSON row %j rather than dropping it',value=>{
    const sample:any=createSampleImportJson();sample.Media=[value];const result=parseProductJson(JSON.stringify(sample));
    expect(result.models).toEqual([]);expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({sheet:'Media',row:1,message:expect.stringContaining('Media[0]'),correction:expect.any(String)})]));
  });
  it.each([null,{},'bad'])('reports invalid optional section shape %j',value=>{
    const sample:any=createSampleImportJson();sample.Booking_Questions=value;expect(parseProductJson(JSON.stringify(sample)).issues[0]).toMatchObject({sheet:'Booking_Questions',fatal:true});
  });
  it('reports a misspelled optional section and invalid products envelope',()=>{
    const sample:any=createSampleImportJson();sample.Medai=[];expect(parseProductJson(JSON.stringify(sample)).issues[0].message).toContain('Medai');
    expect(parseProductJson('{"products":{}}').issues[0].message).toContain('products must be an array');
  });
  it('counts malformed JSON rows towards the file limit',()=>{
    const sample:any=createSampleImportJson();sample.Media=Array.from({length:2001},()=>null);expect(parseProductJson(JSON.stringify(sample)).issues[0].message).toContain('2,000');
  });
  it('keeps valid products while explicitly reporting malformed products in a JSON envelope',()=>{
    const sample:any=createSampleImportJson(),bad={...sample,Media:[42]};
    const result=parseProductJson(JSON.stringify({products:[sample,bad]}));expect(result.models).toHaveLength(1);expect(result.issues.some(issue=>issue.sheet==='Media'&&issue.correction)).toBe(true);
    expect(parseProductJson(JSON.stringify({products:[sample]})).issues).toEqual([]);
  });
  it('rejects same-content products under different codes in Excel and JSON',()=>{
    const book=createSampleWorkbook();for(const name of book.SheetNames){const sheet=book.Sheets[name],rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet);XLSX.utils.sheet_add_json(sheet,rows.map(row=>({...row,product_code:'SECOND'})),{origin:-1,skipHeader:true});}
    expect(parseProductWorkbook(bytes(book))).toMatchObject({models:[],issues:expect.arrayContaining([expect.objectContaining({field:'product_name',fatal:true})])});
    const sample:any=createSampleImportJson(),other=JSON.parse(JSON.stringify(sample));other.Basic_Info[0].product_key='SECOND';
    for(const rows of Object.values(other))if(Array.isArray(rows))for(const row of rows)if(row&&typeof row==='object')row.product_key='SECOND';
    expect(parseProductJson(JSON.stringify({products:[sample,other]})).models).toEqual([]);
  });
  it('blocks unsupported image URLs with upload guidance while the shipped JSON sample remains valid',()=>{
    const sample:any=createSampleImportJson();expect(sample.Media).toEqual([]);expect(parseProductJson(JSON.stringify(sample)).issues).toEqual([]);
    sample.Media=[{kind:'IMAGE',external_url:'https://example.com/image.jpg'}];const result=parseProductJson(JSON.stringify(sample));expect(result.models).toEqual([]);expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({sheet:'Media',field:'external_url',fatal:true,correction:expect.stringContaining('file_asset_id')})]));
  });
});
