import * as XLSX from 'xlsx';
import { importChoices, importNumberRules } from '../../../../activity-saas-backend/src/common/product-import-contract';
import { createSampleWorkbook } from './productImport';

const sections: Record<string, string> = { Products: 'Basic_Info', Options: 'Options', 'Ticket types': 'Ticket_Types', Rates: 'Rate_Plans', 'Time slots': 'Availability' };
const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** SheetJS CE does not serialize validations. Add standard OOXML list rules to
 * its ZIP package using its bundled CFB writer, without a second spreadsheet library. */
export function createProductTemplateBytes(): Uint8Array {
  const workbook = createSampleWorkbook();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['VOYA product import — instructions'],
    ['One row per product in Products. Each product_code must be unique, ignoring letter case.'],
    ['Repeat the product_code in linked Options, Ticket types, Rates and Time slots rows.'],
    ['For one schedule_code, repeat its schedule settings or leave later settings blank to inherit the first row. Use a new schedule_code for different capacity, days or dates.'],
    ['Select dropdown values in controlled columns. Pasted values are checked again during upload.'],
    ['Prices must be non-negative numbers with up to 4 decimals. Duration must be greater than 0 when provided.'],
    ['Hours, Days and Flexible are the supported duration units. Use numeric duration_value with Hours or Days.'],
    ['Use YYYY-MM-DD for dates, HH:mm for times, and | to separate list entries.'],
    ['Keep product and option codes as text, including leading zeros. Do not rename sheet headers.'],
    ['Limits: 200 products and 2,000 data rows across all sheets. Dropdowns cover rows 2–2001.'],
    ['The workbook contains example data. Replace it with your products before importing.'],
    ['Upload, read the preview and error locations, validate, then confirm import. Products are saved as drafts.'],
    ['For an existing product, edit its draft or use the separate rate-update template for price changes.'],
  ]), 'Instructions');
  workbook.Sheets.Instructions['!cols'] = [{ wch: 120 }];
  const archive = XLSX.CFB.read(new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })), { type: 'buffer' });
  workbook.SheetNames.forEach((name, sheetIndex) => {
    const columns = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1 })[0] || [];
    const validations = Object.entries(importChoices[sections[name]] || {}).flatMap(([field, choices]) => {
      const column = columns.indexOf(field);
      if (column < 0) return [];
      const letter = XLSX.utils.encode_col(column);
      return [`<dataValidation type="list" errorStyle="stop" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Choose an allowed value" error="${xml(`Choose ${choices.join(', ')}.`)}" promptTitle="${xml(field)}" prompt="${xml(`Allowed: ${choices.join(', ')}`)}" sqref="${letter}2:${letter}2001"><formula1>${xml(`"${choices.join(',')}"`)}</formula1></dataValidation>`];
    });
    for (const [field, rule] of Object.entries(importNumberRules[sections[name]] || {})) {
      const column = columns.indexOf(field);
      if (column < 0) continue;
      const letter = XLSX.utils.encode_col(column);
      const operator = rule.max !== undefined ? 'between' : rule.exclusiveMin ? 'greaterThan' : 'greaterThanOrEqual';
      const message = `Enter a ${rule.integer ? 'whole number' : 'number'} ${rule.exclusiveMin ? 'greater than' : 'at least'} ${rule.min}${rule.max === undefined ? '' : ` and at most ${rule.max}`}.`;
      validations.push(`<dataValidation type="${rule.integer ? 'whole' : 'decimal'}" operator="${operator}" errorStyle="stop" allowBlank="1" showErrorMessage="1" errorTitle="Invalid number" error="${xml(message)}" sqref="${letter}2:${letter}2001"><formula1>${rule.min}</formula1>${rule.max === undefined ? '' : `<formula2>${rule.max}</formula2>`}</dataValidation>`);
    }
    if (!validations.length) return;
    const index = archive.FullPaths.findIndex((path: string) => path.endsWith(`/xl/worksheets/sheet${sheetIndex + 1}.xml`));
    if (index < 0) throw new Error(`Template worksheet is missing: ${name}`);
    const file = archive.FileIndex[index];
    const contents = new TextDecoder().decode(new Uint8Array(file.content));
    // dataValidations follows merged cells/autoFilter and precedes ignoredErrors.
    const tag = `<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>`;
    const insertion = /<(?:ignoredErrors|drawing|legacyDrawing|pageMargins|pageSetup|headerFooter)\b|<\/worksheet>/;
    file.content = new TextEncoder().encode(contents.replace(insertion, (match) => tag + match));
    file.size = file.content.length;
  });
  return new Uint8Array(XLSX.CFB.write(archive, { fileType: 'zip', type: 'array', compression: true }));
}
