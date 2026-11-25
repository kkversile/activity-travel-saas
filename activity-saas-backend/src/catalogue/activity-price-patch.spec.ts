import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityPriceOptionDto } from './catalogue.dto';
import { activityPricePatchSegments } from './activity-price-patch';
import { buildActivityEditorSourcePayload } from './catalogue.service';

const amounts = (late = false) => ({ ADULT: late ? '1900' : '1800', CHILD: late ? '950' : '900', SENIOR: '1400', INFANT: late ? '100' : '0', YOUTH: late ? '1300.1234' : '1200.1234', GROUP: late ? '2100' : '2000' });
function version(late = false) {
  const prices = amounts(late);
  return { id: late ? 'jan' : 'dec', status: 'DRAFT', versionNumber: late ? 3 : 2,
    effectiveFrom: new Date(late ? '2027-01-01' : '2026-12-01'), effectiveTo: new Date(late ? '2027-03-01' : '2027-01-01'),
    pricingUnit: 'PER_PERSON', currency: 'INR', supplierModel: 'NET_RATE', supplierBaseAmount: '500', bookingMode: 'INSTANT',
    travellerPrices: Object.entries(prices).map(([travellerType, amount]) => ({ travellerType, amount })),
    sourcePayload: { mrpMode: 'YES', mrpAmount: '3000', pricingDays: late ? ['SAT', 'SUN'] : ['MON', 'TUE'], pricingTimezone: late ? 'Asia/Dubai' : 'Asia/Kolkata', pricingSlotCodes: late ? ['06:00'] : ['10:00'],
      ratePeriods: [{ name: late ? 'January' : 'December', adjustmentValue: '100' }],
      visitorPrices: Object.entries(prices).map(([travellerType, indian]) => ({ travellerType, indian, foreign: '2600' })), visitorEligibilityBasis: 'NATIONALITY', visitorVerificationMode: 'DOCUMENT_AT_BOOKING' },
  };
}
const patch = (changes: Record<string, unknown> = {}) => ({ updateMode: 'PATCH', variantId: 'v1', expectedVersion: 3, effectiveFrom: '2026-12-10', effectiveTo: '2027-02-01', ...changes } as ActivityPriceOptionDto);
const resolve = (changes: Record<string, unknown> = {}) => activityPricePatchSegments([version(), version(true)], { currency: 'INR' }, patch(changes));

