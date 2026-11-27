/** Pure product-entry rules shared by API, wizard and workbook generation. */
export const PRODUCT_ENTRY_VERSION = '2.0';
export const PRODUCT_IMPORT_REQUIRED_FIELDS: Record<string,string[]> = {
  Basic_Info:['product_key','product_name','type','sub_type','city','state','country','meeting_model','short_description'],
  Experience:['product_key','full_description'],Options:['product_key','option_code','option_name'],
  Ticket_Types:['product_key','option_code','ticket_type'],
  Rate_Plans:['product_key','option_code','rate_plan_code','rate_plan_name','valid_from','valid_to'],
  Availability:['product_key','option_code','schedule_code','effective_from','effective_to','operating_days'],
};
export const PRODUCT_SUBTYPES: Record<string, readonly string[]> = {
  ACTIVITY: ['EXPERIENCE', 'GUIDED_TOUR', 'ATTRACTION', 'TICKET_ONLY'],
  MEALS: ['RESTAURANT', 'DINING_EXPERIENCE', 'COOKING_CLASS'],
  TRANSFER: ['AIRPORT_TRANSFER', 'AIRPORT_TO_HOTEL', 'HOTEL_TO_AIRPORT', 'POINT_TO_POINT', 'SHUTTLE'],
  PACKAGE_ADDON: ['EXCURSION', 'EQUIPMENT_RENTAL', 'SERVICE_ADDON'], OTHERS: ['OTHER'],
};
export type ProductDestination = { country: string; state: string; city: string };
const places: Record<string, Record<string, string[]>> = {
  India: {
    Kerala: ['Kochi', 'Fort Kochi', 'Munnar', 'Alappuzha', 'Wayanad', 'Kumarakom', 'Thekkady', 'Kovalam', 'Thiruvananthapuram', 'Kozhikode', 'Varkala'],
    Goa: ['North Goa', 'South Goa', 'Panaji', 'Calangute', 'Candolim'],
    Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Madikeri', 'Hampi', 'Gokarna'],
    'Tamil Nadu': ['Chennai', 'Madurai', 'Ooty', 'Kodaikanal', 'Mahabalipuram', 'Rameswaram'],
    Maharashtra: ['Mumbai', 'Pune', 'Lonavala', 'Nashik', 'Aurangabad'],
    Rajasthan: ['Jaipur', 'Udaipur', 'Jodhpur', 'Jaisalmer', 'Pushkar'],
    Delhi: ['New Delhi'], Telangana: ['Hyderabad'], 'Uttar Pradesh': ['Agra', 'Varanasi', 'Lucknow', 'Ayodhya'],
    Uttarakhand: ['Rishikesh', 'Haridwar', 'Dehradun', 'Mussoorie', 'Nainital'],
    'Himachal Pradesh': ['Shimla', 'Manali', 'Dharamshala'], 'West Bengal': ['Kolkata', 'Darjeeling', 'Siliguri'],
    Gujarat: ['Ahmedabad', 'Vadodara', 'Dwarka', 'Kutch'], Punjab: ['Amritsar', 'Ludhiana'],
    'Jammu and Kashmir': ['Srinagar', 'Gulmarg', 'Pahalgam'], Ladakh: ['Leh'], Sikkim: ['Gangtok'],
    Assam: ['Guwahati', 'Kaziranga'], Meghalaya: ['Shillong', 'Cherrapunji'],
    'Andaman and Nicobar Islands': ['Port Blair', 'Swaraj Dweep', 'Shaheed Dweep'], Puducherry: ['Puducherry'],
    'Andhra Pradesh': ['Visakhapatnam', 'Tirupati', 'Vijayawada'], MadhyaPradesh: ['Bhopal', 'Indore'],
  },
  'United Arab Emirates': { Dubai: ['Dubai'], 'Abu Dhabi': ['Abu Dhabi'], Sharjah: ['Sharjah'], 'Ras Al Khaimah': ['Ras Al Khaimah'] },
  Singapore: { Singapore: ['Singapore'] }, Thailand: { Bangkok: ['Bangkok'], Phuket: ['Phuket'], Krabi: ['Krabi'], 'Chiang Mai': ['Chiang Mai'], Chonburi: ['Pattaya'] },
  Indonesia: { Bali: ['Ubud', 'Denpasar', 'Kuta'], Jakarta: ['Jakarta'] },
  'United Kingdom': { England: ['London', 'Manchester', 'Bath'], Scotland: ['Edinburgh', 'Glasgow'] },
  'United States': { 'New York': ['New York City'], California: ['Los Angeles', 'San Francisco', 'San Diego'], Nevada: ['Las Vegas'], Florida: ['Orlando', 'Miami'] },
  France: { 'Île-de-France': ['Paris'] }, Italy: { Lazio: ['Rome'], Tuscany: ['Florence'], Veneto: ['Venice'] },
  Australia: { 'New South Wales': ['Sydney'], Victoria: ['Melbourne'], Queensland: ['Brisbane', 'Cairns', 'Gold Coast'] },
};
export const DEFAULT_PRODUCT_DESTINATIONS: ProductDestination[] = Object.entries(places).flatMap(([country, states]) => Object.entries(states).flatMap(([state, cities]) => cities.map(city => ({ country, state: state === 'MadhyaPradesh' ? 'Madhya Pradesh' : state, city }))));
export const locationToken = (value: unknown) => String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ');
const aliases: Record<string, string> = { india: 'India', in: 'India', uae: 'United Arab Emirates', uk: 'United Kingdom', usa: 'United States', 'united states of america': 'United States', cochin: 'Kochi', alleppey: 'Alappuzha', bangalore: 'Bengaluru', mysore: 'Mysuru', bombay: 'Mumbai', calcutta: 'Kolkata', 'new york': 'New York City' };
const aliasToken = (value: unknown, field: 'country'|'state'|'city') => field === 'state' ? locationToken(value) : locationToken(aliases[locationToken(value)] || value);
export function resolveProductDestination(input: ProductDestination, destinations = DEFAULT_PRODUCT_DESTINATIONS): ProductDestination | null {
  return destinations.find(row => (['country', 'state', 'city'] as const).every(field => aliasToken(row[field],field) === aliasToken(input[field],field))) || null;
}
export function destinationIssue(input: ProductDestination, destinations = DEFAULT_PRODUCT_DESTINATIONS) {
  if (!input.country?.trim() || !input.state?.trim() || !input.city?.trim()) return null; // Incomplete drafts are valid.
  if (resolveProductDestination(input, destinations)) return null;
  const country = destinations.filter(row => aliasToken(row.country,'country') === aliasToken(input.country,'country'));
  const state = country.filter(row => aliasToken(row.state,'state') === aliasToken(input.state,'state'));
  const field = !country.length ? 'country' : !state.length ? 'state' : 'city';
  return { field, value: input[field], message: `The destination ${field} does not match the supported country, state and city combination.`, correction: 'Choose Country, then State / region, then City from the supported destinations. Ask an administrator to add a missing destination in Configuration.' };
}
export function durationReadiness(value: unknown, unit: unknown): string | null {
  const normalized = String(unit ?? '').trim().toUpperCase();
  if (!normalized) return 'DURATION_MISSING';
  if (!['HOURS', 'DAYS', 'FLEXIBLE'].includes(normalized)) return 'DURATION_INVALID';
  if (normalized === 'FLEXIBLE') return null;
  const raw = String(value ?? '').trim();
  return /^\d+(\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)) && Number(raw) > 0 ? null : 'DURATION_VALUE_REQUIRED';
}
export const REQUIRED_FOR_REVIEW: Record<string, string[]> = {
  Products: ['product_name', 'type', 'sub_type', 'category', 'city', 'state', 'country', 'meeting_model', 'short_description', 'full_description', 'duration_unit', 'included', 'not_included', 'end_point', 'highlights', 'cancellation_preset', 'voucher_code_source', 'voucher_accepted_as', 'voucher_instructions'],
};
export const FIELD_GUIDANCE: Record<string, string> = {
  product_code: 'Import reference for CREATE only, e.g. WALK_001. Repeat it on linked sheets. Voya generates the permanent product ID after creation. In UPDATE RATES use the existing generated Voya code.',
  duration_value: 'Required for review with HOURS or DAYS: enter a positive number. Leave blank with FLEXIBLE.',
  duration_unit: 'Required for review: HOURS, DAYS or FLEXIBLE. Incomplete products can be saved as drafts.',
  country: 'Choose the country first. Supported destinations are listed on Destinations.',
  state: 'Choose a state / region belonging to the selected country.', city: 'Choose a city belonging to the selected country and state / region. Ask admin to add missing destinations.',
  category: 'Choose a category code from Categories. Sub-category tags must belong to that category.',
  valid_to: 'Exclusive end date: pricing applies before this date.',
  adult_sell_inr: 'INR-only bulk rate updates. The historical header is retained for compatibility. For USD or other currencies use the advanced pricing editor. Blank retains the price; 0 is free.',
};
