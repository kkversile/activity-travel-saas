// Pure contract shared with the browser's Excel/CSV/JSON importer.
// Keep this module free of server dependencies so templates and API checks agree.
export const DURATION_UNITS = ['HOURS', 'DAYS', 'FLEXIBLE'] as const;
// PostgreSQL decimal(18,4). Compare the decimal string, not a rounded JS number.
export const MONEY_AMOUNT_PATTERN = /^0*\d{1,14}(\.\d{1,4})?$/;
export const MAX_MONEY_AMOUNT = '99999999999999.9999';
export const MONEY_AMOUNT_GUIDANCE = `Enter a non-negative amount from 0 to ${MAX_MONEY_AMOUNT}, with up to four decimal places and no currency symbol or thousands separators.`;
export const isMoneyAmount = (value: unknown): boolean =>
  value !== null && value !== undefined && MONEY_AMOUNT_PATTERN.test(String(value));
export const importChoices: Record<string, Record<string, readonly string[]>> = {
  Basic_Info: {
    type: ['ACTIVITY', 'MEALS', 'TRANSFER', 'PACKAGE_ADDON', 'OTHERS'],
    meeting_model: ['FIXED_MEETING_POINT', 'PICKUP_AVAILABLE', 'FLEXIBLE_ENTRY'],
    duration_unit: DURATION_UNITS,
    guide_included: ['WITH_GUIDE', 'WITHOUT_GUIDE'],
    voucher_code_source: ['PLATFORM', 'SUPPLIER_BARCODE_POOL', 'SUPPLIER_API', 'NONE'],
    voucher_accepted_as: ['MOBILE_VOUCHER', 'PRINTED_VOUCHER', 'BOOKING_REFERENCE'],
    follow_itinerary: ['true', 'false'],
  },
  Options: { sharing: ['Shared', 'Private'], pickup_included: ['true', 'false'], dropoff_included: ['true', 'false'], meal_included: ['true', 'false'] },
  Ticket_Types: { needs_adult: ['true', 'false'], counts_capacity: ['true', 'false'] },
  Rate_Plans: {
    pricing_unit: ['PER_PERSON', 'PER_BOOKING', 'PER_UNIT', 'GROUP'],
    booking_mode: ['INSTANT', 'VENDOR_CONFIRMATION', 'MANUAL_ON_REQUEST'],
    supplier_model: ['NET_RATE', 'COMMISSIONABLE', 'GROSS_RATE', 'HYBRID'],
    mrp_mode: ['YES', 'NO'],
  },
  Availability: {
    operating_model: ['ALL_DAY', 'FIXED_SLOT', 'MULTIPLE_SLOTS', 'DATE_CAPACITY', 'ON_REQUEST_DATE'],
    capacity_unit: ['PERSON', 'BOOKING', 'UNIT'], materialize: ['true', 'false'],
  },
  Media: { kind: ['IMAGE', 'VIDEO'] },
  Booking_Questions: { required: ['true', 'false'], applies_per_traveller: ['true', 'false'] },
  Fulfilment: { review_required: ['true', 'false'] },
};

const token = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
export function canonicalDuration(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value;
  const key = token(value);
  return ({ HOUR: 'HOURS', HR: 'HOURS', HRS: 'HOURS', DAY: 'DAYS' } as Record<string, string>)[key] || key;
}

export type ChoiceIssue = { field: string; value: string; allowedValues?: readonly string[]; message: string; correction: string };

export function importProductCurrency(basic: Record<string, unknown>, rates: Record<string, unknown>[]): { currency: string; issue?: ChoiceIssue } {
  const explicit = String(basic.currency ?? '').trim().toUpperCase();
  const currencies = [...new Set(rates.map(row => String(row.currency || 'INR').trim().toUpperCase()))];
  const currency = explicit || currencies[0] || 'INR';
  const invalid = explicit && !/^[A-Z]{3}$/.test(explicit);
  const ambiguous = !explicit && currencies.length > 1;
  const mismatch = explicit && currencies.length > 0 && !currencies.includes(explicit);
  if (invalid || ambiguous || mismatch) return { currency, issue: {
    field: 'currency', value: explicit || currencies.join(', '),
    message: invalid ? 'Product currency must be a three-letter currency code.' : ambiguous ? 'This product has rates in multiple currencies; choose its default currency.' : 'Product currency does not match any imported rate currency.',
    correction: invalid ? 'Enter a three-letter code such as INR or USD.' : `Set currency on the product row to ${currencies.join(' or ')}, or split the product by currency.`,
  } };
  return { currency };
}

