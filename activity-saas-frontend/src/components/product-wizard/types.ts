import type { Product, ProductRevision, ProductVariant, Schedule } from '../../api';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type WizardMode = 'CREATE' | 'EDIT';

export function vendorProductEditPath(productId: string, baseUrl = import.meta.env.BASE_URL) {
  const basePath = baseUrl === '/' ? '' : baseUrl.replace(/\/$/, '');
  return `${basePath}/vendor/products/${encodeURIComponent(productId)}/edit`;
}

export type RevisionForm = {
  productName: string;
  currency: string;
  type: ProductRevision['type'];
  subType: string;
  category: string;
  subCategory: string;
  subCategories: string[];
  shortDescription: string;
  metaname: string;
  description: string;
  highlights: string;
  channels: string[];
  adminRankingBoost: 'NONE' | 'PLUS_ONE' | 'PLUS_TWO';
  terms: string;
  importantInfo: string;
  thingsToCarry: string;
  safetyMeasures: string;
  additionalInfo: string;
  howToRedeem: string;
  cityName: string;
  stateName: string;
  countryName: string;
  address: string;
  lat: string;
  lon: string;
  meetingModel: ProductRevision['meetingModel'] | '';
  meetingPoint: string;
  labels: string;
  hasDifferentialVisitorPricing: boolean;
  durationValue: string;
  durationUnit: 'HOURS' | 'DAYS' | 'FLEXIBLE' | '';
  guideIncluded: 'WITH_GUIDE' | 'WITHOUT_GUIDE' | '';
  guideLanguages: string;
  included: string;
  notIncluded: string;
  endPoint: string;
  thingsToKnow: string;
  accessibility: string;
  followItinerary: boolean;
  voucherCodeSource: 'PLATFORM' | 'SUPPLIER_BARCODE_POOL' | 'SUPPLIER_API' | 'NONE' | '';
  voucherAcceptedAs: 'MOBILE_VOUCHER' | 'PRINTED_VOUCHER' | 'BOOKING_REFERENCE' | '';
  voucherInstructions: string;
  cancellationPreset: 'FLEXIBLE' | 'MODERATE' | 'STRICT' | 'NON_REFUNDABLE' | 'CUSTOM' | '';
  travellerDetails: string;
  amendmentPolicy: 'DATE_CHANGE_24H' | 'NO_AMENDMENTS' | 'CANCEL_REBOOK' | '';
};

export type FulfilmentForm = {
  mode: 'AUTO' | 'AFTER_FULFILMENT' | 'PNR_ONLY' | 'TICKET_QR' | '';
  requiredEvidenceKinds: string[];
  evidenceMatchMode: 'ALL' | 'ANY';
  reviewRequired: boolean;
  operationsContactName: string;
  operationsContactPhone: string;
  operationsContactEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
  voucherNotes: string;
};

export type ActivityBookingQuestionDefault = {
  code: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
  required: boolean;
};

export type ActivityContentSettings = {
  terms: string[];
  howToRedeem: string[];
  bookingQuestions: ActivityBookingQuestionDefault[];
};

export type VariantForm = {
  variantCode: string;
  name: string;
  description: string;
  durationMinutes: string;
  minPax: string;
  maxPax: string;
  cutOffMinutes: string;
  privateShared: string;
  vehicleType: string;
  pickupIncluded: boolean;
  pickupType: string;
  pickupInput: string;
  pickupTimings: string;
  dropoffIncluded: boolean;
  dropoffTimings: string;
  mealIncluded: boolean;
  mealType: string;
  menu: string;
  mealVariety: string;
  pointsOfInterest: string;
  inclusions: string;
  exclusions: string;
  suitableFor: string;
  sourcePayload: Record<string, unknown>;
  ticketTypes: Array<{ name: string; ageFrom: string; ageTo: string; needsAdult: boolean; countsCapacity: boolean }>;
  unitType: string;
  unitMinPax: string;
  unitMaxPax: string;
  paxIncluded: string;
  extraPerPerson: string;
  unitsPerSlot: string;
  unitRows: Array<{ name: string; minPax: string; maxPax: string; paxIncluded: string; extraPerPerson: string; unitsPerSlot: string }>;
};

