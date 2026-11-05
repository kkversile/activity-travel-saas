import * as XLSX from 'xlsx';

export const IMPORT_SHEETS = ['Basic_Info', 'Experience', 'Options', 'Ticket_Types', 'Rate_Plans', 'Availability', 'Media', 'Booking_Questions', 'Fulfilment'] as const;
export const PROTOTYPE_IMPORT_SHEETS = ['Products', 'Options', 'Ticket types', 'Rates', 'Time slots'] as const;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_PRODUCTS = 200;

export type ImportRow = Record<string, unknown>;
export type ImportIssue = { sheet: string; row: number; message: string; fatal?: boolean; productKey?: string; rowData?: ImportRow };
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
  Media: [{ product_key: 'MUNNAR_SUNRISE_SPICE', kind: 'IMAGE', external_url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80', description: 'Sunrise over the green hills and spice gardens of Munnar', rank: 1 }],
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
  Media: 'External URLs are supported. One row per image or video.',
  Booking_Questions: 'One row per booking question.',
  Fulfilment: 'One row per product. AUTO is the simplest vendor fulfilment mode.',
};

export function createSampleWorkbook() {
  const workbook = XLSX.utils.book_new();
  const products: ImportRow[] = demoRows.Basic_Info.map((row, index) => ({ ...row, full_description: demoRows.Experience[index]?.full_description, highlights: demoRows.Experience[index]?.highlights, important_information: demoRows.Experience[index]?.important_information }));
  const linked = (sheet: string): ImportRow[] => (demoRows[sheet] || []).map((row) => ({ product_code: row.product_key, ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'product_key')) }));
  const prototypeRows: Record<string, ImportRow[]> = {
    Products: products.map((row) => ({ product_code: row['product_key'], product_name: row['product_name'], type: row['type'], sub_type: row['sub_type'], sub_category: row['sub_category'], city: row['city'], state: row['state'], country: row['country'], meeting_model: row['meeting_model'], short_description: row['short_description'], full_description: row['full_description'], meeting_point: row['meeting_point'], address: row['address'], latitude: row['latitude'], longitude: row['longitude'], duration_value: '2', duration_unit: 'HOURS', guide_included: 'WITH_GUIDE', guide_languages: 'English|Hindi', included: 'Guided nature walk|Spice garden visit|Tea tasting', not_included: 'Personal expenses|Meals not listed', end_point: 'Munnar Spice Garden entrance', things_to_know: 'Wear comfortable walking shoes; paths may be uneven.', accessibility: 'Uneven terrain', follow_itinerary: true, itinerary_stops_json: JSON.stringify([{ stopName: 'Spice garden entrance', stopType: 'MEETING_POINT', stayDurationMinutes: 15, travelTimeToNextMinutes: 10, ticketPolicy: 'Included' }, { stopName: 'Tea tasting pavilion', stopType: 'guided', stayDurationMinutes: 25, ticketPolicy: 'Included' }]), voucher_code_source: 'PLATFORM', voucher_accepted_as: 'MOBILE_VOUCHER', voucher_instructions: 'Show the confirmation voucher to the host at the meeting point.', cancellation_preset: 'MODERATE', traveller_details: 'Lead name|Mobile', amendment_policy: 'DATE_CHANGE_24H', labels: row['labels'], highlights: row['highlights'], important_information: row['important_information'], things_to_carry: row['things_to_carry'], safety_measures: row['safety_measures'], terms: row['terms'], how_to_redeem: row['how_to_redeem'], additional_information: row['additional_information'] })),
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
    ],
    ...Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, demoRows[sheet] || []])),
  };
}

export function createSampleImportCsv() {
  const workbook = createSampleWorkbook();
  const rows = PROTOTYPE_IMPORT_SHEETS.flatMap((section) => XLSX.utils.sheet_to_json<ImportRow>(workbook.Sheets[section], { defval: '' }).map((row) => ({ section, ...row })));
  return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows));
}

