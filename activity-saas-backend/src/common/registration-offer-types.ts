export type RegistrationOfferType = {
  id: string;
  label: string;
  status: boolean;
  sortOrder: number;
};

export const REGISTRATION_OFFER_TYPES_SETTING_KEY = 'vendor.registration-offer-types';

export const DEFAULT_REGISTRATION_OFFER_TYPES: RegistrationOfferType[] = [
  { id: 'day-tours-sightseeing', label: 'Day tours & sightseeing', status: true, sortOrder: 10 },
  { id: 'theme-water-park', label: 'Theme / water park', status: true, sortOrder: 20 },
  { id: 'monument-museum', label: 'Monument / museum', status: true, sortOrder: 30 },
  { id: 'adventure-water-sports', label: 'Adventure & water sports', status: true, sortOrder: 40 },
  { id: 'cruises-boats', label: 'Cruises & boats', status: true, sortOrder: 50 },
  { id: 'camping-treks', label: 'Camping & treks', status: true, sortOrder: 60 },
  { id: 'workshops-experiences', label: 'Workshops & experiences', status: true, sortOrder: 70 },
];

export function normalizeRegistrationOfferTypes(value: unknown): RegistrationOfferType[] {
  if (!Array.isArray(value)) return DEFAULT_REGISTRATION_OFFER_TYPES.map((item) => ({ ...item }));
  const seen = new Set<string>();
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const row = candidate as Partial<RegistrationOfferType>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!id || !label || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label, status: row.status === true, sortOrder: Number.isFinite(row.sortOrder) ? Number(row.sortOrder) : (index + 1) * 10 }];
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}