export type WizardSnapshot = {
  product: Product | null;
  revision: ProductRevision | null;
  variants: ProductVariant[];
  schedules: Schedule[];
};

export type WizardStepProps = {
  snapshot: WizardSnapshot;
  locked: boolean;
  adminContext?: boolean;
  viewOnly?: boolean;
  revisionForm: RevisionForm;
  fulfilment: FulfilmentForm;
  contentSettings?: ActivityContentSettings;
  onSaveDraft: () => Promise<boolean>;
  onSaveDraftWithId?: () => Promise<boolean | string>;
  onRevisionChange: <K extends keyof RevisionForm>(key: K, value: RevisionForm[K]) => void;
  onFulfilmentChange: (next: FulfilmentForm) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onPricingSaved?: () => void;
  onPricingDirty?: () => void;
  onRegisterPricingSave?: (handler: (() => Promise<boolean>) | null) => void;
};

export const splitList = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
export const joinList = (value?: string[]) => (value || []).join(', ');

export const emptyRevisionForm: RevisionForm = {
  productName: '', currency: 'INR', type: 'ACTIVITY', subType: '', category: '', subCategory: '', subCategories: [], shortDescription: '', metaname: '', description: '', highlights: '', channels: [], adminRankingBoost: 'NONE', terms: '', importantInfo: '', thingsToCarry: '', safetyMeasures: '', additionalInfo: '', howToRedeem: '', cityName: '', stateName: '', countryName: '', address: '', lat: '', lon: '', meetingModel: 'FIXED_MEETING_POINT', meetingPoint: '', labels: '', hasDifferentialVisitorPricing: false, durationValue: '', durationUnit: '', guideIncluded: 'WITH_GUIDE', guideLanguages: 'English, Hindi', included: '', notIncluded: '', endPoint: '', thingsToKnow: '', accessibility: '', followItinerary: true, voucherCodeSource: 'PLATFORM', voucherAcceptedAs: 'MOBILE_VOUCHER', voucherInstructions: 'Show this voucher to the guide at pickup. Keep your phone reachable from 08:00; the driver will call 15 minutes before arrival.', cancellationPreset: 'MODERATE', travellerDetails: 'Lead name, Mobile, Pickup hotel', amendmentPolicy: 'DATE_CHANGE_24H',
};

export const emptyFulfilmentForm: FulfilmentForm = {
  mode: '', requiredEvidenceKinds: [], evidenceMatchMode: 'ALL', reviewRequired: false, operationsContactName: '', operationsContactPhone: '', operationsContactEmail: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactEmail: '', voucherNotes: '',
};

export const emptyVariantForm: VariantForm = {
  variantCode: '', name: '', description: '', durationMinutes: '', minPax: '1', maxPax: '99', cutOffMinutes: '0', privateShared: 'Shared', vehicleType: '', pickupIncluded: false, pickupType: '', pickupInput: '', pickupTimings: '', dropoffIncluded: false, dropoffTimings: '', mealIncluded: false, mealType: '', menu: '', mealVariety: '', pointsOfInterest: '', inclusions: '', exclusions: '', suitableFor: '', sourcePayload: {}, ticketTypes: [{ name: 'Adult', ageFrom: '', ageTo: '', needsAdult: false, countsCapacity: true }], unitType: '', unitMinPax: '', unitMaxPax: '', paxIncluded: '', extraPerPerson: '', unitsPerSlot: '', unitRows: [],
};

