export const ACTIVITY_CONTENT_SETTINGS_KEY = 'ACTIVITY_CONTENT_DEFAULTS';

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

export const defaultActivityContentSettings: ActivityContentSettings = {
  terms: [
    'Bookings are subject to supplier availability and confirmation.',
    'Changes and cancellations are subject to the selected rate plan.',
  ],
  howToRedeem: [
    'Show your booking confirmation to the supplier at the stated meeting point.',
    'Arrive at least 15 minutes before the scheduled start time.',
  ],
  bookingQuestions: [
    { code: 'lead_name', label: 'Lead traveller name', type: 'TEXT', required: true },
    { code: 'lead_phone', label: 'Lead traveller phone', type: 'TEXT', required: true },
  ],
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

export function normalizeActivityContentSettings(value: unknown): ActivityContentSettings {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawQuestions = Array.isArray(candidate.bookingQuestions) ? candidate.bookingQuestions : [];
  const bookingQuestions = rawQuestions.map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const type = text(row.type).toUpperCase();
    return {
      code: text(row.code),
      label: text(row.label),
      type: (['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'].includes(type) ? type : 'TEXT') as ActivityBookingQuestionDefault['type'],
      required: row.required === true,
    };
  }).filter((item) => item.code && item.label);
  return {
    terms: list(candidate.terms),
    howToRedeem: list(candidate.howToRedeem),
    bookingQuestions,
  };
}
