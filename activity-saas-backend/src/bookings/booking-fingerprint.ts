import { createHash } from 'crypto';

export function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

export function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function bookingRequestFingerprint(input: Record<string, unknown>) {
  const normalized = { ...input };
  if (typeof normalized.customerName === 'string') normalized.customerName = normalized.customerName.trim();
  if (typeof normalized.customerEmail === 'string') normalized.customerEmail = normalized.customerEmail.trim().toLowerCase();
  return fingerprint(normalized);
}