export function createRateUpdateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const readme = XLSX.utils.aoa_to_sheet([
    ['VOYA vendor rate update template'],
    ['Fill one row per existing product option. Use product and option codes from Your products.'],
    ['Rates are preview-validated for all rows before any update is applied.'],
    ['validTo is exclusive. Leave child/senior prices blank to retain the current values.'],
  ]);
  XLSX.utils.book_append_sheet(workbook, readme, 'README');
  const rates = XLSX.utils.aoa_to_sheet([['product_code', 'option_code', 'valid_from', 'valid_to', 'adult_sell_inr', 'child_sell_inr', 'senior_sell_inr', 'base_sell_inr', 'mrp_inr']]);
  rates['!cols'] = Array.from({ length: 9 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(workbook, rates, 'Rates');
  return workbook;
}

export function createRateUpdateTemplateCsv() {
  return 'product_code,option_code,valid_from,valid_to,adult_sell_inr,child_sell_inr,senior_sell_inr,base_sell_inr,mrp_inr\r\n';
}

function normalizeRateRows(sourceRows: ImportRow[]): RateUpdateParseResult {
  const rows: RateUpdateImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  sourceRows.forEach((source, index) => {
    const rowNumber = index + 2;
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
    const problem = (message: string) => { issues.push({ sheet: 'Rates', row: rowNumber, message, fatal: false, rowData: source }); invalid = true; };
    if (!productCode) problem('product_code is required.');
    if (!optionCode) problem('option_code is required.');
    if (!validFrom || Number.isNaN(Date.parse(validFrom))) problem('valid_from must be a valid date.');
    if (!validTo || Number.isNaN(Date.parse(validTo))) problem('valid_to must be a valid date.');
    if (validFrom && validTo && Date.parse(validTo) <= Date.parse(validFrom)) problem('valid_to must be after valid_from.');
    if (![row.adultSellInr, row.childSellInr, row.seniorSellInr, row.baseSellInr].some(Boolean)) problem('Provide at least one sell price.');
    for (const field of ['adultSellInr', 'childSellInr', 'seniorSellInr', 'baseSellInr', 'mrpInr'] as const) {
      const value = row[field];
      if (value !== undefined && (!/^\d+(\.\d{1,4})?$/.test(value) || Number(value) <= 0)) problem(`${field} must be a positive amount with up to four decimals.`);
    }
    if (seen.has(identity)) problem('Only one row per product option is allowed in this rate batch.');
    seen.add(identity);
    if (!invalid) rows.push(row);
  });
  if (!rows.length && !issues.length) issues.push({ sheet: 'Rates', row: 1, message: 'Add at least one rate update row.' });
  if (!rows.length && issues.length) issues.push({ sheet: 'Rates', row: 1, message: 'No rate rows passed validation.' });
  return { rows, issues };
}

export function parseRateUpdateCsv(csv: string): RateUpdateParseResult | null {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(csv, { type: 'string', cellDates: false }); } catch { return null; }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const headers = Array.from({ length: range.e.c - range.s.c + 1 }, (_, offset) => text({ value: sheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + offset })]?.v }, 'value').toLowerCase());
  if (!headers.includes('product_code') || !headers.includes('option_code') || !headers.includes('valid_from') || !headers.includes('valid_to') || !headers.some((header) => ['adult_sell_inr', 'child_sell_inr', 'senior_sell_inr', 'base_sell_inr'].includes(header))) return null;
  const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' });
  const limitIssues = rowLimitIssue('Rates', rows.length);
  return limitIssues.length ? { rows: [], issues: limitIssues } : normalizeRateRows(rows);
}

export function parseRateUpdateWorkbook(buffer: ArrayBuffer): RateUpdateParseResult | null {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: 'array', cellDates: false }); } catch { return null; }
  const sheet = workbook.Sheets.Rates;
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' });
  const limitIssues = rowLimitIssue('Rates', rows.length);
  return limitIssues.length ? { rows: [], issues: limitIssues } : normalizeRateRows(rows);
}

function sheetRows(workbook: XLSX.WorkBook, name: string): ImportRow[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { range: 2, defval: '' }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}

