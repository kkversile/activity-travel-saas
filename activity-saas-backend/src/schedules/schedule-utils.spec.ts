import { BadRequestException } from '@nestjs/common';
import { dateKey, operatingDayMatches, validateTimezone, zonedTimeToUtc } from './schedule-utils';

describe('schedule timezone utilities', () => {
  it('accepts explicit IANA zones and rejects ambiguous values', () => { expect(validateTimezone('Asia/Kolkata')).toBe('Asia/Kolkata'); expect(() => validateTimezone('UTC')).toThrow(BadRequestException); });
  it('preserves India local session time as an instant', () => { const instant = zonedTimeToUtc(new Date('2026-09-11T00:00:00.000Z'), '06:00', 'Asia/Kolkata'); expect(instant.toISOString()).toBe('2026-09-11T00:30:00.000Z'); });
  it('normalizes service dates', () => expect(dateKey('2026-09-11T18:00:00.000Z')).toBe('2026-09-11'));
  it('accepts both full and abbreviated operating-day values', () => {
    const monday = new Date('2026-09-14T00:00:00.000Z');
    expect(operatingDayMatches(['MONDAY'], monday)).toBe(true);
    expect(operatingDayMatches(['MON'], monday)).toBe(true);
    expect(operatingDayMatches(['TUE'], monday)).toBe(false);
  });
});
