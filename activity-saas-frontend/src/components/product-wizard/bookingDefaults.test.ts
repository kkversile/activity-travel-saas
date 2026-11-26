import { describe, expect, it } from 'vitest';
import { optionBookingDefaults } from './bookingDefaults';
import { toVariantForm } from './types';

describe('legacy inherited option limits', () => {
  const legacy: any = { ratePlans: [{ status: 'ACTIVE', minPax: 1, maxPax: 15, cutOffMinutes: 1440 }] };
  it('displays imported inherited limits and edits them in hours without persisting a backfill', () => {
    expect(optionBookingDefaults(legacy)).toEqual({ minPax: 1, maxPax: 15, cutOffMinutes: 1440 });
    expect(toVariantForm(legacy)).toMatchObject({ minPax: '1', maxPax: '15', cutOffMinutes: '24' });
    expect(legacy).not.toHaveProperty('maxPax');
  });
  it('keeps explicit option settings, including a zero cutoff', () => {
    expect(optionBookingDefaults({ ...legacy, minPax: 2, maxPax: 20, cutOffMinutes: 0 })).toEqual({ minPax: 2, maxPax: 20, cutOffMinutes: 0 });
  });
  it('does not invent common limits for conflicting rate plans', () => {
    const option = { ...legacy, ratePlans: [...legacy.ratePlans, { status: 'ACTIVE', minPax: 1, maxPax: 30, cutOffMinutes: 0 }] };
    expect(optionBookingDefaults(option)).toEqual({ minPax: 1, maxPax: null, cutOffMinutes: null });
    expect(toVariantForm(option)).toMatchObject({ minPax: '1', maxPax: '', cutOffMinutes: '' });
  });
  it('acknowledges different booking limits across commercial periods', () => {
    const option = { ...legacy, ratePlans: [{ ...legacy.ratePlans[0], commercialVersions: [{ status: 'DRAFT', maxPax: 10 }, { status: 'ACTIVE', maxPax: 15 }] }] };
    expect(optionBookingDefaults(option).maxPax).toBeNull();
  });
  it('retains ordinary defaults for a new option with no plans', () => {
    expect(optionBookingDefaults({ ratePlans: [] } as any)).toEqual({ minPax: 1, maxPax: 99, cutOffMinutes: 0 });
  });
});