export function toRevisionForm(revision?: ProductRevision | null, product?: Product | null): RevisionForm {
  if (!revision) return { ...emptyRevisionForm };
  const prototype = (revision.sourcePayload?.prototype || {}) as Record<string, unknown>;
  const subCategories = Array.isArray(prototype.subCategories)
    ? prototype.subCategories.map((value) => String(value)).filter(Boolean)
    : String(revision.subCategory || '').split(',').map((value) => value.trim()).filter(Boolean);
  return {
    productName: revision.productName || '', currency: product?.currency || 'INR', type: revision.type, subType: revision.subType || '', category: revision.category || '', subCategory: subCategories[0] || revision.subCategory || '', subCategories, shortDescription: revision.shortDescription || '', metaname: revision.metaname || '', description: revision.description || '', highlights: joinList(revision.highlights), channels: revision.channels?.length ? revision.channels : ((revision.sourcePayload?.admin as Record<string, unknown> | undefined)?.channels as string[] | undefined) || [], adminRankingBoost: (['NONE', 'PLUS_ONE', 'PLUS_TWO'].includes(String((revision.sourcePayload?.admin as Record<string, unknown> | undefined)?.rankingBoost || 'NONE')) ? String((revision.sourcePayload?.admin as Record<string, unknown> | undefined)?.rankingBoost || 'NONE') : 'NONE') as RevisionForm['adminRankingBoost'], terms: joinList(revision.terms), importantInfo: joinList(revision.importantInfo), thingsToCarry: joinList(revision.thingsToCarry), safetyMeasures: joinList(revision.safetyMeasures), additionalInfo: joinList(revision.additionalInfo), howToRedeem: joinList(revision.howToRedeem), cityName: revision.cityName || '', stateName: revision.stateName || '', countryName: revision.countryName || '', address: revision.address || '', lat: revision.lat == null ? '' : String(revision.lat), lon: revision.lon == null ? '' : String(revision.lon), meetingModel: revision.meetingModel || 'FIXED_MEETING_POINT', meetingPoint: revision.meetingPoint || '', labels: joinList(revision.labels), hasDifferentialVisitorPricing: Boolean(revision.sourcePayload && revision.sourcePayload.hasDifferentialVisitorPricing), durationValue: revision.durationValue || String(prototype.durationValue || ''), durationUnit: (revision.durationUnit as RevisionForm['durationUnit']) || (prototype.durationUnit as RevisionForm['durationUnit']) || '', guideIncluded: (revision.guideIncluded as RevisionForm['guideIncluded']) || (prototype.guideIncluded as RevisionForm['guideIncluded']) || 'WITH_GUIDE', guideLanguages: joinList(revision.guideLanguages) || String(prototype.guideLanguages || 'English, Hindi'), included: joinList(revision.included) || String(prototype.included || ''), notIncluded: joinList(revision.notIncluded) || String(prototype.notIncluded || ''), endPoint: revision.endPoint || String(prototype.endPoint || ''), thingsToKnow: revision.thingsToKnow || String(prototype.thingsToKnow || ''), accessibility: joinList(revision.accessibility) || String(prototype.accessibility || ''), followItinerary: revision.followItinerary === undefined ? (prototype.followItinerary === undefined ? true : Boolean(prototype.followItinerary)) : revision.followItinerary, voucherCodeSource: (revision.voucherCodeSource as RevisionForm['voucherCodeSource']) || (prototype.voucherCodeSource === 'SUPPLIER' ? 'SUPPLIER_BARCODE_POOL' : (prototype.voucherCodeSource as RevisionForm['voucherCodeSource'])) || 'PLATFORM', voucherAcceptedAs: (revision.voucherAcceptedAs as RevisionForm['voucherAcceptedAs']) || (prototype.voucherAcceptedAs as RevisionForm['voucherAcceptedAs']) || 'MOBILE_VOUCHER', voucherInstructions: revision.voucherInstructions || String(prototype.voucherInstructions || 'Show this voucher to the guide at pickup. Keep your phone reachable from 08:00; the driver will call 15 minutes before arrival.'), cancellationPreset: (revision.cancellationPreset as RevisionForm['cancellationPreset']) || (prototype.cancellationPreset as RevisionForm['cancellationPreset']) || 'MODERATE', travellerDetails: revision.travellerDetails || String(prototype.travellerDetails || 'Lead name, Mobile, Pickup hotel'), amendmentPolicy: (revision.amendmentPolicy as RevisionForm['amendmentPolicy']) || (prototype.amendmentPolicy as RevisionForm['amendmentPolicy']) || 'DATE_CHANGE_24H',
  };
}