/** Infer only defaults shared by every plan for an option, never pick one of
 * several conflicting rate-plan limits as an option-wide restriction. */
export function importOptionBookingDefaults(rates: Record<string, unknown>[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [field, column, fallback] of [['minPax', 'min_pax', 1], ['maxPax', 'max_pax', 99], ['cutOffMinutes', 'cutoff_minutes', 0]] as const) {
    const values = [...new Set(rates.map(row => row[column] == null || String(row[column]).trim() === '' ? fallback : Number(row[column])))];
    if (values.length === 1 && Number.isFinite(values[0])) result[field] = values[0];
  }
  return result;
}
export type ImportNumberRule = { min: number; max?: number; integer?: boolean; exclusiveMin?: boolean; decimals?: number; money?: boolean };
const money: ImportNumberRule = { min: 0, decimals: 4, money: true };
const count: ImportNumberRule = { min: 0, integer: true };
export const importNumberRules: Record<string, Record<string, ImportNumberRule>> = {
  Basic_Info: { duration_value: { min: 0, exclusiveMin: true } },
  Options: { duration_minutes: count },
  Ticket_Types: { age_from: count, age_to: count },
  Rate_Plans: {
    adult_price: money, child_price: money, senior_price: money, supplier_base_amount: money, mrp_amount: money,
    min_pax: { min: 1, integer: true }, max_pax: { min: 1, integer: true }, cutoff_minutes: count,
    adult_min_count: count, adult_max_count: count, child_min_count: count, child_max_count: count, group_min_count: count, group_max_count: count,
    cancel_7_days_pct: { min: 0, max: 100 }, cancel_3_days_pct: { min: 0, max: 100 }, cancel_0_days_pct: { min: 0, max: 100 },
  },
  Availability: { default_capacity: count }, Media: { rank: count }, Booking_Questions: { rank: count },
};
export const IMPORT_OPERATING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const isImportDate = (value: unknown): boolean => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const importProductContentKey = (row: Record<string, unknown>) => JSON.stringify([
  String(row.product_name ?? '').trim().toLowerCase(), String(row.type ?? '').trim().toUpperCase(),
  ...['city','state','country'].map(field => String(row[field] ?? '').trim().toLowerCase()),
]);