function prototypeRowsToImport(rows: Record<string, ImportRow[]>) {
  const products = rows.Products.map((row) => ({ product_key: row.product_code, product_name: row.product_name, type: row.type, sub_type: row.sub_type, sub_category: row.sub_category, city: row.city, state: row.state, country: row.country, meeting_model: row.meeting_model, short_description: row.short_description, meeting_point: row.meeting_point, address: row.address, latitude: row.latitude, longitude: row.longitude, duration_value: row.duration_value, duration_unit: row.duration_unit, guide_included: row.guide_included, guide_languages: row.guide_languages, included: row.included, not_included: row.not_included, end_point: row.end_point, things_to_know: row.things_to_know, accessibility: row.accessibility, follow_itinerary: row.follow_itinerary, itinerary_stops_json: row.itinerary_stops_json, voucher_code_source: row.voucher_code_source, voucher_accepted_as: row.voucher_accepted_as, voucher_instructions: row.voucher_instructions, cancellation_preset: row.cancellation_preset, traveller_details: row.traveller_details, amendment_policy: row.amendment_policy, labels: row.labels }));
  const experience = rows.Products.map((row) => ({ product_key: row.product_code, full_description: row.full_description, highlights: row.highlights, important_information: row.important_information, things_to_carry: row.things_to_carry, safety_measures: row.safety_measures, terms: row.terms, how_to_redeem: row.how_to_redeem, additional_information: row.additional_information }));
  const mapLinked = (sheet: string, map: (row: ImportRow) => ImportRow = (row) => row) => rows[sheet].map((row) => ({ product_key: row.product_code, ...map(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'product_code'))) }));
  const scheduleGroups = new Map<string, ImportRow[]>();
  for (const row of rows['Time slots']) {
    const identity = [row.product_code, row.option_code, row.schedule_code].map((value) => String(value ?? '').trim().toUpperCase()).join('::');
    scheduleGroups.set(identity, [...(scheduleGroups.get(identity) || []), row]);
  }
  const schedules = [...scheduleGroups.values()].map((group) => {
    const first = group[0];
    const { product_code: _productCode, ...schedule } = first;
    const slots = group.map((slot, index) => ({ slotCode: slot.slot_code || slot.start_time, startTime: slot.start_time, endTime: slot.end_time, rank: index }));
    return { product_key: first.product_code, ...schedule, slots_json: JSON.stringify(slots) };
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
  return prototypeRowsToImport(Object.fromEntries(PROTOTYPE_IMPORT_SHEETS.map((name) => [name, XLSX.utils.sheet_to_json<ImportRow>(workbook.Sheets[name], { defval: '' }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''))])));
}

function text(row: ImportRow, key: string) { return String(row[key] ?? '').trim(); }
function list(row: ImportRow, key: string) { return text(row, key).split('|').map((value) => value.trim()).filter(Boolean); }
function bool(row: ImportRow, key: string, fallback = false) { const value = text(row, key).toLowerCase(); return value ? ['true', 'yes', '1', 'y'].includes(value) : fallback; }
function number(row: ImportRow, key: string, fallback?: number) { const value = Number(row[key]); return Number.isFinite(value) ? value : fallback; }

