import * as XLSX from 'xlsx';
import { importChoices, importNumberRules, MAX_MONEY_AMOUNT, MONEY_AMOUNT_GUIDANCE } from '../../../../activity-saas-backend/src/common/product-import-contract';
import { DEFAULT_PRODUCT_DESTINATIONS, FIELD_GUIDANCE, PRODUCT_ENTRY_VERSION, PRODUCT_IMPORT_REQUIRED_FIELDS, PRODUCT_SUBTYPES, REQUIRED_FOR_REVIEW, type ProductDestination } from '../../../../activity-saas-backend/src/common/product-entry-contract';
import { createRateUpdateWorkbook, createSampleWorkbook } from './productImport';

const sections: Record<string,string> = { Products:'Basic_Info', Options:'Options', 'Ticket types':'Ticket_Types', Rates:'Rate_Plans', 'Time slots':'Availability' };
const xml = (value:string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const header = (value:unknown) => String(value??'').replace(/\s+\*$/,'');
const contrastTextFor=(hex:string)=>{const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722>0.179?'#111111':'#ffffff';};
export type TemplateCategory = { code:string; name:string; subcategories:Array<{code:string;name:string}> };
export type ProductTemplateOptions = { blank?:boolean; destinations?:ProductDestination[]; categories?:TemplateCategory[]; colors?:{primary:string;raised:string} };
const required:Record<string,string[]> = Object.fromEntries(Object.entries(sections).map(([sheet,section])=>[sheet,[...(PRODUCT_IMPORT_REQUIRED_FIELDS[section]||[]).map(field=>field==='product_key'?'product_code':field),...(sheet==='Products'?['full_description']:[])]]));
const marked=(name:string,field:string)=>(required[name]||[]).includes(field)||(REQUIRED_FOR_REVIEW[name]||[]).includes(field);
function moneyValidation(letter:string) {
  const cell=`${letter}2`,limit=`1${'0'.repeat(MAX_MONEY_AMOUNT.split('.')[0].length)}`;
  const formula=`IFERROR(AND(ISNUMBER(${cell}),${cell}>=0,${cell}<${limit},ROUND(${cell},4)=${cell}),FALSE)`;
  return `<dataValidation type="custom" errorStyle="stop" allowBlank="1" showErrorMessage="1" errorTitle="Invalid amount" error="${xml(MONEY_AMOUNT_GUIDANCE)}" sqref="${letter}2:${letter}2001"><formula1>${xml(formula)}</formula1></dataValidation>`;
}
function listRule(column:number,formula:string,prompt='Choose a value from the list.') {
  return `<dataValidation type="list" errorStyle="stop" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Choose an allowed value" error="${xml(prompt)}" promptTitle="Allowed values" prompt="${xml(prompt.slice(0,250))}" sqref="${XLSX.utils.encode_col(column)}2:${XLSX.utils.encode_col(column)}2001"><formula1>${xml(formula)}</formula1></dataValidation>`;
}

/** Preserve the application's SheetJS dependency and add standard OOXML features CE omits. */
function validatedBytes(workbook:XLSX.WorkBook,rules:(name:string,columns:string[])=>string[],colors={primary:'#8a4a20',raised:'#e1cbad'}):Uint8Array {
  const archive=XLSX.CFB.read(new Uint8Array(XLSX.write(workbook,{bookType:'xlsx',type:'array'})),{type:'buffer'});
  const find=(suffix:string)=>{const file=archive.FileIndex[archive.FullPaths.findIndex((path:string)=>path.endsWith(suffix))];if(!file)throw new Error(`Workbook part missing: ${suffix}`);return file;};
  const read=(file:any)=>new TextDecoder().decode(new Uint8Array(file.content));
  const write=(file:any,contents:string)=>{file.content=new TextEncoder().encode(contents);file.size=file.content.length;};
  let styleXml=read(find('/xl/styles.xml'));
  function append(tag:string,items:string[]) {let index=0;styleXml=styleXml.replace(new RegExp(`<${tag} count="(\\d+)"[^>]*>([\\s\\S]*?)</${tag}>`),(_match,total,body)=>{index=Number(total);return `<${tag} count="${index+items.length}">${body}${items.join('')}</${tag}>`;});return index;}
  const color=(value:string,fallback:string)=>/^#[0-9a-f]{6}$/i.test(value)?value.slice(1):fallback;
  const fonts=append('fonts',[colors.primary,colors.raised].map(value=>`<font><b/><sz val="11"/><color rgb="FF${color(contrastTextFor(value),'FFFFFF')}"/><name val="Calibri"/></font>`));
  const fills=append('fills',[colors.primary,colors.raised].map(value=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${color(value,'E1CBAD')}"/><bgColor indexed="64"/></patternFill></fill>`));
  const style=(font:number,fill:number)=>`<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyAlignment="1" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>`;
  const styles=append('cellXfs',[style(0,0),style(fonts,fills),style(fonts+1,fills+1)]);
  write(find('/xl/styles.xml'),styleXml);
  workbook.SheetNames.forEach((name,index)=>{
    const columns=(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1})[0]||[]).map(header);
    const file=find(`/xl/worksheets/sheet${index+1}.xml`);let contents=read(file);
    if(sections[name]||name==='Rates') {
      contents=contents.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,`<sheetViews><sheetView workbookViewId="0"><pane xSplit="${name==='Products'?2:1}" ySplit="1" topLeftCell="${name==='Products'?'C2':'B2'}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`);
      contents=contents.replace(/<c\b([^>]*?)>/g,(_match,attributes)=>{const ref=/\br="([A-Z]+)(\d+)"/.exec(attributes),column=ref?XLSX.utils.decode_col(ref[1]):-1;const selected=ref?.[2]==='1'?styles+(marked(name,columns[column])?1:2):styles;return `<c${attributes.replace(/\s+s="\d+"/,'')} s="${selected}">`;});
      // Column defaults cover newly typed/copied rows, including the genuinely blank template.
      contents=contents.replace(/<col\b([^>]*?)\/>/g,(_match,attributes)=>`<col${attributes.replace(/\s+style="\d+"/,'')} style="${styles}"/>`);
      const rowFormat=`<sheetFormatPr defaultRowHeight="${name==='Products'?96:48}" customHeight="1"/>`;
      contents=/<sheetFormatPr\b/.test(contents)?contents.replace(/<sheetFormatPr\b[^>]*\/>/,rowFormat):contents.replace(/<cols>|<sheetData>/,match=>rowFormat+match);
    } else {
      // Wrap the instruction and reference sheets too.
      contents=contents.replace(/<c\b([^>]*?)>/g,(_match,attributes)=>`<c${attributes.replace(/\s+s="\d+"/,'')} s="${styles}">`);
    }
    const validations=rules(name,columns);
    if(validations.length)contents=contents.replace(/<(?:ignoredErrors|drawing|legacyDrawing|pageMargins|pageSetup|headerFooter)\b|<\/worksheet>/,match=>`<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>${match}`);
    write(file,contents);
  });
  return new Uint8Array(XLSX.CFB.write(archive,{fileType:'zip',type:'array',compression:true}));
}
function formatSheets(workbook:XLSX.WorkBook,blank:boolean,rateUpdate=false) {
  for(const name of workbook.SheetNames) {
    if(!sections[name]&&name!=='Rates')continue;
    const sheet=workbook.Sheets[name],columns=(XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1})[0]||[]).map(header);
    if(blank){for(const key of Object.keys(sheet))if(/^[A-Z]+\d+$/.test(key)&&XLSX.utils.decode_cell(key).r>0)delete sheet[key];sheet['!ref']=`A1:${XLSX.utils.encode_col(columns.length-1)}1`;}
    sheet['!cols']=columns.map(field=>({wch:/description|instructions|terms|information|included|itinerary|policy|highlights/.test(field)?55:/name|point|address|product_code|option_code/.test(field)?30:24}));
    sheet['!rows']=Array.from({length:Math.max(12,XLSX.utils.decode_range(sheet['!ref']||'A1').e.r+1)},(_,index)=>({hpt:index===0?44:name==='Products'?96:48}));
    for(const [index,field]of columns.entries()) {const address=XLSX.utils.encode_cell({r:0,c:index}),isRequired=marked(name,field)||(rateUpdate&&index<4);if(isRequired)sheet[address]={...sheet[address],t:'s',v:`${field} *`};sheet[address].c=[{a:'Voya',t:FIELD_GUIDANCE[field]||(isRequired?'Required for import or before submission. See Field guide for the stage.':'Optional unless required by your selected product settings.')}];sheet[address].c!.hidden=true;}
  }
}
function addGuidance(workbook:XLSX.WorkBook,rateUpdate:boolean,blank:boolean) {
  const instructions=[['VOYA — '+(rateUpdate?'update existing rates':'create product drafts')],['Template version',PRODUCT_ENTRY_VERSION],['Format','One product per row. Copy and fill down; do not merge input cells or rename headers.'],['Required fields','* marks fields required for import or review. Field guide explains the stage. Incomplete content can be completed in the saved draft.'],['Which file?','Initial product creation includes options, rates and availability in ONE workbook. The separate rate-update file is only for later changes to existing rates.'],['Product references',rateUpdate?'Use existing generated product and option codes from Your products.':'product_code is your temporary import reference (e.g. WALK_001). Repeat it on linked sheets. Voya generates the permanent activity ID after import.'],['Blank versus sample',blank?'No sample products are included. Start entering your own data on row 2.':'Completed example: replace ALL sample rows across every linked sheet before importing.'],['Destinations','Choose Country → State / region → City. After changing a parent, reselect its dependent values. See Destinations for combinations; ask admin to add missing places. Upload checks stale or pasted values.'],['Duration','For review choose HOURS or DAYS with a positive duration_value, or FLEXIBLE without a number. Draft saving remains available.'],['Dropdowns','Dropdowns cover rows 2–2001. Pasted cells and CSV/JSON are checked again by the API.'],['Dates and times','Use YYYY-MM-DD and HH:mm. valid_to is exclusive; schedule effective_to is inclusive.'],['Lists','Use | between list items. The optional sub-category dropdown selects one tag from the selected category.'],['Money',MONEY_AMOUNT_GUIDANCE],['Rate currency','Bulk rate updates support INR only. For USD or other currencies use the advanced pricing editor. Blank retains a price; 0 sets it free. No currency conversion is performed.'],['Schedules','Repeat schedule settings, or leave later settings blank to inherit. Different settings need a different schedule_code.'],['Limits','200 products and 2,000 total data rows. Instructions, Field guide and lookup sheets do not count as data.'],['Next step','Upload → inspect errors and preview → validate → save drafts → complete missing content and submit for QC. No automatic publishing.']];
  const sheet=XLSX.utils.aoa_to_sheet(instructions);sheet['!cols']=[{wch:25},{wch:105}];sheet['!rows']=instructions.map(()=>({hpt:44}));XLSX.utils.book_append_sheet(workbook,sheet,'Instructions');workbook.SheetNames=['Instructions',...workbook.SheetNames.filter(name=>name!=='Instructions')];
  const guide=[['Sheet','Field','Required at','Explanation']];
  for(const name of workbook.SheetNames.filter(name=>sections[name]||name==='Rates'))for(const [index,field]of ((XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1})[0]||[]).map(header)).entries())guide.push([name,field,(required[name]||[]).includes(field)||(rateUpdate&&index<4)?'Import':(REQUIRED_FOR_REVIEW[name]||[]).includes(field)?'Review':field==='duration_value'?'Review with Hours / Days':'Optional / conditional',FIELD_GUIDANCE[field]||'Use the corresponding wizard section. Keep identifiers as text, including leading zeros.']);
  const help=XLSX.utils.aoa_to_sheet(guide);help['!cols']=[{wch:18},{wch:30},{wch:25},{wch:100}];XLSX.utils.book_append_sheet(workbook,help,'Field guide');
}
export function createRateUpdateTemplateBytes(options:Pick<ProductTemplateOptions,'colors'>={}):Uint8Array {
  const workbook=createRateUpdateWorkbook();formatSheets(workbook,true,true);addGuidance(workbook,true,true);
  return validatedBytes(workbook,(name,columns)=>name==='Rates'?['adult_sell_inr','child_sell_inr','senior_sell_inr','base_sell_inr','mrp_inr'].map(field=>moneyValidation(XLSX.utils.encode_col(columns.indexOf(field)))):[],options.colors);
}
export function createProductTemplateBytes(options:ProductTemplateOptions={}):Uint8Array {
  const workbook=createSampleWorkbook(),destinations=options.destinations||DEFAULT_PRODUCT_DESTINATIONS,lists=XLSX.utils.aoa_to_sheet([[]]);let listColumn=0;
  workbook.Workbook={...workbook.Workbook,Names:[]};
  const named=(name:string,values:readonly string[])=>{const col=XLSX.utils.encode_col(listColumn++);XLSX.utils.sheet_add_aoa(lists,[[name],...(values.length?values:['']).map(value=>[value])],{origin:`${col}1`});workbook.Workbook!.Names!.push({Name:name,Ref:`'Lists'!$${col}$2:$${col}$${Math.max(values.length,1)+1}`});};
  named('VOYA_EMPTY',['']);const countries=[...new Set(destinations.map(row=>row.country))].sort();named('VOYA_COUNTRIES',countries);
  countries.forEach((country,c)=>{const states=[...new Set(destinations.filter(row=>row.country===country).map(row=>row.state))].sort();named(`VOYA_C_${c}_STATES`,states);states.forEach((state,s)=>named(`VOYA_C_${c}_S_${s}_CITIES`,destinations.filter(row=>row.country===country&&row.state===state).map(row=>row.city).sort()));});
  const types=Object.keys(PRODUCT_SUBTYPES);named('VOYA_TYPES',types);types.forEach((type,index)=>named(`VOYA_TYPE_${index}_SUBTYPES`,PRODUCT_SUBTYPES[type]));
  const categories=options.categories||[];named('VOYA_CATEGORIES',categories.map(row=>row.code));categories.forEach((row,index)=>named(`VOYA_CATEGORY_${index}_TAGS`,row.subcategories.map(tag=>tag.code)));
  if(categories.length && !options.blank) {
    const columns=(XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Products,{header:1})[0]||[]);
    const selected=categories.find(row=>row.code==='DAY_TOURS_SIGHTSEEING')||categories[0];
    workbook.Sheets.Products[XLSX.utils.encode_cell({r:1,c:columns.indexOf('category')})]={t:'s',v:selected.code};
    workbook.Sheets.Products[XLSX.utils.encode_cell({r:1,c:columns.indexOf('sub_category')})]={t:'s',v:selected.subcategories[0]?.code||''};
  }
  const destinationSheet=XLSX.utils.json_to_sheet(destinations);destinationSheet['!cols']=[{wch:28},{wch:28},{wch:28}];XLSX.utils.book_append_sheet(workbook,destinationSheet,'Destinations');
  const categorySheet=XLSX.utils.json_to_sheet(categories.flatMap(row=>row.subcategories.length?row.subcategories.map(tag=>({category:row.code,category_name:row.name,sub_category:tag.code,sub_category_name:tag.name})):[{category:row.code,category_name:row.name,sub_category:'',sub_category_name:''}]));categorySheet['!cols']=[{wch:32},{wch:32},{wch:32},{wch:32}];XLSX.utils.book_append_sheet(workbook,categorySheet,'Categories');XLSX.utils.book_append_sheet(workbook,lists,'Lists');
  formatSheets(workbook,Boolean(options.blank));addGuidance(workbook,false,Boolean(options.blank));workbook.Workbook.Sheets=workbook.SheetNames.map(name=>({name,Hidden:name==='Lists'?1:0}));
  return validatedBytes(workbook,(name,columns)=>{
    const validations=Object.entries(importChoices[sections[name]]||{}).flatMap(([field,choices])=>{const column=columns.indexOf(field);return column<0?[]:[listRule(column,`"${choices.join(',')}"`,`Choose ${choices.join(', ')}.`)];});
    if(name==='Products') {
      const column=(field:string)=>XLSX.utils.encode_col(columns.indexOf(field)),country=`MATCH($${column('country')}2,VOYA_COUNTRIES,0)-1`,states=`INDIRECT("VOYA_C_"&(${country})&"_STATES")`;
      validations.push(listRule(columns.indexOf('country'),'VOYA_COUNTRIES'),listRule(columns.indexOf('state'),`INDIRECT(IFERROR("VOYA_C_"&(${country})&"_STATES","VOYA_EMPTY"))`),listRule(columns.indexOf('city'),`INDIRECT(IFERROR("VOYA_C_"&(${country})&"_S_"&(MATCH($${column('state')}2,${states},0)-1)&"_CITIES","VOYA_EMPTY"))`),listRule(columns.indexOf('sub_type'),`INDIRECT(IFERROR("VOYA_TYPE_"&(MATCH($${column('type')}2,VOYA_TYPES,0)-1)&"_SUBTYPES","VOYA_EMPTY"))`));
      if(categories.length)validations.push(listRule(columns.indexOf('category'),'VOYA_CATEGORIES'),listRule(columns.indexOf('sub_category'),`INDIRECT(IFERROR("VOYA_CATEGORY_"&(MATCH($${column('category')}2,VOYA_CATEGORIES,0)-1)&"_TAGS","VOYA_EMPTY"))`));
    }
    for(const [field,rule]of Object.entries(importNumberRules[sections[name]]||{})) {const index=columns.indexOf(field);if(index<0)continue;const letter=XLSX.utils.encode_col(index);if(rule.money){validations.push(moneyValidation(letter));continue;}const operator=rule.max!==undefined?'between':rule.exclusiveMin?'greaterThan':'greaterThanOrEqual',message=`Enter a ${rule.integer?'whole number':'number'} ${rule.exclusiveMin?'greater than':'at least'} ${rule.min}${rule.max===undefined?'':` and at most ${rule.max}`}.`;validations.push(`<dataValidation type="${rule.integer?'whole':'decimal'}" operator="${operator}" errorStyle="stop" allowBlank="1" showErrorMessage="1" errorTitle="Invalid number" error="${xml(message)}" sqref="${letter}2:${letter}2001"><formula1>${rule.min}</formula1>${rule.max===undefined?'':`<formula2>${rule.max}</formula2>`}</dataValidation>`);}
    return validations;
  },options.colors);
}
