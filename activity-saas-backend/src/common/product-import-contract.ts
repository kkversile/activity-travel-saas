// Pure contract shared with the browser's Excel/CSV/JSON importer.
// Keep this module free of server dependencies so templates and API checks agree.
export const DURATION_UNITS = ['HOURS', 'DAYS', 'FLEXIBLE'] as const;
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

export type ChoiceIssue = { field: string; value: string; allowedValues: readonly string[]; message: string; correction: string };
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
  return { row, issues };
}