describe('activity editor field patches', () => {
  it.each(['GROUP', 'PER_BOOKING', 'PER_UNIT'])('rejects incomplete %s to traveller transitions without changing original versions', unit => {
    const group = { ...version(), pricingUnit: unit, travellerPrices: [] };
    const before = structuredClone(group);
    const plan = { travellerRules: Object.keys(amounts()).map(type => ({ type, maxCount: 99 })) };
    expect(() => activityPricePatchSegments([group], plan, patch({ pricingUnit: 'PER_PERSON', effectiveTo: '2026-12-20',
      travellerPrices: [{ travellerType: 'ADULT', amount: '1900' }, { travellerType: 'CHILD', amount: '950' }, { travellerType: 'SENIOR', amount: '1400' }],
    }))).toThrow(/every enabled ticket type \(INFANT, YOUTH, GROUP\).*enter 0/);
    expect(group).toEqual(before);
  });
  it('accepts a complete basis transition with zero prices and preserves foreign terms', () => {
    const group = { ...version(), pricingUnit: 'GROUP', travellerPrices: [] };
    const plan = { travellerRules: [...Object.keys(amounts()).map(type => ({ type, maxCount: 99 })), { type: 'OTHER_DISABLED', maxCount: 0 }] };
    const [{ option }] = activityPricePatchSegments([group], plan, patch({ pricingUnit: 'PER_PERSON', effectiveTo: '2026-12-20',
      travellerPrices: Object.entries(amounts()).map(([travellerType, amount]) => ({ travellerType, amount })),
    }));
    expect(Object.fromEntries(option.travellerPrices!.map(p => [p.travellerType, p.amount]))).toEqual(amounts());
    expect(option.visitorPrices).toContainEqual({ travellerType: 'INFANT', indian: '0', foreign: '2600' });
  });
  it('also blocks already incomplete per-person versions with enabled missing categories', () => {
    const broken = { ...version(), travellerPrices: [{ travellerType: 'ADULT', amount: '1800' }] };
    expect(() => activityPricePatchSegments([broken], { travellerRules: [{ type: 'INFANT', maxCount: 99 }] }, patch({ effectiveTo: '2026-12-20' })))
      .toThrow(/every enabled ticket type \(INFANT\)/);
  });
  it('does not enforce traveller prices while group pricing is active', () => {
    const [{ option }] = activityPricePatchSegments([version()], { travellerRules: [{ type: 'INFANT', maxCount: 99 }] }, patch({ pricingUnit: 'GROUP', supplierBaseAmount: '2000', effectiveTo: '2026-12-20' }));
    expect(option.travellerPrices).toEqual([]);
    expect(option.pricingUnit).toBe('GROUP');
  });
  it('retains date-specific hidden prices and visitor policies during an adult-only edit', () => {
    const segments = resolve({ travellerPrices: [{ travellerType: 'ADULT', amount: '1950' }] });
    expect(segments).toHaveLength(2);
    for (const [index, segment] of segments.entries()) {
      expect(Object.fromEntries(segment.option.travellerPrices!.map(price => [price.travellerType, price.amount]))).toEqual({ ...amounts(Boolean(index)), ADULT: '1950' });
      expect(segment.option.visitorPrices).toContainEqual({ travellerType: 'INFANT', indian: index ? '100' : '0', foreign: '2600' });
      expect(segment.option.visitorPrices).toContainEqual({ travellerType: 'ADULT', indian: '1950', foreign: '2600' });
      expect(segment.option.visitorEligibilityBasis).toBe('NATIONALITY');
      expect(segment.option.visitorVerificationMode).toBe('DOCUMENT_AT_BOOKING');
    }
  });
  it('inherits days, timezone, slots and seasonal adjustments independently in each period', () => {
    const segments = resolve();
    for (const [index, segment] of segments.entries()) {
      const source = version(Boolean(index)).sourcePayload;
      const payload = buildActivityEditorSourcePayload(segment.version.sourcePayload, true, segment.option);
      expect(payload).toMatchObject({ pricingDays: source.pricingDays, pricingTimezone: source.pricingTimezone, pricingSlotCodes: source.pricingSlotCodes, ratePeriods: source.ratePeriods });
    }
  });
  it('honors explicit common rules, including clearing slots and seasonal adjustments', () => {
    for (const { option, version } of resolve({ timezone: 'UTC', pricingDays: ['FRI'], pricingSlotCodes: [], ratePeriods: [] }))
      expect(buildActivityEditorSourcePayload(version.sourcePayload, true, option)).toMatchObject({ pricingTimezone: 'UTC', pricingDays: ['FRI'], pricingSlotCodes: [], ratePeriods: [] });
  });
  it('uses the earlier period when only an earlier range is edited', () => {
    const segments = resolve({ effectiveTo: '2026-12-20', travellerPrices: [{ travellerType: 'ADULT', amount: '0' }] });
    expect(segments).toHaveLength(1);
    expect(segments[0].option.travellerPrices).toContainEqual({ travellerType: 'INFANT', amount: '0' });
    expect(segments[0].option.travellerPrices).toContainEqual({ travellerType: 'ADULT', amount: '0' });
    expect(segments[0].effectiveTo.toISOString().slice(0, 10)).toBe('2026-12-20');
  });
  it('changes only the foreign value while retaining the Indian value of each date segment', () => {
    const segments = resolve({ visitorPrices: [{ travellerType: 'ADULT', indian: '1900', foreign: '2800' }] });
    expect(segments[0].option.visitorPrices).toContainEqual({ travellerType: 'ADULT', indian: '1800', foreign: '2800' });
    expect(segments[1].option.visitorPrices).toContainEqual({ travellerType: 'ADULT', indian: '1900', foreign: '2800' });
  });
  it('preserves untouched legacy visitor amounts even when they differ from ordinary category prices', () => {
    const saved = version();
    saved.sourcePayload.visitorPrices.find(price => price.travellerType === 'CHILD')!.indian = '880';
    const [{ option }] = activityPricePatchSegments([saved], {}, patch({ effectiveTo: '2026-12-20', travellerPrices: [{ travellerType: 'ADULT', amount: '1950' }] }));
    expect(option.visitorPrices).toContainEqual({ travellerType: 'CHILD', indian: '880', foreign: '2600' });
    expect(option.visitorPrices).toContainEqual({ travellerType: 'ADULT', indian: '1950', foreign: '2600' });
  });
  it.each(['CHILD', 'SENIOR', 'ADULT'])('rejects removing an existing %s price with actionable guidance', type => {
    expect(() => resolve({ removeTravellerTypes: [type] })).toThrow(/Keep a price.*enter 0 for free admission/);
  });
  it('rejects removing an enabled category even if a legacy version is already missing its price', () => {
    const saved = version(); saved.travellerPrices = saved.travellerPrices.filter(price => price.travellerType !== 'CHILD');
    expect(() => activityPricePatchSegments([saved], { travellerRules: [{ type: 'CHILD', maxCount: 99 }] }, patch({ removeTravellerTypes: ['CHILD'] })))
      .toThrow('CHILD already has a saved price or is enabled');
  });
  it('allows absent unconfigured categories and zero prices without deleting enabled ticket types', () => {
    const saved = version(); saved.travellerPrices = saved.travellerPrices.filter(price => price.travellerType !== 'CHILD');
    const [{ option }] = activityPricePatchSegments([saved], {}, patch({ removeTravellerTypes: ['CHILD'], travellerPrices: [{ travellerType: 'SENIOR', amount: '0' }] }));
    expect(option.travellerPrices).toContainEqual({ travellerType: 'SENIOR', amount: '0' });
    expect(option.travellerPrices).toContainEqual({ travellerType: 'YOUTH', amount: '1200.1234' });
  });
  it('preserves each period cancellation policy when only confirmation mode or SLA is edited', () => {
    const versions = [version(), version(true)].map((v, index) => ({ ...v, confirmationSlaMinutes: index ? 120 : 60,
      sourcePayload: { ...v.sourcePayload, bookingRules: { cancellationRules: [{ minDaysBefore: index ? 0 : 7, chargeValue: index ? '100' : '0', chargeType: 'PERCENTAGE' }] } } }));
    for (const changes of [{ bookingMode: 'MANUAL_ON_REQUEST' }, { confirmationSlaMinutes: 90 }]) {
      const segments = activityPricePatchSegments(versions, {}, patch(changes));
      segments.forEach(({ option }, index) => {
        expect(option.cancellationRules).toEqual(versions[index].sourcePayload.bookingRules.cancellationRules);
        expect(option.bookingMode).toBe(changes.bookingMode || 'INSTANT');
        expect(option.confirmationSlaMinutes).toBe(changes.confirmationSlaMinutes || (index ? 120 : 60));
      });
    }
  });
  it('applies an explicit cancellation change without copying confirmation mode or SLA across periods', () => {
    const versions = [version(), version(true)].map((v, index) => ({ ...v, bookingMode: index ? 'VENDOR_CONFIRMATION' : 'MANUAL_ON_REQUEST', confirmationSlaMinutes: index ? 120 : 60 }));
    const rules = [{ minDaysBefore: 3, chargeValue: '25', chargeType: 'PERCENTAGE' }];
    const segments = activityPricePatchSegments(versions, {}, patch({ cancellationRules: rules }));
    segments.forEach(({ option }, index) => {
      expect(option.cancellationRules).toEqual(rules);
      expect(option.bookingMode).toBe(versions[index].bookingMode);
      expect(option.confirmationSlaMinutes).toBe(versions[index].confirmationSlaMinutes);
    });
  });
  it('retains a newer draft only inside its interval and never mutates original versions', () => {
    const active = { ...version(), status: 'ACTIVE', versionNumber: 1, effectiveTo: new Date('2027-03-01') };
    const draft = { ...version(true), effectiveFrom: new Date('2027-01-10'), effectiveTo: new Date('2027-01-20') };
    const originals = structuredClone([active, draft]);
    const segments = activityPricePatchSegments([active, draft], {}, patch({ effectiveTo: '2027-02-01' }));
    expect(segments.map(segment => segment.version.id)).toEqual(['dec', 'jan', 'dec']);
    expect([active, draft]).toEqual(originals);
  });
  it('rejects a patch whose base history disappeared', () => {
    expect(() => activityPricePatchSegments([], {}, patch())).toThrow('Saved pricing is no longer available');
  });
  it('retains the original currency of each period when it was not edited', () => {
    const segments = activityPricePatchSegments([{ ...version(), currency: 'USD' }, version(true)], {}, patch());
    expect(segments.map(segment => segment.option.currency)).toEqual(['USD', 'INR']);
  });
  it('requires the basis for full saves and allows its omission only for a PATCH', async () => {
    const value = { variantId: 'v1' };
    expect((await validate(plainToInstance(ActivityPriceOptionDto, value))).some(error => error.property === 'pricingUnit')).toBe(true);
    expect(await validate(plainToInstance(ActivityPriceOptionDto, { ...value, updateMode: 'PATCH' }))).toEqual([]);
    expect((await validate(plainToInstance(ActivityPriceOptionDto, { ...value, updateMode: 'PATCH', pricingUnit: 'WRONG' }))).some(error => error.property === 'pricingUnit')).toBe(true);
  });
});
