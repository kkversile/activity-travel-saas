import type { Product, ProductRevision, ProductVariant, Schedule } from '../../api';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
export type WizardMode = 'CREATE' | 'EDIT';
export type RevisionForm = {
  productName: string;
  type: ProductRevision['type'];
  subType: string;
  subCategory: string;
  shortDescription: string;
  metaname: string;
  description: string;
  highlights: string;
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
};

export type FulfilmentForm = {
  mode: 'AUTO' | 'AFTER_FULFILMENT' | 'PNR_ONLY' | 'TICKET_QR' | '';
  requiredEvidenceKinds: string[];
  evidenceMatchMode: 'ALL' | 'ANY';
  operationsContactName: string;
  operationsContactPhone: string;
  operationsContactEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
  voucherNotes: string;
};

export type VariantForm = {
  variantCode: string;
  name: string;
  description: string;
  durationMinutes: string;
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
  revisionForm: RevisionForm;
  fulfilment: FulfilmentForm;
  onRevisionChange: <K extends keyof RevisionForm>(key: K, value: RevisionForm[K]) => void;
  onFulfilmentChange: (next: FulfilmentForm) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
};

export const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
export const joinList = (value?: string[]) => (value || []).join(', ');

export const emptyRevisionForm: RevisionForm = {
  productName: '', type: 'ACTIVITY', subType: '', subCategory: '', shortDescription: '', metaname: '', description: '', highlights: '', terms: '', importantInfo: '', thingsToCarry: '', safetyMeasures: '', additionalInfo: '', howToRedeem: '', cityName: '', stateName: '', countryName: '', address: '', lat: '', lon: '', meetingModel: '', meetingPoint: '', labels: '',
};

export const emptyFulfilmentForm: FulfilmentForm = {
  mode: '', requiredEvidenceKinds: [], evidenceMatchMode: 'ALL', operationsContactName: '', operationsContactPhone: '', operationsContactEmail: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactEmail: '', voucherNotes: '',
};

export const emptyVariantForm: VariantForm = {
  variantCode: '', name: '', description: '', durationMinutes: '', privateShared: 'Shared', vehicleType: '', pickupIncluded: false, pickupType: '', pickupInput: '', pickupTimings: '', dropoffIncluded: false, dropoffTimings: '', mealIncluded: false, mealType: '', menu: '', mealVariety: '', pointsOfInterest: '', inclusions: '', exclusions: '', suitableFor: '',
};

export function toRevisionForm(revision?: ProductRevision | null): RevisionForm {
  if (!revision) return { ...emptyRevisionForm };
  return {
    productName: revision.productName || '', type: revision.type, subType: revision.subType || '', subCategory: revision.subCategory || '', shortDescription: revision.shortDescription || '', metaname: revision.metaname || '', description: revision.description || '', highlights: joinList(revision.highlights), terms: joinList(revision.terms), importantInfo: joinList(revision.importantInfo), thingsToCarry: joinList(revision.thingsToCarry), safetyMeasures: joinList(revision.safetyMeasures), additionalInfo: joinList(revision.additionalInfo), howToRedeem: joinList(revision.howToRedeem), cityName: revision.cityName || '', stateName: revision.stateName || '', countryName: revision.countryName || '', address: revision.address || '', lat: revision.lat == null ? '' : String(revision.lat), lon: revision.lon == null ? '' : String(revision.lon), meetingModel: revision.meetingModel || '', meetingPoint: revision.meetingPoint || '', labels: joinList(revision.labels),
  };
}

export function toFulfilmentForm(policy?: ProductRevision['fulfilmentPolicy'] | null): FulfilmentForm {
  if (!policy) return { ...emptyFulfilmentForm };
  return { mode: policy.mode || '', requiredEvidenceKinds: policy.requiredEvidenceKinds || [], evidenceMatchMode: policy.evidenceMatchMode || 'ALL', operationsContactName: policy.operationsContactName || '', operationsContactPhone: policy.operationsContactPhone || '', operationsContactEmail: policy.operationsContactEmail || '', emergencyContactName: policy.emergencyContactName || '', emergencyContactPhone: policy.emergencyContactPhone || '', emergencyContactEmail: policy.emergencyContactEmail || '', voucherNotes: joinList(policy.voucherNotes) };
}

export function toVariantForm(variant?: ProductVariant | null): VariantForm {
  if (!variant) return { ...emptyVariantForm };
  return { variantCode: variant.variantCode, name: variant.name, description: variant.description || '', durationMinutes: variant.durationMinutes == null ? '' : String(variant.durationMinutes), privateShared: variant.privateShared || 'Shared', vehicleType: variant.vehicleType || '', pickupIncluded: variant.pickupIncluded, pickupType: variant.pickupType || '', pickupInput: variant.pickupInput || '', pickupTimings: variant.pickupTimings || '', dropoffIncluded: variant.dropoffIncluded, dropoffTimings: variant.dropoffTimings || '', mealIncluded: variant.mealIncluded, mealType: variant.mealType || '', menu: joinList(variant.menu), mealVariety: variant.mealVariety || '', pointsOfInterest: joinList(variant.pointsOfInterest), inclusions: joinList(variant.inclusions), exclusions: joinList(variant.exclusions), suitableFor: joinList(variant.suitableFor) };
}