function validateImportRows(rows: Record<string, ImportRow[]>): { model: ImportWorkbookModel | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
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
  const key = text(basic, 'product_key');
  const requiredBasic = ['product_key', 'product_name', 'type', 'sub_type', 'sub_category', 'city', 'state', 'country', 'meeting_model', 'short_description'];
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
  if (key && [...experienceRows, ...options, ...ticketTypes, ...ratePlans, ...availability, ...media, ...bookingQuestions, ...fulfilmentRows].some((row) => text(row, 'product_key') && text(row, 'product_key') !== key)) issues.push({ sheet: 'Workbook', row: 1, message: 'All sheets must use the same product_key.' });
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
  media.forEach((row, index) => {
    const url = text(row, 'external_url');
    const assetId = text(row, 'file_asset_id');
    if (!url && !assetId) issues.push({ sheet: 'Media', row: index + 3, message: 'Provide external_url or file_asset_id.' });
    else if (url && !/^https?:\/\//i.test(url)) issues.push({ sheet: 'Media', row: index + 3, message: 'external_url must be an http or https URL.' });
  });
  ticketTypes.forEach((row, index) => {
    if (!text(row, 'ticket_type') || !optionCodes.has(text(row, 'option_code'))) issues.push({ sheet: 'Ticket_Types', row: index + 3, message: !text(row, 'ticket_type') ? 'ticket_type is required.' : `Unknown option_code: ${text(row, 'option_code')}.` });
    const from = text(row, 'age_from'); const to = text(row, 'age_to');
    if ((from && (!Number.isInteger(Number(from)) || Number(from) < 0)) || (to && (!Number.isInteger(Number(to)) || Number(to) < 0)) || (from && to && Number(to) < Number(from))) issues.push({ sheet: 'Ticket_Types', row: index + 3, message: 'Ticket type age range must contain non-negative integers in ascending order.' });
  });
  const annotated = issues.map((issue) => ({ ...issue, ...(rows[issue.sheet]?.[issue.row - 3] ? { rowData: rows[issue.sheet][issue.row - 3] } : {}), fatal: issue.sheet === 'Basic_Info' || issue.sheet === 'Experience' || issue.sheet === 'Workbook' || issue.sheet === 'Fulfilment' || (['Options', 'Rate_Plans', 'Availability'].includes(issue.sheet) && issue.message.startsWith('Add at least')) }));
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
  if (annotated.some((issue) => issue.fatal)) return { model: null, issues: annotated };
  return { model: { basic, experience: experienceRows[0], options: validOptions, ticketTypes: validTicketTypes, ratePlans: validRatePlans, availability: validAvailability, media: validMedia, bookingQuestions: validBookingQuestions, fulfilment: fulfilmentRows[0] || {} }, issues: annotated };
}

function validateProductGroups(rows: Record<string, ImportRow[]>): ProductImportParseResult {
  const basicRows = rows.Basic_Info || [];
  if (basicRows.length <= 1) {
    const parsed = validateImportRows(rows);
    return { ...parsed, models: parsed.model ? [parsed.model] : [] };
  }
  const keys = basicRows.map((row) => text(row, 'product_key'));
  const duplicate = keys.find((key, index) => !key || keys.indexOf(key) !== index);
  if (duplicate !== undefined) return { model: null, models: [], issues: [{ sheet: 'Basic_Info', row: 3, message: duplicate ? `Duplicate product_key: ${duplicate}.` : 'Every product row needs a product_key.' }] };
  const models: ImportWorkbookModel[] = [];
  const issues: ImportIssue[] = [];
  const keyedSheets = IMPORT_SHEETS;
  const unassigned = keyedSheets.flatMap((sheet) => (rows[sheet] || []).flatMap((row, index) => text(row, 'product_key') ? [] : [{ sheet, row: index + 3 }]));
  if (unassigned.length) return { model: null, models: [], issues: unassigned.map((item) => ({ sheet: item.sheet, row: item.row, message: 'Add product_key to link this row to a product.' })) };
  const unknownKeys = keyedSheets.flatMap((sheet) => (rows[sheet] || []).flatMap((row, index) => { const key = text(row, 'product_key'); return key && !keys.includes(key) ? [{ sheet, row: index + 3, key }] : []; }));
  if (unknownKeys.length) return { model: null, models: [], issues: unknownKeys.map((item) => ({ sheet: item.sheet, row: item.row, message: `product_key ${item.key} does not match a Basic_Info product.` })) };
  for (const key of keys) {
    const grouped = Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, (rows[sheet] || []).filter((row) => text(row, 'product_key') === key)]));
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
  const prototype = PROTOTYPE_IMPORT_SHEETS.every((sheet) => workbook.SheetNames.includes(sheet));
  const grouped = prototype ? prototypeWorkbookRows(workbook) : Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, sheetRows(workbook, sheet)]));
  const rowIssues = rowLimitIssue('Workbook', importRowCount(grouped));
  if (rowIssues.length) return { model: null, models: [], issues: rowIssues };
  const result = validateProductGroups(grouped);
  const productIssues = productLimitIssue(result.models.length);
  return productIssues.length ? { model: null, models: [], issues: productIssues } : result;
}

