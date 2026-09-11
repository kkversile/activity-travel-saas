import { BadRequestException } from '@nestjs/common';

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new BadRequestException(`Invalid IANA timezone: ${timezone}`); }
  if (!timezone || timezone.includes('/') === false) throw new BadRequestException('timezone must be an explicit IANA timezone');
  return timezone;
}

export function assertTime(time: string, field = 'time') {
  if (!TIME_RE.test(time)) throw new BadRequestException(`${field} must use HH:mm format`);
}

export function isoDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new BadRequestException('Invalid service date');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dateKey(value: string | Date) { return isoDate(value).toISOString().slice(0, 10); }

export function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

export function dayName(value: Date) {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][value.getUTCDay()];
}

export function zonedTimeToUtc(date: Date, time: string, timezone: string) {
  assertTime(time, 'local time');
  const [hour, minute] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const rendered = Date.UTC(values.year, values.month - 1, values.day, values.hour === 24 ? 0 : values.hour, values.minute);
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute);
  return new Date(guess.getTime() + target - rendered);
}

export function sessionAvailable(state: { totalCapacity: number; blockedCapacity: number; heldCapacity: number; confirmedCapacity: number } | null, status: string) {
  if (!state || ['CLOSED', 'BLACKOUT', 'ARCHIVED'].includes(status)) return 0;
  return Math.max(0, state.totalCapacity - state.blockedCapacity - state.heldCapacity - state.confirmedCapacity);
}
