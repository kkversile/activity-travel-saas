export type User = {
  id?: string;
  sub?: string;
  email: string;
  fullName?: string;
  role: string;
  tenantId: string | null;
  organizationRole?: 'OWNER' | 'CATALOGUE' | 'OPERATIONS' | 'FINANCE' | 'VIEWER' | null;
  active?: boolean;
};

export type VendorProfile = {
  id: string;
  legalBusinessName: string;
  operatingCity: string;
  operatingRegion: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'SUSPENDED';
  readinessScore: number;
  tenant?: { name: string; slug: string };
  gstin?: string; category?: string; payoutAccountMasked?: string;
  vendorDocuments?: Array<{ id: string; type: string; currentStatus: string; versions: Array<{ id: string; versionNumber: number; status: string; rejectionReason?: string | null; fileAsset: { id: string; originalName: string; mimeType: string; sizeBytes: number; visibility: string } }> }>;
};

export type ProductRevision = {
  id: string;
  versionNumber: number;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'SUPERSEDED';
  rejectionReason?: string | null;
  productName: string;
  type: 'ACTIVITY' | 'MEALS' | 'TRANSFER' | 'PACKAGE_ADDON' | 'OTHERS';
  subType: string;
  description: string;
  shortDescription?: string;
  highlights: string[];
  terms?: string[]; thingsToCarry?: string[]; importantInfo?: string[];
  faqs?: Array<{ question: string; answer: string }>;
  safetyMeasures?: string[]; additionalInfo?: string[]; metaname?: string; cityCode?: string;
  isHotelLinked?: boolean; attachedHotelIds?: string[]; howToRedeem?: string[]; persuasions?: string[];
  channels: string[];
  labels: string[];
  subCategory?: string;
  rank?: number;
  starRating?: string | number;
  cityName: string;
  stateName: string;
  countryName: string;
  address?: string;
  lat?: string | number;
  lon?: string | number;
  media?: Array<{ id: string; kind: 'IMAGE' | 'VIDEO'; externalUrl?: string | null; fileAssetId?: string | null; description?: string; seoTitle?: string; seoDescription?: string; rank: number }>;
};

export type ProductVariant = { id: string; productId: string; variantCode: string; name: string; description?: string; status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'; version: number; durationMinutes?: number; privateShared?: string; vehicleType?: string; pickupIncluded: boolean; pickupType?: string; pickupInput?: string; pickupTimings?: string; dropoffIncluded: boolean; dropoffTimings?: string; mealIncluded: boolean; mealType?: string; menu?: string[]; mealVariety?: string; pointsOfInterest?: string[]; inclusions: string[]; exclusions: string[]; suitableFor: string[]; ratePlans?: RatePlan[] };
export type Product = { id: string; tenantId: string; productCode: string; status: 'DRAFT' | 'LIVE' | 'SUSPENDED' | 'ARCHIVED'; currentRevisionId?: string | null; currentRevision?: ProductRevision | null; revisions?: ProductRevision[]; variants?: ProductVariant[]; _count?: { variants: number; bookings: number } };

export type TravellerRule = {
  id?: string;
  type: 'ADULT' | 'CHILD' | 'SENIOR' | 'YOUTH' | 'INFANT' | 'GROUP';
  displayName?: string;
  description?: string;
  minAge?: number;
  maxAge?: number;
  minCount: number;
  maxCount: number;
  price?: number | string;
};

export type CancellationRule = {
  id?: string;
  minDaysBefore: number;
  maxDaysBefore?: number | null;
  chargeValue: number | string;
  chargeType: 'PERCENTAGE' | 'ABSOLUTE';
};

export type RatePlan = {
  id: string;
  ratePlanCode: string;
  name: string;
  status: string;
  description?: string;
  validFrom: string;
  validTo: string;
  currency: string;
  minPax: number;
  maxPax: number;
  ticketOnly?: boolean;
  offlineVoucher?: boolean;
  instantConfirmation: boolean;
  autoRedeem: boolean;
  cutOffMinutes: number;
  adultRequired: boolean;
  minAdultRequired: number;
  travellerRules: TravellerRule[];
  cancellationRules: CancellationRule[];
  commercialReadiness?: { ready: boolean; reasonCodes: string[]; activeVersion?: CommercialVersion | null; draftVersion?: CommercialVersion | null };
};

export type CommercialVersion = { id: string; versionNumber: number; status: 'DRAFT' | 'ACTIVE' | 'RETIRED'; effectiveFrom: string; effectiveTo?: string | null; supplierModel?: string | null; currency: string; pricingUnit?: string | null; supplierBaseAmount?: string | number | null; supplierCommissionPercent?: string | number | null; bookingMode?: string | null; travellerPrices: Array<{ id?: string; travellerType: TravellerRule['type']; amount: string | number }> };

export type Booking = {
  id: string;
  bookingCode: string;
  channel: string;
  serviceDate: string;
  pax: number;
  amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  customerName: string;
  product: { productCode: string; currentRevision?: { productName: string } | null };
  ratePlan?: { name: string };
};

export type InventoryRow = {
  id: string; productId: string; productCode: string; productName?: string | null; variantId: string; scheduleId: string; scheduleName: string;
  sessionDate: string; sessionKey: string; slotCode?: string | null; localStartTime?: string | null; localEndTime?: string | null;
  sessionStatus: 'OPEN' | 'CLOSED' | 'BLACKOUT' | 'ARCHIVED'; totalCapacity: number; blockedCapacity: number; heldCapacity: number; confirmedCapacity: number; availableCapacity: number; version: number;
  sharedRatePlans: Array<{ id: string; code: string; name: string }>; resourceReady: boolean; resourceReasonCodes: string[]; inventoryVersion?: number; sessionVersion?: number; capacityUnitReviewRequired?: boolean; inventoryReady?: boolean; operationalReasonCodes?: string[];
};
export type InventoryResource = { id: string; resourceCode: string; name: string; type: string; allocationMode: string; capacity?: number | null; active: boolean; version?: number; archivedAt?: string | null };
export type Schedule = { id: string; variantId: string; scheduleCode: string; name: string; status: 'DRAFT'|'ACTIVE'|'INACTIVE'|'ARCHIVED'; operatingModel?: string|null; timezone: string; effectiveFrom: string; effectiveTo?: string|null; operatingDays: string[]; capacityUnit: string; capacityUnitReviewRequired?: boolean; defaultCapacity?: number|null; version: number; slotTemplates: Array<{ id:string; slotCode:string; label?:string|null; startTime:string; endTime?:string|null; active:boolean; archivedAt?:string|null }>; ratePlanMappings: Array<{ id:string; active:boolean; ratePlan:{id:string;ratePlanCode:string;name:string} }>; exceptions?: Array<{id:string;serviceDate:string;slotTemplateId?:string|null;type:string;reason:string}>; resourceRequirements?: Array<{id:string;resourceType:string;quantity:number;required:boolean;version:number;active:boolean;archivedAt?:string|null}>; variant?: ProductVariant };

export const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/voya/api' : '/api');

class ApiClient {
  token = localStorage.getItem('voya_token');

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('voya_token', token);
    else localStorage.removeItem('voya_token');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const bodyIsFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(bodyIsFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message || message;
      } catch { /* ignore */ }
      throw new Error(message);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  async blob(path: string) {
    const res = await fetch(`${API_BASE}${path}`, { headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.blob();
  }

  login(email: string, password: string) {
    return this.request<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
  }

  register(fullName: string, email: string, password: string) {
    return this.request<{ accessToken: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, password }) });
  }
}

export const api = new ApiClient();