export function parseProductCsv(csv: string): ProductImportParseResult {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(csv, { type: 'string', cellDates: false }); } catch { return { model: null, models: [], issues: [{ sheet: 'CSV', row: 1, message: 'The file is not a readable CSV file.' }] }; }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = firstSheet ? XLSX.utils.sheet_to_json<ImportRow>(firstSheet, { defval: '' }) : [];
  if (!rows.length) return { model: null, models: [], issues: [{ sheet: 'CSV', row: 1, message: 'The CSV file is empty.' }] };
  const sections = rows.map((row) => text(row, 'section') || text(row, 'sheet'));
  if (sections.some((section) => PROTOTYPE_IMPORT_SHEETS.includes(section as typeof PROTOTYPE_IMPORT_SHEETS[number]))) {
    const prototype = Object.fromEntries(PROTOTYPE_IMPORT_SHEETS.map((section) => [section, [] as ImportRow[]])) as Record<string, ImportRow[]>;
    const issues: ImportIssue[] = [];
    rows.forEach((row, index) => {
      const section = text(row, 'section') || text(row, 'sheet');
      if (!PROTOTYPE_IMPORT_SHEETS.includes(section as typeof PROTOTYPE_IMPORT_SHEETS[number])) { issues.push({ sheet: 'CSV', row: index + 2, message: `Unknown prototype section: ${section}.` }); return; }
      const cleaned = { ...row }; delete cleaned.section; delete cleaned.sheet; prototype[section].push(cleaned);
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
    const cleaned = { ...row };
    delete cleaned.section; delete cleaned.sheet;
    grouped[section].push(cleaned);
  });
  const parsed = validateProductGroups(grouped);
  const rowIssues = rowLimitIssue('CSV', importRowCount(grouped));
  if (rowIssues.length) return { model: null, models: [], issues: rowIssues };
  const productIssues = productLimitIssue(parsed.models.length);
  return productIssues.length ? { model: null, models: [], issues: productIssues } : { ...parsed, issues: [...issues, ...parsed.issues] };
}

function jsonRows(value: unknown, sheet: string): ImportRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ImportRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
}

export function parseProductJson(inputText: string): ProductImportParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(inputText); } catch { return { model: null, models: [], issues: [{ sheet: 'JSON', row: 1, message: 'The file is not valid JSON.' }] }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { model: null, models: [], issues: [{ sheet: 'JSON', row: 1, message: 'The JSON root must be an object containing the import sections.' }] };
  const source = parsed as Record<string, unknown>;
  if (Array.isArray(source.products)) {
    const dataRows = source.products.reduce((sum, product) => {
      if (!product || typeof product !== 'object' || Array.isArray(product)) return sum;
      const item = product as Record<string, unknown>;
      return sum + IMPORT_SHEETS.reduce((count, sheet) => count + jsonRows(item[sheet], sheet).length, 0);
    }, 0);
    const rowIssues = rowLimitIssue('JSON', dataRows);
    if (rowIssues.length) return { model: null, models: [], issues: rowIssues };
    const models: ImportWorkbookModel[] = [];
    const issues: ImportIssue[] = [];
    source.products.forEach((product, index) => {
      if (!product || typeof product !== 'object' || Array.isArray(product)) { issues.push({ sheet: 'JSON', row: index + 1, message: 'Each products entry must be a product import object.', fatal: false }); return; }
      const item = product as Record<string, unknown>;
      const parsedProduct = validateImportRows(Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, jsonRows(item[sheet], sheet)])));
      if (parsedProduct.model) models.push(parsedProduct.model);
      issues.push(...parsedProduct.issues.map((issue) => ({ ...issue, productKey: text((jsonRows(item.Basic_Info, 'Basic_Info')[0] || {}), 'product_key'), fatal: false })));
    });
    if (!models.length && issues.length) issues.push({ sheet: 'JSON', row: 1, message: 'No product entries passed validation.' });
    const productIssues = productLimitIssue(models.length);
    return productIssues.length ? { model: null, models: [], issues: productIssues } : { model: models.length === 1 ? models[0] : null, models, issues };
  }
  const rows = Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, jsonRows(source[sheet], sheet)]));
  const rowIssues = rowLimitIssue('JSON', importRowCount(rows));
  return rowIssues.length ? { model: null, models: [], issues: rowIssues } : validateProductGroups(rows);
}

export function normalizeImportRow(row: ImportRow) {
  return { ...row, highlights: list(row, 'highlights'), importantInfo: list(row, 'important_information'), thingsToCarry: list(row, 'things_to_carry'), safetyMeasures: list(row, 'safety_measures'), terms: list(row, 'terms'), howToRedeem: list(row, 'how_to_redeem'), additionalInfo: list(row, 'additional_information'), labels: list(row, 'labels'), lat: number(row, 'latitude'), lon: number(row, 'longitude') };
}

export { bool, list, number, text };