export function importMediaIssues(row: Record<string, unknown>) {
  const value = (key:string) => String(row[key] ?? '').trim();
  const url = value('external_url'), asset = value('file_asset_id');
  const issues: Array<{field:string;value:string;message:string;correction:string}> = [];
  const problem = (field:string,message:string,correction:string) => issues.push({field,value:value(field),message,correction});
  if (Boolean(url) === Boolean(asset)) problem('file_asset_id','Provide exactly one of file_asset_id or external_url.','For images use an uploaded file_asset_id. For videos provide either an uploaded asset or a supported HTTP/HTTPS URL.');
  if (url && (value('kind').toUpperCase() || 'IMAGE') === 'IMAGE') problem('external_url','Images require an uploaded, validated image asset.','Remove external_url and enter the file_asset_id of an image uploaded by this vendor, or add images in the product editor after import.');
  if (url) { try { const parsed = new URL(url); if (!['http:','https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error(); } catch { problem('external_url','external_url must be a valid HTTP or HTTPS URL.','Use a complete HTTP/HTTPS video URL, or an uploaded file_asset_id.'); } }
  return issues;
}
const isImportTime = (value: unknown): boolean => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';

export function normalizeImportChoices(section: string, original: Record<string, unknown>) {
  const row = { ...original };
  const issues: ChoiceIssue[] = [];
  for (const [field, allowedValues] of Object.entries(importChoices[section] || {})) {
    if (row[field] === undefined || row[field] === null || String(row[field]).trim() === '') continue;
    let key = field === 'duration_unit' ? token(canonicalDuration(row[field])) : token(row[field]);
    const boolean = allowedValues[0] === 'true';
    if (boolean) key = ['YES', 'Y', '1'].includes(key) ? 'TRUE' : ['NO', 'N', '0'].includes(key) ? 'FALSE' : key;
    const canonical = allowedValues.find((value) => token(value) === key);
    if (canonical === undefined) {
      issues.push({ field, value: String(row[field]), allowedValues, message: `“${String(row[field])}” is not a valid ${field}.`, correction: `Choose ${allowedValues.join(', ')}.` });
    } else row[field] = boolean ? canonical === 'true' : canonical;
  }
  const problem = (field: string, correction: string, message = `“${String(row[field] ?? '')}” is not a valid ${field}.`) =>
    issues.push({ field, value: String(row[field] ?? ''), message, correction });
  for (const [field, rule] of Object.entries(importNumberRules[section] || {})) {
    if (!present(row[field])) continue;
    const raw = String(row[field]).trim(); const number = Number(raw);
    if (rule.money && !isMoneyAmount(raw)) {
      problem(field, MONEY_AMOUNT_GUIDANCE);
      continue;
    }
    const fraction = raw.split('.')[1]?.length || 0;
    if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER ||
        (rule.integer && !Number.isSafeInteger(number)) || (rule.exclusiveMin ? number <= rule.min : number < rule.min) ||
        (rule.max !== undefined && number > rule.max) || (rule.decimals !== undefined && fraction > rule.decimals)) {
      problem(field, `Enter a ${rule.integer ? 'whole number' : 'number'} ${rule.exclusiveMin ? 'greater than' : 'at least'} ${rule.min}${rule.max === undefined ? '' : ` and at most ${rule.max}`}${rule.decimals === undefined ? '' : `, with up to ${rule.decimals} decimal places`}. Do not enter words, symbols or thousands separators.`);
    } else if (typeof row[field] === 'string') row[field] = raw;
  }
  const dateFields = section === 'Rate_Plans' ? ['valid_from', 'valid_to'] : section === 'Availability' ? ['effective_from', 'effective_to'] : [];
  for (const field of dateFields) {
    if (!present(row[field])) continue;
    if (typeof row[field] === 'string') row[field] = (row[field] as string).trim();
    if (!isImportDate(row[field])) problem(field, 'Enter a real calendar date as YYYY-MM-DD, for example 2026-12-15.');
  }
  if (dateFields.length && isImportDate(row[dateFields[0]]) && isImportDate(row[dateFields[1]])) {
    const [from, to] = dateFields;
    if (section === 'Rate_Plans' ? String(row[to]) <= String(row[from]) : String(row[to]) < String(row[from])) {
      problem(to, `Set ${to} ${section === 'Rate_Plans' ? 'after' : 'on or after'} ${from}.`, `${to} is before the allowed start of this date range.`);
    }
  }
  if (section === 'Rate_Plans') {
    for (const [min, max] of [['min_pax', 'max_pax'], ['adult_min_count', 'adult_max_count'], ['child_min_count', 'child_max_count'], ['group_min_count', 'group_max_count']]) {
      if (present(row[min]) && present(row[max]) && Number(row[max]) < Number(row[min])) problem(max, `Set ${max} to at least ${min}.`);
    }
  }
  if (section === 'Availability') {
    if (present(row.operating_days)) {
      const days = Array.isArray(row.operating_days) ? row.operating_days : String(row.operating_days).split('|');
      const normalized = days.map((value) => String(value).trim().toUpperCase());
      if (normalized.some((value) => !IMPORT_OPERATING_DAYS.includes(value as typeof IMPORT_OPERATING_DAYS[number]))) {
        problem('operating_days', `Use ${IMPORT_OPERATING_DAYS.join(', ')} separated by |, for example MON|WED|FRI.`);
      } else row.operating_days = [...new Set(normalized)].join('|');
    }
    for (const field of ['start_time', 'end_time']) {
      if (!present(row[field])) continue;
      if (!isImportTime(row[field])) problem(field, 'Enter a 24-hour time as HH:mm, from 00:00 to 23:59.');
    }
    if (isImportTime(row.start_time) && isImportTime(row.end_time) && String(row.end_time) <= String(row.start_time)) problem('end_time', 'Set end_time after start_time.');
    if (present(row.slots_json)) {
      try {
        const slots = JSON.parse(String(row.slots_json));
        if (Array.isArray(slots)) slots.forEach((slot, index) => {
          if (!isImportTime(slot?.startTime) || !isImportTime(slot?.endTime) || slot.endTime <= slot.startTime) problem('slots_json', `Correct slot ${index + 1}: use valid HH:mm times with endTime after startTime.`);
        });
      } catch { /* The structural JSON validator supplies the syntax error. */ }
    }
  }
  return { row, issues };
}