export function toFulfilmentForm(policy?: ProductRevision['fulfilmentPolicy'] | null): FulfilmentForm {
  if (!policy) return { ...emptyFulfilmentForm };
  return { mode: policy.mode || '', requiredEvidenceKinds: policy.requiredEvidenceKinds || [], evidenceMatchMode: policy.evidenceMatchMode || 'ALL', reviewRequired: Boolean(policy.reviewRequired), operationsContactName: policy.operationsContactName || '', operationsContactPhone: policy.operationsContactPhone || '', operationsContactEmail: policy.operationsContactEmail || '', emergencyContactName: policy.emergencyContactName || '', emergencyContactPhone: policy.emergencyContactPhone || '', emergencyContactEmail: policy.emergencyContactEmail || '', voucherNotes: joinList(policy.voucherNotes) };
}

export function toVariantForm(variant?: ProductVariant | null): VariantForm {
  if (!variant) return { ...emptyVariantForm };
  const sourcePayload = variant.sourcePayload || {};
  const prototype = (sourcePayload.prototype || {}) as Record<string, unknown>;
  const legacyUnit = { name: String(prototype.unitType || ''), minPax: String(prototype.unitMinPax || ''), maxPax: String(prototype.unitMaxPax || ''), paxIncluded: String(prototype.paxIncluded || ''), extraPerPerson: String(prototype.extraPerPerson || ''), unitsPerSlot: String(prototype.unitsPerSlot || '') };
  const unitRows = Array.isArray(variant.unitRows) && variant.unitRows.length ? variant.unitRows.map((item) => ({ name: String(item.name || ''), minPax: String(item.minPax ?? ''), maxPax: String(item.maxPax ?? ''), paxIncluded: String(item.paxIncluded ?? ''), extraPerPerson: String(item.extraPerPerson ?? ''), unitsPerSlot: String(item.unitsPerSlot ?? '') })) : Array.isArray(prototype.unitRows) && prototype.unitRows.length ? prototype.unitRows as VariantForm['unitRows'] : (legacyUnit.name ? [legacyUnit] : []);
  const ticketTypes = Array.isArray(variant.ticketTypes) && variant.ticketTypes.length ? variant.ticketTypes.map((item) => ({ name: String(item.name || ''), ageFrom: String(item.ageFrom ?? ''), ageTo: String(item.ageTo ?? ''), needsAdult: Boolean(item.needsAdult), countsCapacity: item.countsCapacity !== false })) : Array.isArray(prototype.ticketTypes) && prototype.ticketTypes.length ? prototype.ticketTypes as VariantForm['ticketTypes'] : [...emptyVariantForm.ticketTypes];
  return { variantCode: variant.variantCode, name: variant.name, description: variant.description || '', durationMinutes: variant.durationMinutes == null ? '' : String(variant.durationMinutes), minPax: variant.minPax == null ? '1' : String(variant.minPax), maxPax: variant.maxPax == null ? '99' : String(variant.maxPax), cutOffMinutes: variant.cutOffMinutes == null ? '0' : String(Number(variant.cutOffMinutes) / 60), privateShared: variant.privateShared || 'Shared', vehicleType: variant.vehicleType || '', pickupIncluded: variant.pickupIncluded, pickupType: variant.pickupType || '', pickupInput: variant.pickupInput || '', pickupTimings: variant.pickupTimings || '', dropoffIncluded: variant.dropoffIncluded, dropoffTimings: variant.dropoffTimings || '', mealIncluded: variant.mealIncluded, mealType: variant.mealType || '', menu: joinList(variant.menu), mealVariety: variant.mealVariety || '', pointsOfInterest: joinList(variant.pointsOfInterest), inclusions: joinList(variant.inclusions), exclusions: joinList(variant.exclusions), suitableFor: joinList(variant.suitableFor), sourcePayload, ticketTypes, unitType: unitRows[0]?.name || '', unitMinPax: unitRows[0]?.minPax || '', unitMaxPax: unitRows[0]?.maxPax || '', paxIncluded: unitRows[0]?.paxIncluded || '', extraPerPerson: unitRows[0]?.extraPerPerson || '', unitsPerSlot: unitRows[0]?.unitsPerSlot || '', unitRows };
}
