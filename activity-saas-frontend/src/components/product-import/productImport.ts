import * as XLSX from 'xlsx';

export const IMPORT_SHEETS = ['Basic_Info', 'Experience', 'Options', 'Rate_Plans', 'Availability', 'Media', 'Booking_Questions', 'Fulfilment'] as const;

export type ImportRow = Record<string, unknown>;
export type ImportIssue = { sheet: string; row: number; message: string };
export type ImportWorkbookModel = {
  basic: ImportRow;
  experience: ImportRow;
  options: ImportRow[];
  ratePlans: ImportRow[];
  availability: ImportRow[];
  media: ImportRow[];
  bookingQuestions: ImportRow[];
  fulfilment: ImportRow;
};

const demoRows: Record<string, ImportRow[]> = {
  Basic_Info: [{ product_key: 'MUNNAR_SUNRISE_SPICE', product_name: 'Munnar Sunrise Spice Garden Walk', type: 'ACTIVITY', sub_type: 'GUIDED TOUR', sub_category: 'Spice garden and guided nature walks', city: 'Munnar', state: 'Kerala', country: 'India', meeting_model: 'PICKUP_AVAILABLE', short_description: 'A guided sunrise walk through Munnar’s spice gardens with a local host, scenic viewpoints, plantation stories and a tasting of freshly grown spices and tea.', meeting_point: 'Munnar Spice Garden entrance', address: 'Munnar, Devikulam, Idukki, Kerala, 685612, India', latitude: 10.086996, longitude: 77.060091, labels: 'munnar|spice-garden|sunrise|guided-tour|family-friendly' }],
  Experience: [{ product_key: 'MUNNAR_SUNRISE_SPICE', full_description: 'Guests join a local host for a relaxed sunrise walk through Munnar’s spice-growing hills. The experience combines plantation stories, valley viewpoints, a short nature trail and a tasting of locally grown spices and tea. It is suitable for couples, families and small private groups.', highlights: 'Spice garden sunrise walk|Plantation stories|Valley viewpoints|Local spice and tea tasting', important_information: 'Wear comfortable walking shoes|Bring water|Expect uneven paths|Share dietary requirements before arrival', things_to_carry: 'Comfortable walking shoes|Sun protection|Reusable water bottle|Light rain layer', safety_measures: 'Stay with the host|Watch for uneven ground|Do not touch plantation equipment|Follow local weather guidance', terms: 'Tickets are non-transferable after the activity starts|Subject to weather and local access conditions|Children must be accompanied by an adult', how_to_redeem: 'Show the confirmation voucher to the host at the meeting point.|Arrive 15 minutes before the selected start time.', additional_information: 'Meeting point is outdoors.|Please share allergies or mobility requirements during booking.', metaname: 'Munnar Sunrise Spice Garden Walk' }],
  Options: [
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'SUNRISE-SHARED', option_name: 'Sunrise Shared Spice Walk', description: 'A shared sunrise walk with plantation stories, scenic viewpoints and a local spice and tea tasting.', duration_minutes: 120, sharing: 'Shared', vehicle_guide_type: 'Local naturalist guide', pickup_included: true, pickup_type: 'Hotel pickup within Munnar', pickup_instructions: 'Host confirms the exact pickup point by phone one day before the walk.', pickup_timings: '06:00-06:30', dropoff_included: false, meal_included: false, inclusions: 'Guided nature walk|Spice garden visit|Tea tasting|Hotel pickup', exclusions: 'Personal expenses|Gratuities|Meals not listed', suitable_for: 'Couples|Families|Small groups|Nature lovers' },
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'PRIVATE-SPICE-WALK', option_name: 'Private Spice Garden Walk', description: 'A private guided sunrise walk for one group with a dedicated host, flexible pacing and a private spice and tea tasting.', duration_minutes: 150, sharing: 'Private', vehicle_guide_type: 'Dedicated local naturalist guide', pickup_included: true, pickup_type: 'Private hotel pickup within Munnar', pickup_instructions: 'Dedicated host confirms the exact pickup point by phone one day before the walk.', pickup_timings: '05:45-06:15', dropoff_included: false, meal_included: false, inclusions: 'Private guided walk|Spice garden visit|Private tea tasting|Hotel pickup', exclusions: 'Personal expenses|Gratuities|Meals not listed', suitable_for: 'Couples|Families|Private groups|Celebrations' },
  ],
  Rate_Plans: [
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'SUNRISE-SHARED', rate_plan_code: 'RP-SHARED-ADULT-CHILD', rate_plan_name: 'Shared Adult and Child Rate', description: 'Shared per-person pricing for adults and children.', currency: 'INR', valid_from: '2026-10-24', valid_to: '2027-10-24', min_pax: 1, max_pax: 15, cutoff_minutes: 1440, pricing_unit: 'PER_PERSON', booking_mode: 'INSTANT', supplier_model: 'NET_RATE', supplier_base_amount: 0, adult_price: 1800, child_price: 900, senior_price: 1400, adult_min_count: 1, adult_max_count: 15, child_min_count: 0, child_max_count: 15, cancel_7_days_pct: 0, cancel_3_days_pct: 50, cancel_0_days_pct: 100 },
    { product_key: 'MUNNAR_SUNRISE_SPICE', option_code: 'PRIVATE-SPICE-WALK', rate_plan_code: 'RP-PRIVATE-GROUP', rate_plan_name: 'Private Group Rate', description: 'Private group pricing for one booking of up to six guests.', currency: 'INR', valid_from: '2026-10-24', valid_to: '2027-10-24', min_pax: 1, max_pax: 6, cutoff_minutes: 1440, pricing_unit: 'GROUP', booking_mode: 'INSTANT', supplier_model: 'NET_RATE', supplier_base_amount: 7200, adult_min_count: 0, adult_max_count: 6, group_min_count: 1, group_max_count: 6, cancel_7_days_pct: 0, cancel_3_days_pct: 50, cancel_0_days_pct: 100 },
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
  Rate_Plans: 'One row per rate plan. option_code must match Options.',
  Availability: 'One row per schedule. operating_days uses | (pipe).',
  Media: 'External URLs are supported. One row per image or video.',
  Booking_Questions: 'One row per booking question.',
  Fulfilment: 'One row per product. AUTO is the simplest vendor fulfilment mode.',
};

