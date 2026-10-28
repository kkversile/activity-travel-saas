import { ProductType } from '@prisma/client';

type Row = Record<string, any>;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split('|').map((item) => item.trim()).filter(Boolean);

export const VOYA_TAXONOMY = {
  ACTIVITY: ['EXPERIENCE', 'GUIDED_TOUR', 'ATTRACTION', 'TICKET_ONLY'],
  MEALS: ['RESTAURANT', 'DINING_EXPERIENCE', 'COOKING_CLASS'],
  TRANSFER: ['AIRPORT_TRANSFER', 'POINT_TO_POINT', 'SHUTTLE'],
  PACKAGE_ADDON: ['EXCURSION', 'EQUIPMENT_RENTAL', 'SERVICE_ADDON'],
  OTHERS: ['OTHER'],
} as const;

type TaxonomyType = keyof typeof VOYA_TAXONOMY;

/** Map free-form AI/category text into the same taxonomy used by the wizard. */
export function normalizeTaxonomy(rawType: unknown, rawSubType: unknown, rawCategory: unknown) {
  const type = text(rawType).toUpperCase() as TaxonomyType;
  const safeType: TaxonomyType = Object.prototype.hasOwnProperty.call(VOYA_TAXONOMY, type) ? type : 'ACTIVITY';
  const candidate = `${text(rawSubType)} ${text(rawCategory)}`.toLowerCase();
  const direct = text(rawSubType).toUpperCase().replace(/[ -]+/g, '_');
  if ((VOYA_TAXONOMY[safeType] as readonly string[]).includes(direct)) return { type: safeType, subType: direct };
  if (safeType === 'ACTIVITY') {
    if (/ticket|theme park|water park|adventure park|attraction|museum|zoo/.test(candidate)) return { type: safeType, subType: 'ATTRACTION' };
    if (/tour|guided|walk|trek|trail|safari|cruise/.test(candidate)) return { type: safeType, subType: 'GUIDED_TOUR' };
    return { type: safeType, subType: 'EXPERIENCE' };
  }
  if (safeType === 'MEALS') {
    if (/cook|culinary|class/.test(candidate)) return { type: safeType, subType: 'COOKING_CLASS' };
    if (/dining|tasting|food experience/.test(candidate)) return { type: safeType, subType: 'DINING_EXPERIENCE' };
    return { type: safeType, subType: 'RESTAURANT' };
  }
  if (safeType === 'TRANSFER') {
    if (/airport|flight/.test(candidate)) return { type: safeType, subType: 'AIRPORT_TRANSFER' };
    if (/shuttle|shared/.test(candidate)) return { type: safeType, subType: 'SHUTTLE' };
    return { type: safeType, subType: 'POINT_TO_POINT' };
  }
  if (safeType === 'PACKAGE_ADDON') {
    if (/equipment|rental|hire/.test(candidate)) return { type: safeType, subType: 'EQUIPMENT_RENTAL' };
    if (/service|addon|add-on/.test(candidate)) return { type: safeType, subType: 'SERVICE_ADDON' };
    return { type: safeType, subType: 'EXCURSION' };
  }
  return { type: safeType, subType: 'OTHER' };
}

/**
 * The AI module deliberately keeps this validator next to the mapper, but it
 * mirrors the canonical JSON importer contract rather than creating a second
 * product format. It is used only for Stage B (supplier-confirmed payloads).
 */
