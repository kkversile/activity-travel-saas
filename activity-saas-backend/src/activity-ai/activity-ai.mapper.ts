type Row = Record<string, any>;
import { validateImportContract } from './activity-ai.schema';
const asArray = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown) => asArray(value).map(text).filter(Boolean);
const firstText = (row: Row, keys: string[]) => { for (const key of keys) { const value = text(row[key]); if (value) return value; } return ''; };
const allowedBasic = ['product_key', 'product_name', 'type', 'sub_type', 'sub_category', 'city', 'state', 'country', 'meeting_model', 'short_description', 'meeting_point', 'address', 'latitude', 'longitude', 'labels'];
const allowedExperience = ['product_key', 'full_description', 'highlights', 'important_information', 'things_to_carry', 'safety_measures', 'terms', 'how_to_redeem', 'additional_information', 'metaname'];
const allowedOption = ['product_key', 'option_code', 'option_name', 'description', 'duration_minutes', 'sharing', 'vehicle_guide_type', 'pickup_included', 'pickup_type', 'pickup_instructions', 'pickup_timings', 'dropoff_included', 'meal_included', 'inclusions', 'exclusions', 'suitable_for'];
const isSafeHttpsUrl = (value: unknown) => {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};
const firstHttpsUrl = (value: unknown) => {
  const match = text(value).match(/https:\/\/[^\s\])}"']+/i);
  return match?.[0]?.replace(/[.,;]+$/g, '') || '';
};
const decoded = (value: unknown) => {
  let result = text(value);
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(result);
      if (next === result) break;
      result = next;
    } catch {
      break;
    }
  }
  return result;
};
const embeddedGoogleImageUrl = (value: unknown) => {
  const match = decoded(value).match(/https:\/\/(?:lh\d+\.googleusercontent\.com|[^/\s"'<>!]+\.ggpht\.com)\/[^\s"'<>!]+/i);
  return match?.[0]?.replace(/[.,;)\]}]+$/g, '') || '';
};
const isGoogleMapsPage = (value: string) => {
  try { return /(^|\.)google\.[^/]+$/i.test(new URL(value).hostname) && new URL(value).pathname.includes('/maps'); } catch { return false; }
};
function normalizeMedia(row: Row) {
  const candidate = firstText(row, ['url', 'external_url', 'externalUrl', 'image_url', 'imageUrl']);
  const sourceCandidate = firstText(row, ['source_url', 'sourceUrl', 'page_url', 'pageUrl']);
  const url = embeddedGoogleImageUrl(candidate) || embeddedGoogleImageUrl(sourceCandidate) || (isGoogleMapsPage(candidate) ? '' : candidate);
  const sourceUrl = firstHttpsUrl(sourceCandidate) || firstHttpsUrl(candidate);
  if (!isSafeHttpsUrl(url)) return null;
  return {
    kind: 'IMAGE',
    url,
    ...(isSafeHttpsUrl(sourceUrl) ? { source_url: sourceUrl } : {}),
    description: firstText(row, ['description', 'alt_text', 'altText', 'caption']) || 'AI-suggested activity image',
    requires_review: true,
  };
}
function pick(row: Row, keys: string[]) { return Object.fromEntries(keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]])); }
function normalizeBasic(row: Row) { const value = pick(row, allowedBasic); value.type = firstText(row, ['type', 'activity_type']) || 'ACTIVITY'; value.product_name = firstText(row, ['product_name', 'activityName', 'activity_name', 'name']); value.product_key = text(value.product_key); value.sub_type = firstText(row, ['sub_type', 'subType', 'category']) || undefined; value.sub_category = firstText(row, ['sub_category', 'subCategory', 'category']) || undefined; value.city = firstText(row, ['city', 'cityName']); value.state = firstText(row, ['state', 'stateName']); value.country = firstText(row, ['country', 'countryName']); value.short_description = firstText(row, ['short_description', 'shortDescription', 'summary']); value.meeting_point = firstText(row, ['meeting_point', 'meetingPoint']) || undefined; value.address = firstText(row, ['address', 'full_address']) || undefined; value.latitude = row.latitude ?? row.lat ?? undefined; value.longitude = row.longitude ?? row.lon ?? undefined; value.labels = list(value.labels); return value; }
function normalizeExperience(row: Row) { const value = pick(row, allowedExperience); value.full_description = firstText(row, ['full_description', 'description', 'fullDescription']); if (row.highlights === undefined && row.highlight !== undefined) row.highlights = row.highlight; for (const key of ['highlights', 'important_information', 'things_to_carry', 'safety_measures', 'terms', 'how_to_redeem', 'additional_information']) value[key] = list(row[key]); return value; }
function normalizeOption(row: Row, index: number) { const value = pick(row, allowedOption); value.option_code = firstText(row, ['option_code', 'optionCode', 'code']) || `AI-OPTION-${index + 1}`; value.option_name = firstText(row, ['option_name', 'optionName', 'name', 'title']); value.description = firstText(row, ['description', 'summary']); for (const key of ['inclusions', 'exclusions', 'suitable_for']) value[key] = list(value[key]); return value; }
export function sanitizeDraft(raw: Record<string, unknown>) {
  const basic = asArray(raw.Basic_Info)[0] as Row || {}; const experience = asArray(raw.Experience)[0] as Row || {};
  const productKey = text(basic.product_key) || `AI-${Date.now()}`; const safeBasic = { ...normalizeBasic(basic), product_key: productKey }; const safeExperience = { ...normalizeExperience(experience), product_key: productKey };
  const options = asArray(raw.Options).map((row, index) => ({ ...normalizeOption((row || {}) as Row, index), product_key: productKey }));
  const mediaRows = [...asArray(raw.Media), ...asArray(experience.additional_information).map((source) => ({ source_url: text(source), description: 'Google Maps photo suggestion' }))];
  const media = mediaRows.map((row) => normalizeMedia((row || {}) as Row)).filter(Boolean).filter((item, index, items) => items.findIndex((candidate) => candidate?.url === item?.url) === index).slice(0, 8);
  return { Basic_Info: [safeBasic], Experience: [safeExperience], Options: options, Rate_Plans: [], Availability: [], Media: media, Booking_Questions: [], Fulfilment: [] };
}
export function validateDraft(draft: Record<string, unknown>) {
  const safe = sanitizeDraft(draft); const errors: string[] = []; const missingSupplierData: string[] = []; const basic = safe.Basic_Info[0] as Row; const experience = safe.Experience[0] as Row;
  if (!text(basic.product_name)) errors.push('Activity name is required.');
  if (!text(basic.city) || !text(basic.state) || !text(basic.country)) missingSupplierData.push('Confirm city, state and country.');
  if (!text(experience.full_description)) errors.push('Experience description is required.');
  if (!safe.Options.length) missingSupplierData.push('Confirm at least one real supplier option.');
  if (safe.Options.some((row: any) => !text(row.option_code) || !text(row.option_name))) errors.push('Each option needs an option code and name.');
  missingSupplierData.push('Supplier pricing and rate-plan rules', 'Operating dates, days and capacity', 'Meeting point and fulfilment contacts', 'Images and legal/safety verification');
  return { valid: errors.length === 0, errors, warnings: ['AI text is a suggestion. Review it before using it in a product.'], missingSupplierData, draft: safe };
}
export function prepareImport(rawDraft: Record<string, unknown>, supplierData?: Record<string, unknown>) {
  const base = sanitizeDraft(rawDraft) as Record<string, any>; const supplied = supplierData || {};
  for (const section of ['Basic_Info', 'Experience', 'Options', 'Rate_Plans', 'Availability', 'Media', 'Booking_Questions', 'Fulfilment']) if (supplied[section] !== undefined) base[section] = Array.isArray(supplied[section]) ? supplied[section] : [];
  const errors: string[] = []; const warnings = ['AI text is a suggestion. Review it before importing.'];
  const basic = base.Basic_Info?.[0] as Row || {}; const experience = base.Experience?.[0] as Row || {};
  if (!text(basic.product_name)) errors.push('Activity name is required.');
  if (!text(experience.full_description)) errors.push('Experience description is required.');
  if (!base.Options.length) errors.push('Add at least one confirmed supplier option.');
  if (!base.Rate_Plans.length) errors.push('Add at least one rate plan in the normal product wizard.');
  if (!base.Availability.length) errors.push('Add at least one availability schedule in the normal product wizard.');
  const optionCodes = new Set(base.Options.map((row: Row) => text(row.option_code)).filter(Boolean));
  for (const [index, row] of base.Rate_Plans.entries()) {
    if (!text(row.rate_plan_code) || !text(row.rate_plan_name) || !text(row.valid_from) || !text(row.valid_to)) errors.push(`Rate_Plans row ${index + 1}: rate plan code, name and selling dates are required.`);
    if (text(row.option_code) && !optionCodes.has(text(row.option_code))) errors.push(`Rate_Plans row ${index + 1}: option code does not match a confirmed option.`);
  }
  for (const [index, row] of base.Availability.entries()) {
    if (!text(row.schedule_code) || !text(row.effective_from) || !text(row.effective_to)) errors.push(`Availability row ${index + 1}: schedule code and effective dates are required.`);
    if (text(row.option_code) && !optionCodes.has(text(row.option_code))) errors.push(`Availability row ${index + 1}: option code does not match a confirmed option.`);
  }
  errors.push(...validateImportContract(base));
  return { ready: errors.length === 0, errors: [...new Set(errors)], warnings, payload: base };
}
