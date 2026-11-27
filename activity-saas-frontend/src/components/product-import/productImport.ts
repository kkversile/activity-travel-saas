import { PRODUCT_IMPORT_REQUIRED_FIELDS } from '../../../../activity-saas-backend/src/common/product-entry-contract';
import * as XLSX from 'xlsx';
import { importMediaIssues, importProductCurrency, importProductContentKey, isImportDate, isMoneyAmount, MONEY_AMOUNT_GUIDANCE, normalizeImportChoices } from '../../../../activity-saas-backend/src/common/product-import-contract';
import { importSheetHeaders, inspectImportHeaders, normalizeImportHeader } from './productImportStructure';

export const IMPORT_SHEETS = ['Basic_Info', 'Experience', 'Options', 'Ticket_Types', 'Rate_Plans', 'Availability', 'Media', 'Booking_Questions', 'Fulfilment'] as const;
export const PROTOTYPE_IMPORT_SHEETS = ['Products', 'Options', 'Ticket types', 'Rates', 'Time slots'] as const;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_PRODUCTS = 200;

export type ImportRow = Record<string, unknown>;
export type ImportIssue = { sheet: string; row: number; message: string; fatal?: boolean; productKey?: string; rowData?: ImportRow; field?: string; cell?: string; path?: string; value?: string; correction?: string };
type RowSource = { sheet: string; row: number; columns: string[]; path?: string };
const rowSources = new WeakMap<ImportRow, RowSource>();
const rowChoiceIssues = new WeakMap<ImportRow, ImportIssue[]>();
function inheritSource(row: ImportRow, original: ImportRow): ImportRow {
  const source = rowSources.get(original);
  if (source) rowSources.set(row, source);
  if (rowChoiceIssues.has(original)) rowChoiceIssues.set(row, rowChoiceIssues.get(original)!);
  return row;
}
function locatedIssue(issue: ImportIssue): ImportIssue {
  const correction = issue.correction || (issue.message.startsWith('Unknown option_code:')
    ? 'Use an option_code from the Options sheet for this product. Add the option there first, or correct the reference.'
    : issue.message.startsWith('Duplicate option_code:')
      ? 'Keep one option row per option_code. Use a unique code for a different option and update its related rows.'
      : issue.message.startsWith('Duplicate rate_plan_code:')
        ? 'Use a unique rate_plan_code for each rate plan.'
        : issue.message.endsWith(' is required.') ? 'Fill in the required field, then upload the corrected file again.' : undefined);
  issue = { ...issue, correction };
  const source = issue.rowData && rowSources.get(issue.rowData);
  if (!source) return issue;
  const inferredField = /^([a-z_]+) (?:is required|must be)/.exec(issue.message)?.[1] || (issue.message.includes('option_code') ? 'option_code' : undefined);
  issue = { ...issue, field: issue.field || inferredField };
  const field = source.columns.includes(issue.field || '') ? issue.field : issue.field === 'product_key' && source.columns.includes('product_code') ? 'product_code' : undefined;
  const column = field ? source.columns.indexOf(field) : -1;
  return { ...issue, sheet: source.sheet, row: source.row, field: field || issue.field, ...(source.path ? {path: `${source.path}${issue.field ? `.${issue.field}` : ''}`} : {}), ...(column >= 0 ? { cell: XLSX.utils.encode_cell({ r: source.row - 1, c: column }) } : {}), message: issue.message.replaceAll('product_key', source.columns.includes('product_code') ? 'product_code' : 'product_key') };
}
function workbookRows(workbook: XLSX.WorkBook, name: string, headerRow = 0): ImportRow[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  const columns = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: headerRow, blankrows: true })[0] || []).map(normalizeImportHeader);
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { header: columns, range: headerRow + 1, defval: '' })
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''))
    .map((row) => {
      for (const field of ['valid_from', 'valid_to', 'effective_from', 'effective_to']) {
        if (typeof row[field] !== 'number') continue;
        const date = XLSX.SSF.parse_date_code(row[field] as number, { date1904: workbook.Workbook?.WBProps?.date1904 });
        if (date) row[field] = `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
      for (const field of ['start_time', 'end_time']) {
        const value = row[field];
        if (typeof value !== 'number' || value < 0 || value >= 1) continue;
        const minutes = Math.round(value * 1440);
        if (minutes < 1440 && Math.abs(minutes - value * 1440) < 0.000001) row[field] = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      }
      rowSources.set(row, { sheet: name, row: Number(row.__rowNum__) + 1, columns }); return row;
    });
}
export type ImportWorkbookModel = {
  basic: ImportRow;
  experience: ImportRow;
  options: ImportRow[];
  ticketTypes: ImportRow[];
  ratePlans: ImportRow[];
  availability: ImportRow[];
  media: ImportRow[];
  bookingQuestions: ImportRow[];
  fulfilment: ImportRow;
};
export type ProductImportParseResult = { model: ImportWorkbookModel | null; models: ImportWorkbookModel[]; issues: ImportIssue[] };
export type RateUpdateImportRow = { productCode: string; optionCode: string; validFrom: string; validTo: string; adultSellInr?: string; childSellInr?: string; seniorSellInr?: string; baseSellInr?: string; mrpInr?: string };
export type RateUpdateParseResult = { rows: RateUpdateImportRow[]; issues: ImportIssue[] };

function rowLimitIssue(sheet: string, rowCount: number): ImportIssue[] {
  return rowCount > MAX_IMPORT_ROWS ? [{ sheet, row: 1, message: `${sheet} has ${rowCount} data rows; the limit is 2,000.` }] : [];
}

function productLimitIssue(productCount: number): ImportIssue[] {
  return productCount > MAX_IMPORT_PRODUCTS ? [{ sheet: 'Import', row: 1, message: `This import has ${productCount} valid products; the batch limit is ${MAX_IMPORT_PRODUCTS}. Split it into smaller files.` }] : [];
}

function importRowCount(rows: Record<string, ImportRow[]>) {
  return Object.values(rows).reduce((sum, sectionRows) => sum + sectionRows.length, 0);
}

const demoRows: Record<string, ImportRow[]> = {
  Basic_Info: [{ product_key: 'MUNNAR_SUNRISE_SPICE', product_name: 'Munnar Sunrise Spice Garden Walk', type: 'ACTIVITY', sub_type: 'GUIDED TOUR', sub_category: 'Spice garden and guided nature walks', city: 'Munnar', state: 'Kerala', country: 'India', meeting_model: 'PICKUP_AVAILABLE', short_description: 'A guided sunrise walk through Munnar’s spice gardens with a local host, scenic viewpoints, plantation stories and a tasting of freshly grown spices and tea.', meeting_point: 'Munnar Spice Garden entrance', address: 'Munnar, Devikulam, Idukki, Kerala, 685612, India', latitude: 10.086996, longitude: 77.060091, labels: 'munnar|spice-garden|sunrise|guided-tour|family-friendly' }],
  Experience: [{ product_key: 'MUNNAR_SUNRISE_SPICE', full_description: 'Guests join a local host for a relaxed sunrise walk through Munnar’s spice-growing hills. The experience combines plantation stories, valley viewpoints, a short nature trail and a tasting of locally grown spices and tea. It is suitable for couples, families and small private groups.', highlights: 'Spice garden sunrise walk|Plantation stories|Valley viewpoints|Local spice and tea tasting', important_information: 'Wear comfortable walking shoes|Bring water|Expect uneven paths|Share dietary requirements before arrival', things_to_carry: 'Comfortable walking shoes|Sun protection|Reusable water bottle|Light rain layer', safety_measures: 'Stay with the host|Watch for uneven ground|Do not touch plantation equipment|Follow local weather guidance', terms: 'Tickets are non-transferable after the activity starts|Subject to weather and local access conditions|Children must be accompanied by an adult', how_to_redeem: 'Show the confirmation voucher to the host at the meeting point.|Arrive 15 minutes before the selected start time.', additional_information: 'Meeting point is outdoors.|Please share allergies or mobility requirements during booking.', metaname: 'Munnar Sunrise Spice Garden Walk' }],
  Options: [
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'SUNRISE-SHARED', option_name: 'Sunrise Shared Spice Walk', description: 'A shared sunrise walk with plantation stories, scenic viewpoints and a local spice and tea tasting.', duration_minutes: 120, sharing: 'Shared', vehicle_guide_type: 'Local naturalist guide', pickup_included: true, pickup_type: 'Hotel pickup within Munnar', pickup_instructions: 'Host confirms the exact pickup point by phone one day before the walk.', pickup_timings: '06:00-06:30', dropoff_included: false, meal_included: false, inclusions: 'Guided nature walk|Spice garden visit|Tea tasting|Hotel pickup', exclusions: 'Personal expenses|Gratuities|Meals not listed', suitable_for: 'Couples|Families|Small groups|Nature lovers' },
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'PRIVATE-SPICE-WALK', option_name: 'Private Spice Garden Walk', description: 'A private guided sunrise walk for one group with a dedicated host, flexible pacing and a private spice and tea tasting.', duration_minutes: 150, sharing: 'Private', vehicle_guide_type: 'Dedicated local naturalist guide', pickup_included: true, pickup_type: 'Private hotel pickup within Munnar', pickup_instructions: 'Dedicated host confirms the exact pickup point by phone one day before the walk.', pickup_timings: '05:45-06:15', dropoff_included: false, meal_included: false, inclusions: 'Private guided walk|Spice garden visit|Private tea tasting|Hotel pickup', exclusions: 'Personal expenses|Gratuities|Meals not listed', suitable_for: 'Couples|Families|Private groups|Celebrations' },
  ],
  Ticket_Types: [
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'SUNRISE-SHARED', ticket_type: 'Adult', age_from: 13, age_to: '', needs_adult: false, counts_capacity: true },
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'SUNRISE-SHARED', ticket_type: 'Child', age_from: 5, age_to: 12, needs_adult: true, counts_capacity: true },
  ],
  Rate_Plans: [
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'SUNRISE-SHARED', rate_plan_code: 'RP-SHARED-ADULT-CHILD', rate_plan_name: 'Shared Adult and Child Rate', description: 'Shared per-person pricing for adults and children.', currency: 'INR', valid_from: '2026-10-24', valid_to: '2027-10-24', min_pax: 1, max_pax: 15, cutoff_minutes: 1440, pricing_unit: 'PER_PERSON', booking_mode: 'INSTANT', supplier_model: 'NET_RATE', supplier_base_amount: 0, adult_price: 1800, child_price: 900, senior_price: 1400, mrp_mode: 'YES', mrp_amount: 2200, mrp_proof: '', adult_min_count: 1, adult_max_count: 15, child_min_count: 0, child_max_count: 15, cancel_7_days_pct: 0, cancel_3_days_pct: 50, cancel_0_days_pct: 100 },
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'PRIVATE-SPICE-WALK', rate_plan_code: 'RP-PRIVATE-GROUP', rate_plan_name: 'Private Group Rate', description: 'Private group pricing for one booking of up to six guests.', currency: 'INR', valid_from: '2026-10-24', valid_to: '2027-10-24', min_pax: 1, max_pax: 6, cutoff_minutes: 1440, pricing_unit: 'GROUP', booking_mode: 'INSTANT', supplier_model: 'NET_RATE', supplier_base_amount: 7200, mrp_mode: 'YES', mrp_amount: 8500, mrp_proof: '', adult_min_count: 0, adult_max_count: 6, group_min_count: 1, group_max_count: 6, cancel_7_days_pct: 0, cancel_3_days_pct: 50, cancel_0_days_pct: 100 },
  ],
  Availability: [
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'SUNRISE-SHARED', schedule_code: 'SCH-SUNRISE-SHARED', schedule_name: 'Sunrise shared walk daily slots', operating_model: 'MULTIPLE_SLOTS', timezone: 'Asia/Kolkata', effective_from: '2026-10-24', effective_to: '2027-10-24', operating_days: 'MON|TUE|WED|THU|FRI|SAT|SUN', capacity_unit: 'PERSON', default_capacity: 15, start_time: '06:30', end_time: '08:30', materialize: true },
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'PRIVATE-SPICE-WALK', schedule_code: 'SCH-SUNRISE-PRIVATE', schedule_name: 'Private sunrise walk daily slots', operating_model: 'MULTIPLE_SLOTS', timezone: 'Asia/Kolkata', effective_from: '2026-10-24', effective_to: '2027-10-24', operating_days: 'MON|TUE|WED|THU|FRI|SAT|SUN', capacity_unit: 'PERSON', default_capacity: 6, start_time: '06:00', end_time: '08:30', materialize: true },
  ],
  Media: [],
  Booking_Questions: [{ product_key: 'MUNNAR_SUNRISE_SPICE', code: 'lead_phone', label: 'Lead traveller phone', type: 'TEXT', required: true, applies_per_traveller: false, rank: 1 }, { product_key: 'MUNNAR_SUNRISE_SPICE', code: 'dietary_requirements', label: 'Dietary or allergy requirements', type: 'TEXT', required: false, applies_per_traveller: false, rank: 2 }],
  Fulfilment: [{ product_key: 'MUNNAR_SUNRISE_SPICE', mode: 'AUTO', operations_contact_name: 'Munnar Spice Garden Operations', operations_contact_phone: '+919876543210', operations_contact_email: 'operations@abcactivities.example', emergency_contact_name: 'Munnar Activity Host', emergency_contact_phone: '+919876543211', emergency_contact_email: 'emergency@abcactivities.example', voucher_notes: 'Host will confirm pickup details one day before the experience.|Please arrive 15 minutes before the selected start time.', review_required: false }],
};

const sheetNotes: Record<string, string> = {
  Basic_Info: 'One row per product. Use the product_key to link all other sheets.',
  Experience: 'One row per product. Separate list values with | (pipe).',
  Options: 'One row per option. option_code must be unique within the workbook.',
  Ticket_Types: 'One row per ticket type. Link rows with product_key and option_code.',
  Rate_Plans: 'One row per rate plan. option_code must match Options.',
  Availability: 'One row per schedule. operating_days uses | (pipe).',
  Media: 'Images need an uploaded, validated file_asset_id. Video URLs or uploaded video assets are supported. Add images in the product editor after import.',
  Booking_Questions: 'One row per booking question.',
  Fulfilment: 'One row per product. AUTO is the simplest vendor fulfilment mode.',
};

export function createSampleWorkbook() {
  const workbook = XLSX.utils.book_new();
  const products: ImportRow[] = demoRows.Basic_Info.map((row, index) => ({ ...row, full_description: demoRows.Experience[index]?.full_description, highlights: demoRows.Experience[index]?.highlights, important_information: demoRows.Experience[index]?.important_information }));
  const linked = (sheet: string): ImportRow[] => (demoRows[sheet] || []).map((row) => ({ product_code: row.product_key, ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'product_key')) }));
  const prototypeRows: Record<string, ImportRow[]> = {
    Products: products.map((row) => ({ product_code: row['product_key'], product_name: row['product_name'], type: row['type'], sub_type: String(row['sub_type'] || '').trim().toUpperCase().replace(/[\s-]+/g, '_'), sub_category: 'CITY_TOURS', city: row['city'], state: row['state'], country: row['country'], meeting_model: row['meeting_model'], short_description: row['short_description'], full_description: row['full_description'], meeting_point: row['meeting_point'], address: row['address'], latitude: row['latitude'], longitude: row['longitude'], duration_value: '2', duration_unit: 'HOURS', guide_included: 'WITH_GUIDE', guide_languages: 'English|Hindi', included: 'Guided nature walk|Spice garden visit|Tea tasting', not_included: 'Personal expenses|Meals not listed', end_point: 'Munnar Spice Garden entrance', things_to_know: 'Wear comfortable walking shoes; paths may be uneven.', accessibility: 'Uneven terrain', follow_itinerary: true, itinerary_stops_json: JSON.stringify([{ stopName: 'Spice garden entrance', stopType: 'MEETING_POINT', stayDurationMinutes: 15, travelTimeToNextMinutes: 10, ticketPolicy: 'Included' }, { stopName: 'Tea tasting pavilion', stopType: 'guided', stayDurationMinutes: 25, ticketPolicy: 'Included' }]), voucher_code_source: 'PLATFORM', voucher_accepted_as: 'MOBILE_VOUCHER', voucher_instructions: 'Show the confirmation voucher to the host at the meeting point.', cancellation_preset: 'MODERATE', traveller_details: 'Lead name|Mobile', amendment_policy: 'DATE_CHANGE_24H', labels: row['labels'], highlights: row['highlights'], important_information: row['important_information'], things_to_carry: row['things_to_carry'], safety_measures: row['safety_measures'], terms: row['terms'], how_to_redeem: row['how_to_redeem'], additional_information: row['additional_information'], currency: row['currency'] || '', category: 'DAY_TOURS_SIGHTSEEING' })),
    Options: linked('Options'),
    'Ticket types': linked('Ticket_Types'),
    Rates: linked('Rate_Plans').map(({ product_code, ...row }) => ({ product_code, ...row })),
    'Time slots': linked('Availability').flatMap((row) => [
      { ...row, slot_code: row['start_time'], start_time: row['start_time'], end_time: row['end_time'] },
      { ...row, slot_code: '09:00', start_time: '09:00', end_time: '10:00' },
    ]),
  };
  for (const sheet of PROTOTYPE_IMPORT_SHEETS) {
    const rows = prototypeRows[sheet] || [];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(workbook, ws, sheet);
  }
  return workbook;
}

export function createSampleImportJson() {
  return {
    README: [
      'VOYA vendor product import template',
      'Edit the demo rows, keep the section names and field names, then upload this JSON from Products.',
      'The upload creates a DRAFT product. Review it in the normal six-step wizard and submit it manually.',
      'List fields use | as the separator. Boolean values use true or false. Dates use YYYY-MM-DD.',
    'Images require an uploaded, validated image asset. Add images in the product editor after creating the draft, or use an owned file_asset_id.',
    ],
    ...Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, (demoRows[sheet] || []).map((row) => ({ ...row }))])),
  };
}

export function createSampleImportCsv() {
  const workbook = createSampleWorkbook();
  const rows = PROTOTYPE_IMPORT_SHEETS.flatMap((section) => XLSX.utils.sheet_to_json<ImportRow>(workbook.Sheets[section], { defval: '' }).map((row) => ({ section, ...row })));
  return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
}

const requiredImportFields = PRODUCT_IMPORT_REQUIRED_FIELDS;
const prototypeSections: Record<string, string> = { Products: 'Basic_Info', Options: 'Options', 'Ticket types': 'Ticket_Types', Rates: 'Rate_Plans', 'Time slots': 'Availability' };
export const looksLikeProductWorkbook = (names: string[]) => names.some((name) => ['Products', 'Options', 'Ticket types', 'Time slots', 'Basic_Info', 'Experience', 'Rate_Plans', 'Availability'].includes(name));

function workbookStructure(workbook: XLSX.WorkBook): { prototype: boolean; issues: ImportIssue[] } {
  const prototype = !workbook.SheetNames.includes('Basic_Info') && workbook.SheetNames.some((name) => ['Products', 'Ticket types', 'Rates', 'Time slots'].includes(name));
  const legacy = workbook.SheetNames.some((name) => ['Basic_Info', 'Experience', 'Rate_Plans', 'Availability'].includes(name));
  if (!prototype && !legacy) return { prototype, issues: [{ sheet: 'Workbook', row: 1, message: 'This workbook does not match a product import template.', correction: 'Download a fresh product template. Keep the Products, Options, Ticket types, Rates and Time slots sheet names.', fatal: true }] };
  const requiredSheets = prototype ? [...PROTOTYPE_IMPORT_SHEETS] : ['Basic_Info', 'Experience', 'Options', 'Rate_Plans', 'Availability'];
  const missing = requiredSheets.filter((name) => !workbook.Sheets[name]);
  if (missing.length) return { prototype, issues: missing.map((sheet) => ({ sheet, row: 1, message: `Missing required sheet: ${sheet}.`, correction: `Restore the sheet name ${sheet}, or download a fresh template and copy your data into it.`, fatal: true })) };
  const template = createSampleWorkbook();
  const issues: ImportIssue[] = [];
  for (const sheet of (prototype ? PROTOTYPE_IMPORT_SHEETS : IMPORT_SHEETS)) {
    if (!workbook.Sheets[sheet]) continue;
    const headerRow = prototype ? 1 : 3;
    const columns = importSheetHeaders(workbook, sheet, headerRow);
    if (!columns.some(Boolean) && !requiredSheets.includes(sheet)) continue;
    const section = prototype ? prototypeSections[sheet] : sheet;
    let allowed = prototype ? importSheetHeaders(template, sheet, 1) : [...new Set((demoRows[sheet] || []).flatMap(Object.keys))];
    if (!prototype && sheet === 'Basic_Info') allowed = [...new Set([...allowed, ...importSheetHeaders(template, 'Products', 1).filter((field) => field !== 'product_code')])];
    if (!prototype && sheet === 'Options') allowed.push('dropoff_timings', 'points_of_interest', 'pricing_days', 'meal_type', 'meal_variety', 'menu', 'seo_title', 'seo_description');
    if (!prototype && sheet === 'Availability') allowed.push('slots_json');
    if (!prototype && sheet === 'Media') allowed.push('product_key','kind','external_url','file_asset_id','description','rank');
    const required = [...(requiredImportFields[section] || [])].map((field) => prototype && field === 'product_key' ? 'product_code' : field);
    if (prototype && sheet === 'Products') required.push('full_description');
    issues.push(...inspectImportHeaders(sheet, columns, allowed, required, headerRow));
  }
  return { prototype, issues };
}

function csvHeaderIssues(workbook: XLSX.WorkBook): ImportIssue[] {
  const template = createSampleWorkbook();
  const allowed = [...new Set(['section', 'sheet', ...PROTOTYPE_IMPORT_SHEETS.flatMap((name) => importSheetHeaders(template, name, 1)), ...Object.values(demoRows).flatMap((rows) => rows.flatMap(Object.keys)), 'slots_json', 'kind', 'external_url', 'file_asset_id', 'description', 'rank'])];
  return inspectImportHeaders('CSV', importSheetHeaders(workbook, workbook.SheetNames[0], 1), allowed, [], 1);
}

const rateUpdateHeaders = ['product_code', 'option_code', 'valid_from', 'valid_to', 'adult_sell_inr', 'child_sell_inr', 'senior_sell_inr', 'base_sell_inr', 'mrp_inr'];
const ratePriceHeaders = ['adult_sell_inr', 'child_sell_inr', 'senior_sell_inr', 'base_sell_inr'];
const rateFields: Record<string,string> = {productCode:'product_code',optionCode:'option_code',validFrom:'valid_from',validTo:'valid_to',adultSellInr:'adult_sell_inr',childSellInr:'child_sell_inr',seniorSellInr:'senior_sell_inr',baseSellInr:'base_sell_inr',mrpInr:'mrp_inr'};
const rateOriginalRows = new WeakMap<RateUpdateImportRow, ImportRow>();

export function createRateUpdateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const readme = XLSX.utils.aoa_to_sheet([
    ['VOYA vendor rate update template'],
    ['Fill one row per existing product option. Use product and option codes from Your products.'],
    ['Rates are preview-validated for all rows before any update is applied.'],
    ['validTo is exclusive. Leave child/senior prices blank to retain the current values.'],
    [MONEY_AMOUNT_GUIDANCE],
    ['Blank retains the current price; 0 sets an explicit free price. Other traveller categories and foreign visitor prices are retained.'],
  ]);
  XLSX.utils.book_append_sheet(workbook, readme, 'README');
  const rates = XLSX.utils.aoa_to_sheet([rateUpdateHeaders]);
  rates['!cols'] = Array.from({ length: 9 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(workbook, rates, 'Rates');
  return workbook;
}

export function createRateUpdateTemplateCsv() {
  return `${rateUpdateHeaders.join(',')}\r\n`;
}

function rateHeaderIssues(workbook: XLSX.WorkBook, name: string, displayName = 'Rates'): ImportIssue[] {
  const columns = importSheetHeaders(workbook, name, 1);
  const issues = inspectImportHeaders(displayName, columns, rateUpdateHeaders, rateUpdateHeaders.slice(0, 4), 1);
  if (!columns.some((column) => ratePriceHeaders.includes(column))) issues.push({ sheet: displayName, row: 1, message: 'Missing sell-price column.', correction: `Include at least one of ${ratePriceHeaders.join(', ')} from the rate-update template.`, fatal: true });
  return issues;
}

function normalizeRateRows(sourceRows: ImportRow[]): RateUpdateParseResult {
  const rows: RateUpdateImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  sourceRows.forEach((source, index) => {
    const rowNumber = rowSources.get(source)?.row || index + 2;
    const productCode = text(source, 'product_code');
    const optionCode = text(source, 'option_code');
    const dateText = (value: unknown) => {
      if (typeof value !== 'number') return text({ value }, 'value');
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return '';
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    };
    const validFrom = dateText(source.valid_from);
    const validTo = dateText(source.valid_to);
    const row: RateUpdateImportRow = {
      productCode, optionCode, validFrom, validTo,
      ...(text(source, 'adult_sell_inr') ? { adultSellInr: text(source, 'adult_sell_inr') } : {}),
      ...(text(source, 'child_sell_inr') ? { childSellInr: text(source, 'child_sell_inr') } : {}),
      ...(text(source, 'senior_sell_inr') ? { seniorSellInr: text(source, 'senior_sell_inr') } : {}),
      ...(text(source, 'base_sell_inr') ? { baseSellInr: text(source, 'base_sell_inr') } : {}),
      ...(text(source, 'mrp_inr') ? { mrpInr: text(source, 'mrp_inr') } : {}),
    };
    const identity = `${productCode.toUpperCase()}::${optionCode.toUpperCase()}`;
    let invalid = false;
    const problem = (message: string, field?: string, correction = 'Correct this value in the rate-update template, then upload the file again.') => { issues.push(locatedIssue({sheet:'Rates',row:rowNumber,message,field,value:field?String(source[field] ?? ''):undefined,correction,fatal:false,rowData:source})); invalid = true; };
    if (!productCode) problem('product_code is required.','product_code','Copy an existing product code from Your products.');
    if (!optionCode) problem('option_code is required.','option_code','Copy an option code belonging to this product.');
    if (!isImportDate(validFrom)) problem('valid_from must be a real calendar date in YYYY-MM-DD format.','valid_from','Enter a real date, for example 2026-12-15.');
    if (!isImportDate(validTo)) problem('valid_to must be a real calendar date in YYYY-MM-DD format.','valid_to','Enter a real date later than valid_from; the end date is exclusive.');
    if (isImportDate(validFrom) && isImportDate(validTo) && validTo <= validFrom) problem('valid_to must be after valid_from.','valid_to','Choose an end date later than valid_from; the end date is exclusive.');
    if (![row.adultSellInr, row.childSellInr, row.seniorSellInr, row.baseSellInr].some(Boolean)) problem('Provide at least one sell price.');
    for (const field of ['adultSellInr', 'childSellInr', 'seniorSellInr', 'baseSellInr', 'mrpInr'] as const) {
      const value = row[field];
      if (value !== undefined && !isMoneyAmount(value)) problem(`${rateFields[field]} must be a non-negative amount within the supported range, with up to four decimals.`,rateFields[field],MONEY_AMOUNT_GUIDANCE);
    }
    if (seen.has(identity)) problem('Only one row per product option is allowed in this rate batch.','option_code','Keep one rate row for each product and option pair.');
    seen.add(identity);
    if (!invalid) { rateOriginalRows.set(row,source); rows.push(row); }
  });
  if (!rows.length && !issues.length) issues.push({ sheet: 'Rates', row: 1, message: 'Add at least one rate update row.' });
  if (!rows.length && issues.length) issues.push({ sheet: 'Rates', row: 1, message: 'No rate rows passed validation.' });
  return { rows, issues };
}

export function parseRateUpdateCsv(csv: string, expectedRateUpdate = false): RateUpdateParseResult | null {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(csv, { type: 'string', cellDates: false, raw: true }); } catch { return null; }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const headers = importSheetHeaders(workbook, workbook.SheetNames[0], 1).map((header) => header.trim().toLowerCase());
  const isRateUpdate = !headers.includes('section') && !headers.includes('sheet') &&
    (headers.some((header) => /^(adult|child|senior|base)_sell(?:_|$)/.test(header)) || headers.includes('mrp_inr') || headers.filter((header) => rateUpdateHeaders.slice(0, 4).includes(header)).length >= 2);
  if (headers.includes('section') || headers.includes('sheet') || (!isRateUpdate && !expectedRateUpdate)) return null;
  const headerIssues = rateHeaderIssues(workbook, workbook.SheetNames[0], 'CSV');
  if (headerIssues.length) return { rows: [], issues: headerIssues };
  const rows = workbookRows(workbook, workbook.SheetNames[0]);
  for (const row of rows) { const source=rowSources.get(row); if(source) rowSources.set(row,{...source,sheet:'CSV'}); }
  const limitIssues = rowLimitIssue('Rates', rows.length);
  return limitIssues.length ? { rows: [], issues: limitIssues } : normalizeRateRows(rows);
}

export function parseRateUpdateWorkbook(buffer: ArrayBuffer, expectedRateUpdate = false): RateUpdateParseResult | null {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: 'array', cellDates: false }); } catch { return null; }
  const sheet = workbook.Sheets.Rates;
  if (!sheet) return expectedRateUpdate ? { rows: [], issues: [{ sheet: 'Rates', row: 1, message: 'Missing required sheet: Rates.', correction: 'Restore the Rates sheet name or copy your data into a fresh rate-update template.', fatal: true }] } : null;
  const headerIssues = rateHeaderIssues(workbook, 'Rates');
  if (headerIssues.length) return { rows: [], issues: headerIssues };
  const rows = workbookRows(workbook, 'Rates');
  const limitIssues = rowLimitIssue('Rates', rows.length);
  return limitIssues.length ? { rows: [], issues: limitIssues } : normalizeRateRows(rows);
}

function sheetRows(workbook: XLSX.WorkBook, name: string): ImportRow[] {
  return workbookRows(workbook, name, 2);
}

function prototypeRowsToImport(rows: Record<string, ImportRow[]>) {
  const sections: Record<string, string> = { Products: 'Basic_Info', Options: 'Options', 'Ticket types': 'Ticket_Types', Rates: 'Rate_Plans', 'Time slots': 'Availability' };
  rows = Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, values.map((original) => {
    const normalized = normalizeImportChoices(sections[name], original);
    const row = inheritSource(normalized.row, original);
    rowChoiceIssues.set(row, normalized.issues.map((issue) => ({ ...issue, sheet: sections[name], row: 0, rowData: row })));
    return row;
  })]));
  const products = rows.Products.map((row) => inheritSource({ product_key: row.product_code, product_name: row.product_name, currency: row.currency, type: row.type, sub_type: row.sub_type, category: row.category, sub_category: row.sub_category, city: row.city, state: row.state, country: row.country, meeting_model: row.meeting_model, short_description: row.short_description, meeting_point: row.meeting_point, address: row.address, latitude: row.latitude, longitude: row.longitude, duration_value: row.duration_value, duration_unit: row.duration_unit, guide_included: row.guide_included, guide_languages: row.guide_languages, included: row.included, not_included: row.not_included, end_point: row.end_point, things_to_know: row.things_to_know, accessibility: row.accessibility, follow_itinerary: row.follow_itinerary, itinerary_stops_json: row.itinerary_stops_json, voucher_code_source: row.voucher_code_source, voucher_accepted_as: row.voucher_accepted_as, voucher_instructions: row.voucher_instructions, cancellation_preset: row.cancellation_preset, traveller_details: row.traveller_details, amendment_policy: row.amendment_policy, labels: row.labels }, row));
  const experience = rows.Products.map((row) => inheritSource({ product_key: row.product_code, full_description: row.full_description, highlights: row.highlights, important_information: row.important_information, things_to_carry: row.things_to_carry, safety_measures: row.safety_measures, terms: row.terms, how_to_redeem: row.how_to_redeem, additional_information: row.additional_information }, row));
  const mapLinked = (sheet: string, map: (row: ImportRow) => ImportRow = (row) => row) => rows[sheet].map((row) => inheritSource({ product_key: row.product_code, ...map(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'product_code'))) }, row));
  const scheduleGroups = new Map<string, ImportRow[]>();
  for (const row of rows['Time slots']) {
    const identity = [row.product_code, row.option_code, row.schedule_code].map((value) => String(value ?? '').trim().toUpperCase()).join('::');
    scheduleGroups.set(identity, [...(scheduleGroups.get(identity) || []), row]);
  }
  const schedules = [...scheduleGroups.values()].map((group) => {
    const first = group[0];
    const conflicts: ImportIssue[] = [];
    const scheduleFields = ['schedule_name', 'operating_model', 'timezone', 'effective_from', 'effective_to', 'operating_days', 'capacity_unit', 'default_capacity', 'materialize'];
    const comparable = (row: ImportRow, field: string) => {
      const value = text(row, field);
      if (field === 'operating_days') return value.split('|').map((day) => day.trim()).filter(Boolean).sort().join('|');
      if (field === 'default_capacity' && value !== '' && Number.isFinite(Number(value))) return String(Number(value));
      return value;
    };
    for (const row of group.slice(1)) {
      for (const field of scheduleFields) {
        // Blank later cells inherit the first row. Explicit differing values
        // must never disappear while the rows are combined into one schedule.
        if (!text(row, field) || comparable(row, field) === comparable(first, field)) continue;
        if ((rowChoiceIssues.get(row) || []).some((issue) => issue.field === field) || (rowChoiceIssues.get(first) || []).some((issue) => issue.field === field)) continue;
        const reference = locatedIssue({ sheet: 'Availability', row: 3, field, rowData: first, message: '' });
        const firstLocation = `${reference.sheet}!${reference.cell || `row ${reference.row}`}`;
        conflicts.push({ sheet: 'Availability', row: 0, field, value: text(row, field), rowData: row, fatal: true,
          message: `Conflicting ${field} for schedule ${text(first, 'schedule_code')}. The first row at ${firstLocation} uses “${text(first, field) || '(blank)'}”.`,
          correction: `Use the same ${field} on every row of this product/option/schedule, or use a different schedule_code for a separate schedule.` });
      }
    }
    const { product_code: _productCode, ...schedule } = first;
    const slots = group.map((slot, index) => ({ slotCode: slot.slot_code || slot.start_time, startTime: slot.start_time, endTime: slot.end_time, rank: index }));
    const result = inheritSource({ product_key: first.product_code, ...schedule, slots_json: JSON.stringify(slots) }, first);
    rowChoiceIssues.set(result, [...group.flatMap((row) => rowChoiceIssues.get(row) || []), ...conflicts]);
    return result;
  });
  const grouped: Record<string, ImportRow[]> = {
    Basic_Info: products,
    Experience: experience,
    Options: mapLinked('Options'),
    Ticket_Types: mapLinked('Ticket types'),
    Rate_Plans: mapLinked('Rates'),
    Availability: schedules,
    Media: [], Booking_Questions: [], Fulfilment: [],
  };
  return grouped;
}

function prototypeWorkbookRows(workbook: XLSX.WorkBook) {
  return prototypeRowsToImport(Object.fromEntries(PROTOTYPE_IMPORT_SHEETS.map((name) => [name, workbookRows(workbook, name)])));
}

function text(row: ImportRow, key: string) { return String(row[key] ?? '').trim(); }
function list(row: ImportRow, key: string) { return text(row, key).split('|').map((value) => value.trim()).filter(Boolean); }
function bool(row: ImportRow, key: string, fallback = false) { const value = text(row, key).toLowerCase(); return value ? ['true', 'yes', '1', 'y'].includes(value) : fallback; }
function number(row: ImportRow, key: string, fallback?: number) { const value = Number(row[key]); return Number.isFinite(value) ? value : fallback; }

function validateImportRows(rows: Record<string, ImportRow[]>): { model: ImportWorkbookModel | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  rows = Object.fromEntries(Object.entries(rows).map(([sheet, values]) => [sheet, values.map((original, index) => {
    const normalized = normalizeImportChoices(sheet, original);
    const row = inheritSource(normalized.row, original);
    const sourceIssues = (rowChoiceIssues.get(row) || []).filter((issue) => issue.sheet === sheet);
    issues.push(...sourceIssues.map((issue) => ({ ...issue, sheet, row: index + 3 })));
    issues.push(...normalized.issues.filter((issue) => !sourceIssues.some((source) => source.field === issue.field && source.value === issue.value)).map((issue) => ({ ...issue, sheet, row: index + 3, rowData: row })));
    return row;
  })]));
  const basicRows = rows.Basic_Info || [];
  const experienceRows = rows.Experience || [];
  const options = rows.Options || [];
  const ticketTypes = rows.Ticket_Types || [];
  const ratePlans = rows.Rate_Plans || [];
  const availability = rows.Availability || [];
  const media = rows.Media || [];
  const bookingQuestions = rows.Booking_Questions || [];
  const fulfilmentRows = rows.Fulfilment || [];
  if (basicRows.length !== 1) issues.push({ sheet: 'Basic_Info', row: 3, message: 'Provide exactly one product row.' });
  const basic = basicRows[0] || {};
  const currency = importProductCurrency(basic, ratePlans);
  if (currency.issue) issues.push({ sheet: 'Basic_Info', row: 3, rowData: basic, ...currency.issue });
  else basic.currency = currency.currency;
  const key = text(basic, 'product_key');
  const requiredBasic = PRODUCT_IMPORT_REQUIRED_FIELDS.Basic_Info;
  requiredBasic.forEach((field) => { if (!text(basic, field)) issues.push({ sheet: 'Basic_Info', row: 3, message: `${field} is required.` }); });
  if (!experienceRows.length) issues.push({ sheet: 'Experience', row: 3, message: 'Add one Experience row.' });
  if (experienceRows.length > 1) issues.push({ sheet: 'Experience', row: 4, message: 'Provide only one Experience row for this import.' });
  if (experienceRows.length === 1 && !text(experienceRows[0], 'full_description')) issues.push({ sheet: 'Experience', row: 3, message: 'full_description is required.' });
  const itineraryJson = text(basic, 'itinerary_stops_json');
  if (itineraryJson) {
    try {
      const stops = JSON.parse(itineraryJson);
      if (!Array.isArray(stops) || stops.some((stop) => !stop || typeof stop !== 'object' || !String(stop.stopName || '').trim() || ['stayDurationMinutes', 'travelTimeToNextMinutes'].some((field) => stop[field] !== undefined && stop[field] !== '' && (!Number.isInteger(Number(stop[field])) || Number(stop[field]) < 0)))) throw new Error();
    } catch { issues.push({ sheet: 'Basic_Info', row: 3, message: 'itinerary_stops_json must be a JSON array of named stops with non-negative whole-minute durations.' }); }
  }
  if (!options.length) issues.push({ sheet: 'Options', row: 3, message: 'Add at least one option.' });
  if (!ratePlans.length) issues.push({ sheet: 'Rate_Plans', row: 3, message: 'Add at least one rate plan.' });
  if (!availability.length) issues.push({ sheet: 'Availability', row: 3, message: 'Add at least one availability schedule.' });
  if (fulfilmentRows.length > 1) issues.push({ sheet: 'Fulfilment', row: 4, message: 'Provide only one Fulfilment row.' });
  if (key && [...experienceRows, ...options, ...ticketTypes, ...ratePlans, ...availability, ...media, ...bookingQuestions, ...fulfilmentRows].some((row) => text(row, 'product_key') && text(row, 'product_key').toUpperCase() !== key.toUpperCase())) issues.push({ sheet: 'Workbook', row: 1, message: 'All sheets must use the same product_key.' });
  const optionCodes = new Set<string>();
  options.forEach((row, index) => { const code = text(row, 'option_code'); if (!code) issues.push({ sheet: 'Options', row: index + 3, message: 'option_code is required.' }); else if (optionCodes.has(code)) issues.push({ sheet: 'Options', row: index + 3, message: `Duplicate option_code: ${code}.` }); else optionCodes.add(code); if (!text(row, 'option_name')) issues.push({ sheet: 'Options', row: index + 3, message: 'option_name is required.' }); });
  const rateCodes = new Set<string>();
  ratePlans.forEach((row, index) => {
    const code = text(row, 'rate_plan_code'); const optionCode = text(row, 'option_code');
    if (!code) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: 'rate_plan_code is required.' }); else if (rateCodes.has(code)) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: `Duplicate rate_plan_code: ${code}.` }); else rateCodes.add(code);
    if (!text(row, 'rate_plan_name') || !text(row, 'valid_from') || !text(row, 'valid_to')) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: 'rate_plan_name, valid_from and valid_to are required.' });
    if (!optionCodes.has(optionCode)) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: `Unknown option_code: ${optionCode}.` });
    const mrpMode = text(row, 'mrp_mode').toUpperCase(); const mrp = text(row, 'mrp_amount');
    if (mrpMode && !['YES', 'NO'].includes(mrpMode)) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: 'mrp_mode must be YES or NO.' });
    if (mrpMode === 'YES' && (!/^\d+(\.\d{1,4})?$/.test(mrp) || Number(mrp) <= 0)) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: 'Provide a positive mrp_amount when mrp_mode is YES.' });
    if (mrpMode === 'YES' && mrp && [row.adult_price, row.child_price, row.senior_price, row.supplier_base_amount].some((value) => value !== '' && value != null && Number(value) > Number(mrp))) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: 'Selling prices cannot exceed mrp_amount.' });
  });
  availability.forEach((row, index) => {
    if (!optionCodes.has(text(row, 'option_code'))) issues.push({ sheet: 'Availability', row: index + 3, message: `Unknown option_code: ${text(row, 'option_code')}.` });
    if (!text(row, 'schedule_code') || !text(row, 'effective_from') || !text(row, 'effective_to')) issues.push({ sheet: 'Availability', row: index + 3, message: 'schedule_code, effective_from and effective_to are required.' });
    if (!list(row, 'operating_days').length) issues.push({ sheet: 'Availability', row: index + 3, message: 'At least one operating day is required.' });
    const slotsJson = text(row, 'slots_json');
    if (slotsJson) {
      try { const slots = JSON.parse(slotsJson); if (!Array.isArray(slots) || !slots.length || slots.some((slot) => !slot || !String(slot.slotCode || '').trim() || !/^\d{2}:\d{2}$/.test(String(slot.startTime || '')) || !/^\d{2}:\d{2}$/.test(String(slot.endTime || '')) || String(slot.endTime) <= String(slot.startTime))) throw new Error(); }
      catch { issues.push({ sheet: 'Availability', row: index + 3, message: 'slots_json must contain one or more valid slots with slotCode, startTime and endTime.' }); }
    } else if (!text(row, 'start_time') || !text(row, 'end_time')) issues.push({ sheet: 'Availability', row: index + 3, message: 'Provide start_time and end_time for the schedule slot.' });
  });
  media.forEach((row,index) => {
    issues.push(...importMediaIssues(row).map(issue => ({...issue,sheet:'Media',row:index+3,rowData:row,fatal:true})));
  });
  ticketTypes.forEach((row, index) => {
    if (!text(row, 'ticket_type') || !optionCodes.has(text(row, 'option_code'))) issues.push({ sheet: 'Ticket_Types', row: index + 3, message: !text(row, 'ticket_type') ? 'ticket_type is required.' : `Unknown option_code: ${text(row, 'option_code')}.` });
    const from = text(row, 'age_from'); const to = text(row, 'age_to');
    if ((from && (!Number.isInteger(Number(from)) || Number(from) < 0)) || (to && (!Number.isInteger(Number(to)) || Number(to) < 0)) || (from && to && Number(to) < Number(from))) issues.push({ sheet: 'Ticket_Types', row: index + 3, message: 'Ticket type age range must contain non-negative integers in ascending order.' });
  });
  const annotated = issues.map((issue) => ({ ...issue, ...(!issue.rowData && rows[issue.sheet]?.[issue.row - 3] ? { rowData: rows[issue.sheet][issue.row - 3] } : {}), fatal: issue.fatal ?? (issue.sheet === 'Basic_Info' || issue.sheet === 'Experience' || issue.sheet === 'Workbook' || issue.sheet === 'Fulfilment' || (['Options', 'Rate_Plans', 'Availability'].includes(issue.sheet) && issue.message.startsWith('Add at least'))) }));
  const invalidRows = new Set(annotated.filter((issue) => !issue.fatal).map((issue) => `${issue.sheet}:${issue.row}`));
  const validOptions = options.filter((_, index) => !invalidRows.has(`Options:${index + 3}`));
  const validOptionCodes = new Set(validOptions.map((row) => text(row, 'option_code')));
  const validTicketTypes = ticketTypes.filter((_, index) => !invalidRows.has(`Ticket_Types:${index + 3}`) && validOptionCodes.has(text(ticketTypes[index], 'option_code')));
  const validRatePlans = ratePlans.filter((row, index) => !invalidRows.has(`Rate_Plans:${index + 3}`) && validOptionCodes.has(text(row, 'option_code')));
  const validAvailability = availability.filter((row, index) => !invalidRows.has(`Availability:${index + 3}`) && validOptionCodes.has(text(row, 'option_code')));
  const validMedia = media.filter((_, index) => !invalidRows.has(`Media:${index + 3}`));
  const validBookingQuestions = bookingQuestions.filter((_, index) => !invalidRows.has(`Booking_Questions:${index + 3}`));
  if (options.length && !validOptions.length) annotated.push({ sheet: 'Options', row: 3, message: 'No valid option rows remain after validation.', fatal: true });
  if (ratePlans.length && !validRatePlans.length) annotated.push({ sheet: 'Rate_Plans', row: 3, message: 'No valid rate-plan rows remain after validation.', fatal: true });
  if (availability.length && !validAvailability.length) annotated.push({ sheet: 'Availability', row: 3, message: 'No valid availability rows remain after validation.', fatal: true });
  if (annotated.some((issue) => issue.fatal)) return { model: null, issues: annotated.map(locatedIssue) };
  return { model: { basic, experience: experienceRows[0], options: validOptions, ticketTypes: validTicketTypes, ratePlans: validRatePlans, availability: validAvailability, media: validMedia, bookingQuestions: validBookingQuestions, fulfilment: fulfilmentRows[0] || {} }, issues: annotated.map(locatedIssue) };
}

function duplicateContentIssues(rows: ImportRow[]): ImportIssue[] {
  const seen = new Map<string,number>();
  return rows.flatMap((row,index) => {
    const identity = importProductContentKey(row), first=seen.get(identity); seen.set(identity,first ?? index);
    return first === undefined ? [] : [locatedIssue({sheet:'Basic_Info',row:index+3,rowData:row,field:'product_name',value:text(row,'product_name'),message:`This product has the same name, type and destination as product ${first+1} (${text(rows[first],'product_key')}).`,correction:'Remove the repeated product, or correct its name/type/destination if it is a different experience.',fatal:true})];
  });
}

function validateProductGroups(rows: Record<string, ImportRow[]>): ProductImportParseResult {
  const basicRows = rows.Basic_Info || [];
  if (basicRows.length <= 1) {
    const parsed = validateImportRows(rows);
    return { ...parsed, models: parsed.model ? [parsed.model] : [] };
  }
  const keys = basicRows.map((row) => text(row, 'product_key').toUpperCase());
  const duplicateIndex = keys.findIndex((key, index) => !key || keys.indexOf(key) !== index);
  if (duplicateIndex >= 0) {
    const key = keys[duplicateIndex];
    const first = key ? locatedIssue({ sheet: 'Basic_Info', row: keys.indexOf(key) + 3, field: 'product_key', rowData: basicRows[keys.indexOf(key)], message: '' }) : undefined;
    const location = first ? `${first.sheet}!${first.cell || `row ${first.row}`}` : '';
    const issue = locatedIssue({ sheet: 'Basic_Info', row: duplicateIndex + 3, rowData: basicRows[duplicateIndex], field: 'product_key', value: key, message: key ? `Duplicate product_key: ${key}. This code is already used at ${location}.` : 'Every product row needs a product_key.', correction: key ? 'Keep one product row per code. Remove the duplicate row, or give the separate product a unique code and update its related rows. Repeating the code in linked option, rate and time-slot rows is expected.' : 'Enter a unique product code and use it in the related sheets.' });
    return { model: null, models: [], issues: [issue] };
  }
  const duplicates = duplicateContentIssues(basicRows);
  if (duplicates.length) return {model:null,models:[],issues:duplicates};
  const models: ImportWorkbookModel[] = [];
  const issues: ImportIssue[] = [];
  const keyedSheets = IMPORT_SHEETS;
  const unassigned = keyedSheets.flatMap((sheet) => (rows[sheet] || []).flatMap((row, index) => text(row, 'product_key') ? [] : [{ sheet, row: index + 3 }]));
  if (unassigned.length) return { model: null, models: [], issues: unassigned.map((item) => locatedIssue({ sheet: item.sheet, row: item.row, rowData: rows[item.sheet][item.row - 3], field: 'product_key', message: 'Add product_key to link this row to a product.' })) };
  const unknownKeys = keyedSheets.flatMap((sheet) => (rows[sheet] || []).flatMap((row, index) => { const key = text(row, 'product_key'); return key && !keys.includes(key.toUpperCase()) ? [{ sheet, row: index + 3, key }] : []; }));
  if (unknownKeys.length) return { model: null, models: [], issues: unknownKeys.map((item) => locatedIssue({ sheet: item.sheet, row: item.row, rowData: rows[item.sheet][item.row - 3], field: 'product_key', message: `product_key ${item.key} does not match a product row.`, correction: 'Use a code from the product sheet.' })) };
  for (const key of keys) {
    const grouped = Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, (rows[sheet] || []).filter((row) => text(row, 'product_key').toUpperCase() === key)]));
    const parsed = validateImportRows(grouped);
    if (parsed.model) models.push(parsed.model);
    issues.push(...parsed.issues.map((issue) => ({ ...issue, productKey: key, fatal: false })));
  }
  if (!models.length && issues.length) issues.push({ sheet: 'Workbook', row: 1, message: 'No product groups passed validation.' });
  return { model: models.length === 1 ? models[0] : null, models, issues };
}

export function parseProductWorkbook(buffer: ArrayBuffer): ProductImportParseResult {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: 'array', cellDates: false }); } catch { return { model: null, models: [], issues: [{ sheet: 'Workbook', row: 1, message: 'The file is not a readable Excel workbook.' }] }; }
  const { prototype, issues: structureIssues } = workbookStructure(workbook);
  if (structureIssues.length) return { model: null, models: [], issues: structureIssues };
  const grouped = prototype ? prototypeWorkbookRows(workbook) : Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, sheetRows(workbook, sheet)]));
  const sourceRowCount = prototype ? PROTOTYPE_IMPORT_SHEETS.reduce((count, name) => count + workbookRows(workbook, name).length, 0) : importRowCount(grouped);
  const rowIssues = rowLimitIssue('Workbook', sourceRowCount);
  if (rowIssues.length) return { model: null, models: [], issues: rowIssues };
  const result = validateProductGroups(grouped);
  const productIssues = productLimitIssue(result.models.length);
  return productIssues.length ? { model: null, models: [], issues: productIssues } : result;
}

export function parseProductCsv(csv: string): ProductImportParseResult {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(csv, { type: 'string', cellDates: false, raw: true }); } catch { return { model: null, models: [], issues: [{ sheet: 'CSV', row: 1, message: 'The file is not a readable CSV file.' }] }; }
  const headerIssues = csvHeaderIssues(workbook);
  if (headerIssues.length) return { model: null, models: [], issues: headerIssues };
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = firstSheet ? workbookRows(workbook, workbook.SheetNames[0]) : [];
  if (!rows.length) return { model: null, models: [], issues: [{ sheet: 'CSV', row: 1, message: 'The CSV file is empty.' }] };
  rows.forEach((row) => { const source = rowSources.get(row); if (source) source.sheet = 'CSV'; });
  const sections = rows.map((row) => text(row, 'section') || text(row, 'sheet'));
  if (sections.some((section) => PROTOTYPE_IMPORT_SHEETS.includes(section as typeof PROTOTYPE_IMPORT_SHEETS[number]))) {
    const prototype = Object.fromEntries(PROTOTYPE_IMPORT_SHEETS.map((section) => [section, [] as ImportRow[]])) as Record<string, ImportRow[]>;
    const issues: ImportIssue[] = [];
    rows.forEach((row, index) => {
      const section = text(row, 'section') || text(row, 'sheet');
      if (!PROTOTYPE_IMPORT_SHEETS.includes(section as typeof PROTOTYPE_IMPORT_SHEETS[number])) { issues.push({ sheet: 'CSV', row: index + 2, message: `Unknown prototype section: ${section}.` }); return; }
      const cleaned = inheritSource({ ...row }, row); delete cleaned.section; delete cleaned.sheet; prototype[section].push(cleaned);
    });
    const grouped = prototypeRowsToImport(prototype);
    const parsed = validateProductGroups(grouped);
    const rowIssues = rowLimitIssue('CSV', importRowCount(prototype));
    if (rowIssues.length) return { model: null, models: [], issues: rowIssues };
    const productIssues = productLimitIssue(parsed.models.length);
    return productIssues.length ? { model: null, models: [], issues: productIssues } : { ...parsed, issues: [...issues, ...parsed.issues] };
  }
  const grouped = Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, [] as ImportRow[]])) as Record<string, ImportRow[]>;
  const issues: ImportIssue[] = [];
  rows.forEach((row, index) => {
    const section = text(row, 'section') || text(row, 'sheet');
    if (!section) { issues.push({ sheet: 'CSV', row: index + 2, message: 'Each CSV row must have a section column containing one of the VOYA import section names.' }); return; }
    if (!IMPORT_SHEETS.includes(section as typeof IMPORT_SHEETS[number])) { issues.push({ sheet: 'CSV', row: index + 2, message: `Unknown section: ${section}.` }); return; }
    const cleaned = inheritSource({ ...row }, row);
    delete cleaned.section; delete cleaned.sheet;
    grouped[section].push(cleaned);
  });
  const parsed = validateProductGroups(grouped);
  const rowIssues = rowLimitIssue('CSV', importRowCount(grouped));
  if (rowIssues.length) return { model: null, models: [], issues: rowIssues };
  const productIssues = productLimitIssue(parsed.models.length);
  return productIssues.length ? { model: null, models: [], issues: productIssues } : { ...parsed, issues: [...issues, ...parsed.issues] };
}

function jsonRows(value: unknown): ImportRow[] {
  return Array.isArray(value) ? value.filter((row): row is ImportRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [];
}
function jsonShapeIssues(source: Record<string,unknown>): ImportIssue[] {
  return Object.entries(source).flatMap(([section,value]) => {
    if(section === 'README') return [];
    const correction = 'Use the sample JSON structure. Each section must be an array of row objects; remove empty entries or replace them with complete objects.';
    if(!IMPORT_SHEETS.includes(section as typeof IMPORT_SHEETS[number])) return [{sheet:'JSON',row:1,field:section,message:`Unknown JSON section: ${section}.`,correction:'Use the exact section names from the sample JSON.',fatal:true}];
    if(!Array.isArray(value)) return [{sheet:section,row:1,message:`${section} must be an array of row objects.`,correction,fatal:true}];
    return value.flatMap((row,index) => !row || typeof row !== 'object' || Array.isArray(row) ? [{sheet:section,row:index+1,message:`${section}[${index}] must be a row object.`,correction,value:JSON.stringify(row),fatal:true}] : []);
  });
}
function jsonSections(source:Record<string,unknown>, productIndex?:number) {
  return Object.fromEntries(IMPORT_SHEETS.map(sheet => [sheet,jsonRows(source[sheet]).map(row => {
    const index=(source[sheet] as unknown[]).indexOf(row);
    rowSources.set(row,{sheet,row:index+1,columns:[],path:`${productIndex === undefined ? '' : `products[${productIndex}].`}${sheet}[${index}]`});
    return row;
  })]));
}
export function parseProductJson(inputText: string): ProductImportParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(inputText); } catch { return {model:null,models:[],issues:[{sheet:'JSON',row:1,message:'The file is not valid JSON.'}]}; }
  if(!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {model:null,models:[],issues:[{sheet:'JSON',row:1,message:'The JSON root must be an object containing the import sections.'}]};
  const source=parsed as Record<string,unknown>;
  if('products' in source) {
    if(!Array.isArray(source.products)) return {model:null,models:[],issues:[{sheet:'JSON',row:1,message:'products must be an array of product import objects.',fatal:true}]};
    const limits=[...productLimitIssue(source.products.length),...rowLimitIssue('JSON',source.products.reduce((sum,product) => sum+(!product || typeof product !== 'object' ? 0 : IMPORT_SHEETS.reduce((count,sheet) => count+(Array.isArray(product[sheet])?product[sheet].length:0),0)),0))];
    if(limits.length) return {model:null,models:[],issues:limits};
    const models:ImportWorkbookModel[]=[],issues:ImportIssue[]=[];
    source.products.forEach((product,index) => {
      if(!product || typeof product !== 'object' || Array.isArray(product)) { issues.push({sheet:'JSON',row:index+1,message:'Each products entry must be a product import object.',correction:'Replace this entry with a product object from the sample JSON.',fatal:false});return; }
      const shape=jsonShapeIssues(product);
      if(shape.length) {issues.push(...shape.map(issue=>({...issue,productKey:text(jsonRows(product.Basic_Info)[0]||{},'product_key'),fatal:false})));return;}
      const result=validateImportRows(jsonSections(product,index));
      if(result.model)models.push(result.model);
      issues.push(...result.issues.map(issue=>({...issue,productKey:text(jsonRows(product.Basic_Info)[0]||{},'product_key'),fatal:false})));
    });
    const keys = models.map(model => text(model.basic,'product_key').toUpperCase());
    const duplicateKeys = new Set(keys.filter((key,index) => key && keys.indexOf(key) !== index));
    if (duplicateKeys.size) {
      const duplicateIssues = models.flatMap((model,index) => duplicateKeys.has(keys[index]) ? [locatedIssue({
        sheet:'Basic_Info',row:1,field:'product_key',productKey:keys[index],value:text(model.basic,'product_key'),rowData:model.basic,fatal:true,
        message:`Repeated product_key ${keys[index]} identifies more than one product in this JSON file.`,
        correction:'Give each product a unique product_key and update its linked rows, or remove the repeated product.',
      })] : []);
      return {model:null,models:[],issues:[...issues,...duplicateIssues]};
    }
    const duplicates=duplicateContentIssues(models.map(model=>model.basic));
    if(duplicates.length) return {model:null,models:[],issues:[...issues,...duplicates]};
    if(!models.length)issues.push({sheet:'JSON',row:1,message:'No product entries passed validation.',fatal:true});
    return {model:models.length===1?models[0]:null,models,issues};
  }
  const limits=rowLimitIssue('JSON',IMPORT_SHEETS.reduce((count,sheet)=>count+(Array.isArray(source[sheet])?source[sheet].length:0),0));
  const shape=[...limits,...jsonShapeIssues(source)];
  return shape.length?{model:null,models:[],issues:shape}:validateProductGroups(jsonSections(source));
}

export function normalizeImportRow(row: ImportRow) {
  return { ...row, highlights: list(row, 'highlights'), importantInfo: list(row, 'important_information'), thingsToCarry: list(row, 'things_to_carry'), safetyMeasures: list(row, 'safety_measures'), terms: list(row, 'terms'), howToRedeem: list(row, 'how_to_redeem'), additionalInfo: list(row, 'additional_information'), labels: list(row, 'labels'), lat: number(row, 'latitude'), lon: number(row, 'longitude') };
}

export { bool, list, number, text };

export function serverImportIssues(details: unknown[], models: ImportWorkbookModel[], rateRows: RateUpdateImportRow[] = []): ImportIssue[] {
  if(rateRows.length) return details.flatMap((entry:any) => {
    const nested=Array.isArray(entry.issues)?entry.issues:[entry];
    return nested.flatMap((detail:any) => {
      const issue=typeof detail==='object' && detail?detail:{message:String(detail)};
      const product=String(issue.productCode || entry.productCode || '').toUpperCase(), option=String(issue.optionCode || entry.optionCode || '').toUpperCase();
      const logical=Number(issue.row || entry.row)-2;
      const matched=rateRows.filter((row,index)=> (!product || row.productCode.toUpperCase()===product) && (!option || row.optionCode.toUpperCase()===option) && (product || option || index===logical));
      return matched.map(row=>{
        const source=rateOriginalRows.get(row) || row as unknown as ImportRow;
        const field=rateFields[issue.field] || issue.field || 'option_code';
        return locatedIssue({sheet:'Rates',row:logical+2,productKey:row.productCode,message:issue.message || 'Rate validation failed.',field,value:String(source[field] ?? ''),correction:issue.correction || 'Check the highlighted rate row, correct its product/option codes and prices, then validate again.',rowData:source,fatal:true});
      });
    });
  });
  const rowsFor = (model: ImportWorkbookModel, section: string): ImportRow[] => ({ Basic_Info: [model.basic], Experience: [model.experience], Options: model.options, Ticket_Types: model.ticketTypes, Rate_Plans: model.ratePlans, Availability: model.availability, Media: model.media, Booking_Questions: model.bookingQuestions, Fulfilment: [model.fulfilment] }[section] || []);
  return details.flatMap((entry: any) => {
    const model = (entry.productIndex ? models[entry.productIndex - 1] : undefined) || models.find((item) => text(item.basic, 'product_key').toUpperCase() === String(entry.productKey || '').toUpperCase()) || models[0];
    const nested = Array.isArray(entry.issues) ? entry.issues : [entry];
    return nested.map((detail: any) => {
      const issue = typeof detail === 'object' && detail ? detail : { message: String(detail) };
      const section = issue.section || issue.sheet || (entry.optionCode ? 'Rates' : 'Basic_Info');
      const row = issue.row || entry.row || 3;
      return locatedIssue({ ...issue, sheet: section, row, productKey: entry.productKey || entry.productCode, message: issue.message || String(entry.issues || 'Validation failed.'), rowData: model ? rowsFor(model, section)[row - 3] : undefined });
    });
  });
}

export function importErrorsCsv(issues: ImportIssue[]): string {
  const rowFields = [...new Set(issues.flatMap((issue) => Object.keys(issue.rowData || {})))];
  const columns = [...new Set(['sheet', 'row', 'cell', 'field', 'product_key', 'value', 'message', 'correction', 'path', ...rowFields])];
  const quote = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`; };
  return [columns.map(quote).join(','), ...issues.map((issue) => columns.map((column) => quote(column === 'product_key' ? issue.productKey || issue.rowData?.product_key || issue.rowData?.product_code : column in issue ? (issue as unknown as ImportRow)[column] : issue.rowData?.[column])).join(','))].join('\r\n');
}
