const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'outputs/product-entry-20261128/client-workbooks');
require('tsx/cjs');const XLSX=require(path.join(root,'activity-saas-frontend/node_modules/xlsx')), {parseProductWorkbook}=require(path.join(root,'activity-saas-frontend/src/components/product-import/productImport.ts'));
const checks=[];
for(const blank of [true,false]){
 const name=blank?'voya-product-import-template.xlsx':'voya-product-import-sample.xlsx',data=fs.readFileSync(path.join(folder,name)),book=XLSX.read(data,{type:'buffer'}),zip=XLSX.CFB.read(data,{type:'buffer'}),part=suffix=>new TextDecoder().decode(new Uint8Array(zip.FileIndex[zip.FullPaths.findIndex(p=>p.endsWith(suffix))].content));
 assert.equal(book.SheetNames[0],'Instructions');assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Products).length,blank?0:1);
 assert(XLSX.utils.sheet_to_json(book.Sheets.Destinations).some(row=>row.city==='Athirappilly'&&row.state==='Kerala'&&row.country==='India'));
 const sheet=part('/xl/worksheets/sheet2.xml'),styles=part('/xl/styles.xml');
 assert(sheet.includes('defaultRowHeight="96"'));assert(sheet.includes('state="frozen"'));assert(sheet.includes('INDIRECT(IFERROR('));assert(styles.includes('FF8b504b'));assert(styles.includes('wrapText="1"'));assert(styles.includes('vertical="top"'));
 if(!blank){assert.equal(book.Sheets.Products.D2.v,'GUIDED_TOUR');assert.deepEqual(parseProductWorkbook(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)).issues,[]);}
 for(const [index,file]of zip.FullPaths.entries())if(file.endsWith('.vml'))assert(new TextDecoder().decode(new Uint8Array(zip.FileIndex[index].content)).includes('visibility:hidden'));
 checks.push({file:name,pass:true,blank,themePrimary:'#8b504b',currentAdminDestinationIncluded:true});
}
fs.writeFileSync(path.join(root,'outputs/product-entry-20261128/browser-download-verification.json'),JSON.stringify({pass:true,checks},null,2));console.log(JSON.stringify({pass:true,checks}));
