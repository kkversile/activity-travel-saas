import { BookingsService } from './bookings.service';
import { bookingRequestFingerprint } from './booking-fingerprint';

describe('BookingsService idempotency', () => {
  it('uses the full include on fast retry and rejects a changed customer identity', async () => {
    const projection = { forAgent: jest.fn().mockReturnValue({ id: 'b1', snapshot: {}, travellers: [], timeline: [] }) };
    const dto: any = { ratePlanId: 'plan-1', sessionId: 'session-1', travellers: [{ travellerType: 'ADULT', quantity: 1 }], customerName: ' Kiran ', customerEmail: 'A@EXAMPLE.COM', bookingAnswers: {}, travellerDetails: [] };
    const fingerprint = bookingRequestFingerprint({ agentTenantId: 'agent-1', ratePlanId: 'plan-1', sessionId: 'session-1', travellers: [{ travellerType: 'ADULT', quantity: 1 }], units: null, travellerDetails: [], pickupDetails: null, bookingAnswers: {}, customerName: 'Kiran', customerEmail: 'a@example.com' });
    const prisma: any = { booking: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', requestFingerprint: fingerprint }) } };
    const service = new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, projection as any);
    await expect((service as any).create({ role: 'TRAVEL_AGENT', tenantId: 'agent-1', sub: 'user-1' }, dto, 'attempt-1')).resolves.toEqual(expect.objectContaining({ id: 'b1' }));
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ operationalSnapshot: true, events: expect.anything() }) }));
    await expect((service as any).create({ role: 'TRAVEL_AGENT', tenantId: 'agent-1', sub: 'user-1' }, { ...dto, customerName: 'Ravi' }, 'attempt-1')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }) });
  });
});

describe('BookingsService canonical traveller rules', () => {
  const service = () => new BookingsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  const normalized = { quantitiesByType: { ADULT: 2 } };

  it('requires exactly one lead traveller', () => {
    expect(() => (service() as any).validateTravellerDetails([
      { travellerType: 'ADULT', quantity: 1, isLead: true },
      { travellerType: 'ADULT', quantity: 1, isLead: false },
    ], normalized)).not.toThrow();
    expect(() => (service() as any).validateTravellerDetails([
      { travellerType: 'ADULT', quantity: 1, isLead: false },
      { travellerType: 'ADULT', quantity: 1, isLead: false },
    ], normalized)).toThrow('LEAD_TRAVELLER_REQUIRED');
    expect(() => (service() as any).validateTravellerDetails([
      { travellerType: 'ADULT', quantity: 1, isLead: true },
      { travellerType: 'ADULT', quantity: 1, isLead: true },
    ], normalized)).toThrow('MULTIPLE_LEAD_TRAVELLERS');
  });
});