export function validateImportContract(payload: Record<string, any>) {
  const errors: string[] = [];
  const basicRows = Array.isArray(payload.Basic_Info) ? payload.Basic_Info : [];
  const experienceRows = Array.isArray(payload.Experience) ? payload.Experience : [];
  const options = Array.isArray(payload.Options) ? payload.Options : [];
  const ratePlans = Array.isArray(payload.Rate_Plans) ? payload.Rate_Plans : [];
  const availability = Array.isArray(payload.Availability) ? payload.Availability : [];

  if (basicRows.length !== 1) errors.push('Basic_Info must contain exactly one product row.');
  if (experienceRows.length !== 1) errors.push('Experience must contain exactly one row.');
  if (!options.length) errors.push('Options must contain at least one confirmed option.');
  if (!ratePlans.length) errors.push('Rate_Plans must contain at least one confirmed rate plan.');
  if (!availability.length) errors.push('Availability must contain at least one confirmed schedule.');

  const basic = (basicRows[0] || {}) as Row;
  const experience = (experienceRows[0] || {}) as Row;
  for (const field of ['product_key', 'product_name', 'type', 'sub_type', 'sub_category', 'city', 'state', 'country', 'meeting_model', 'short_description']) {
    if (!text(basic[field])) errors.push(`Basic_Info: ${field} is required.`);
  }
  if (text(basic.type) && !Object.values(ProductType).includes(text(basic.type).toUpperCase() as ProductType)) {
    errors.push(`Basic_Info: unsupported type "${text(basic.type)}". Choose a supported VOYA product type.`);
  }
  const taxonomyType = text(basic.type).toUpperCase() as TaxonomyType;
  const allowedSubTypes = VOYA_TAXONOMY[taxonomyType];
  const normalizedSubType = text(basic.sub_type).toUpperCase().replace(/[ -]+/g, '_');
  if (allowedSubTypes && !allowedSubTypes.includes(normalizedSubType as never)) {
    errors.push(`Basic_Info: unsupported sub_type "${text(basic.sub_type)}" for ${taxonomyType}. Choose one of ${allowedSubTypes.join(', ')}.`);
  }
  if (!text(experience.full_description)) errors.push('Experience: full_description is required.');

  const productKey = text(basic.product_key);
  const allRows = [...experienceRows, ...options, ...ratePlans, ...availability];
  allRows.forEach((row, index) => {
    if (productKey && text(row.product_key) && text(row.product_key) !== productKey) errors.push(`Row ${index + 1}: product_key must be ${productKey}.`);
  });

  const optionCodes = new Set<string>();
  options.forEach((row, index) => {
    const code = text(row.option_code);
    if (!code) errors.push(`Options row ${index + 1}: option_code is required.`);
    else if (optionCodes.has(code)) errors.push(`Options row ${index + 1}: duplicate option_code ${code}.`);
    else optionCodes.add(code);
    if (!text(row.option_name)) errors.push(`Options row ${index + 1}: option_name is required.`);
  });

  const rateCodes = new Set<string>();
  ratePlans.forEach((row, index) => {
    const code = text(row.rate_plan_code);
    if (!code) errors.push(`Rate_Plans row ${index + 1}: rate_plan_code is required.`);
    else if (rateCodes.has(code)) errors.push(`Rate_Plans row ${index + 1}: duplicate rate_plan_code ${code}.`);
    else rateCodes.add(code);
    if (!text(row.option_code) || !optionCodes.has(text(row.option_code))) errors.push(`Rate_Plans row ${index + 1}: option_code must match a confirmed option.`);
    for (const field of ['rate_plan_name', 'valid_from', 'valid_to']) if (!text(row[field])) errors.push(`Rate_Plans row ${index + 1}: ${field} is required.`);
    const pricingUnit = text(row.pricing_unit).toUpperCase() || 'PER_PERSON';
    const priceField = pricingUnit === 'PER_PERSON' ? 'adult_price' : 'supplier_base_amount';
    if (row[priceField] === undefined || row[priceField] === null || String(row[priceField]).trim() === '') errors.push(`Rate_Plans row ${index + 1}: ${priceField} is required.`);
    else if (!Number.isFinite(Number(row[priceField])) || Number(row[priceField]) < 0) errors.push(`Rate_Plans row ${index + 1}: ${priceField} must be a non-negative number.`);
  });

  availability.forEach((row, index) => {
    if (!text(row.option_code) || !optionCodes.has(text(row.option_code))) errors.push(`Availability row ${index + 1}: option_code must match a confirmed option.`);
    for (const field of ['schedule_code', 'effective_from', 'effective_to']) if (!text(row[field])) errors.push(`Availability row ${index + 1}: ${field} is required.`);
    if (!list(row.operating_days).length) errors.push(`Availability row ${index + 1}: operating_days must contain at least one day.`);
    if (row.default_capacity === undefined || row.default_capacity === null || String(row.default_capacity).trim() === '') errors.push(`Availability row ${index + 1}: default_capacity is required.`);
    else if (!Number.isFinite(Number(row.default_capacity)) || Number(row.default_capacity) < 1) errors.push(`Availability row ${index + 1}: default_capacity must be at least 1.`);
    const operatingModel = text(row.operating_model).toUpperCase();
    if (operatingModel !== 'ALL_DAY' && (!text(row.start_time) || !text(row.end_time))) errors.push(`Availability row ${index + 1}: start_time and end_time are required for timed schedules.`);
  });

  return errors;
}