export function createSampleWorkbook() {
  const workbook = XLSX.utils.book_new();
  const readme = [
    ['VOYA vendor product import template'],
    ['Edit the demo rows, keep the sheet names and column headers, then upload this workbook from Products.'],
    ['The upload creates a DRAFT product. Review it in the normal six-step wizard and submit it manually.'],
    ['List fields use | as the separator. Boolean values use TRUE or FALSE. Dates use YYYY-MM-DD.'],
    ['Distribution mapping to VOYA_AGENT remains an admin-side action after vendor submission.'],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(readme), 'README');
  for (const sheet of IMPORT_SHEETS) {
    const rows = demoRows[sheet] || [];
    const worksheet = XLSX.utils.aoa_to_sheet([[sheetNotes[sheet]], []]);
    XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A3', skipHeader: false });
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet);
    worksheet['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 24 }));
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

function sheetRows(workbook: XLSX.WorkBook, name: string): ImportRow[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { range: 2, defval: '' }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
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
  if (!options.length) issues.push({ sheet: 'Options', row: 3, message: 'Add at least one option.' });
  if (!ratePlans.length) issues.push({ sheet: 'Rate_Plans', row: 3, message: 'Add at least one rate plan.' });
  if (!availability.length) issues.push({ sheet: 'Availability', row: 3, message: 'Add at least one availability schedule.' });
  if (fulfilmentRows.length > 1) issues.push({ sheet: 'Fulfilment', row: 4, message: 'Provide only one Fulfilment row.' });
  if (key && [...experienceRows, ...options, ...ratePlans, ...availability, ...media, ...bookingQuestions, ...fulfilmentRows].some((row) => text(row, 'product_key') && text(row, 'product_key') !== key)) issues.push({ sheet: 'Workbook', row: 1, message: 'All sheets must use the same product_key.' });
  const optionCodes = new Set<string>();
  options.forEach((row, index) => { const code = text(row, 'option_code'); if (!code) issues.push({ sheet: 'Options', row: index + 3, message: 'option_code is required.' }); else if (optionCodes.has(code)) issues.push({ sheet: 'Options', row: index + 3, message: `Duplicate option_code: ${code}.` }); else optionCodes.add(code); if (!text(row, 'option_name')) issues.push({ sheet: 'Options', row: index + 3, message: 'option_name is required.' }); });
  const rateCodes = new Set<string>();
  ratePlans.forEach((row, index) => { const code = text(row, 'rate_plan_code'); const optionCode = text(row, 'option_code'); if (!code) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: 'rate_plan_code is required.' }); else if (rateCodes.has(code)) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: `Duplicate rate_plan_code: ${code}.` }); else rateCodes.add(code); if (!text(row, 'rate_plan_name') || !text(row, 'valid_from') || !text(row, 'valid_to')) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: 'rate_plan_name, valid_from and valid_to are required.' }); if (!optionCodes.has(optionCode)) issues.push({ sheet: 'Rate_Plans', row: index + 3, message: `Unknown option_code: ${optionCode}.` }); });
  availability.forEach((row, index) => { if (!optionCodes.has(text(row, 'option_code'))) issues.push({ sheet: 'Availability', row: index + 3, message: `Unknown option_code: ${text(row, 'option_code')}.` }); if (!text(row, 'schedule_code') || !text(row, 'effective_from') || !text(row, 'effective_to')) issues.push({ sheet: 'Availability', row: index + 3, message: 'schedule_code, effective_from and effective_to are required.' }); if (!list(row, 'operating_days').length) issues.push({ sheet: 'Availability', row: index + 3, message: 'At least one operating day is required.' }); });
  if (issues.length) return { model: null, issues };
  return { model: { basic, experience: experienceRows[0], options, ratePlans, availability, media, bookingQuestions, fulfilment: fulfilmentRows[0] || {} }, issues };
}

