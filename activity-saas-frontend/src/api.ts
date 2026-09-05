export type User = {
  id?: string;
  sub?: string;
  email: string;
  fullName?: string;
  role: string;
  tenantId: string | null;
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
  documentStatus?: Record<string, { status: string; fileName?: string; uploadedAt?: string }>;
};

export type Activity = {
  id: string;
  productName: string;
  type: 'ACTIVITY' | 'MEALS' | 'TRANSFER' | 'PACKAGE_ADDON' | 'OTHERS';
  subType: string;
  description: string;
  shortDescription?: string;
  highlights: string[];
  terms?: string[]; thingsToCarry?: string[]; importantInfo?: string[];
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
  status: 'DRAFT' | 'UNDER_REVIEW' | 'LIVE' | 'INACTIVE';
  ratePlans?: RatePlan[];
  media?: Array<{ id: string; kind: 'IMAGE' | 'VIDEO'; url: string; description?: string; rank: number }>;
};

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
  unitType: string;
  basePrice: string | number;
  minPax: number;
  maxPax: number;
  validDays: string[];
  blackoutDates?: string[];
  inclusions: string[];
  exclusions: string[];
  durationMinutes?: number;
  timeOfDay?: string;
  pickupIncluded: boolean;
  pickupTimings?: string;
  dropoffIncluded: boolean;
  dropoffTimings?: string;
  vehicleType?: string;
  privateShared?: string;
  ticketOnly: boolean;
  offlineVoucher: boolean;
  instantConfirmation: boolean;
  autoRedeem: boolean;
  pickupType?: string;
  pickupInput?: string;
  cutOffMinutes: number;
  adultRequired: boolean;
  minAdultRequired: number;
  travellerRules: TravellerRule[];
  cancellationRules: CancellationRule[];
};

export type Booking = {
  id: string;
  bookingCode: string;
  channel: string;
  serviceDate: string;
  pax: number;
  amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  customerName: string;
  activity: { productName: string };
  ratePlan?: { name: string };
};

export type AvailabilitySlot = {
  id: string;
  ratePlanId: string;
  slotDate: string;
  startTime: string;
  capacity: number;
  available: number;
  priceOverride?: string | number | null;
  closed: boolean;
  version: number;
  ratePlan: {
    name: string;
    ratePlanCode: string;
    basePrice: string | number;
    activity: { id: string; productName: string };
  };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiClient {
  token = localStorage.getItem('voya_token');

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('voya_token', token);
    else localStorage.removeItem('voya_token');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
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
