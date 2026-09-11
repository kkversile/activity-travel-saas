import { bookingRequestFingerprint, fingerprint } from './booking-fingerprint';

describe('booking fingerprints', () => {
  it('canonicalizes object key ordering', () => expect(fingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(fingerprint({ a: { c: 3, d: 4 }, b: 2 })));
  it('excludes idempotency key and timestamps from semantic request fingerprints', () => expect(bookingRequestFingerprint({ agentTenantId: 'a', ratePlanId: 'r', sessionId: 's', travellers: [{ travellerType: 'ADULT', quantity: 2 }], units: 1, travellerDetails: { name: 'Lead' }, bookingAnswers: {} })).toBe(bookingRequestFingerprint({ agentTenantId: 'a', ratePlanId: 'r', sessionId: 's', travellers: [{ travellerType: 'ADULT', quantity: 2 }], units: 1, travellerDetails: { name: 'Lead' }, bookingAnswers: {} })));
});