export function parseProductWorkbook(buffer: ArrayBuffer): { model: ImportWorkbookModel | null; issues: ImportIssue[] } {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: 'array', cellDates: false }); } catch { return { model: null, issues: [{ sheet: 'Workbook', row: 1, message: 'The file is not a readable Excel workbook.' }] }; }
  return validateImportRows(Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, sheetRows(workbook, sheet)])));
}

function jsonRows(value: unknown, sheet: string): ImportRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ImportRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
}

export function parseProductJson(text: string): { model: ImportWorkbookModel | null; issues: ImportIssue[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { model: null, issues: [{ sheet: 'JSON', row: 1, message: 'The file is not valid JSON.' }] }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { model: null, issues: [{ sheet: 'JSON', row: 1, message: 'The JSON root must be an object containing the import sections.' }] };
  const source = parsed as Record<string, unknown>;
  return validateImportRows(Object.fromEntries(IMPORT_SHEETS.map((sheet) => [sheet, jsonRows(source[sheet], sheet)])));
}

export function normalizeImportRow(row: ImportRow) {
  return { ...row, highlights: list(row, 'highlights'), importantInfo: list(row, 'important_information'), thingsToCarry: list(row, 'things_to_carry'), safetyMeasures: list(row, 'safety_measures'), terms: list(row, 'terms'), howToRedeem: list(row, 'how_to_redeem'), additionalInfo: list(row, 'additional_information'), labels: list(row, 'labels'), lat: number(row, 'latitude'), lon: number(row, 'longitude') };
}

export { bool, list, number, text };
