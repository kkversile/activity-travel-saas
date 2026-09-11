import { BookingSnapshotService } from './booking-snapshot.service';

describe('BookingSnapshotService', () => {
  it('freezes authenticated agent identity and a safe question projection', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'snapshot-1' });
    const service = new BookingSnapshotService();
    const tx = { bookingSnapshot: { create } } as any;
    await service.create(tx, { booking: { id: 'booking-1', paxBreakdown: { ADULT: 1 }, capacityConsumption: 1, bookingMode: 'INSTANT', confirmationDueAt: null }, plan: { id: 'plan-1', ratePlanCode: 'RP-1', name: 'Standard', validFrom: new Date(), validTo: new Date(), cutOffMinutes: 0, variant: { id: 'variant-1', version: 2, name: 'Variant', product: { id: 'product-1', productCode: 'P-1', currentRevision: { id: 'revision-1', versionNumber: 3, productName: 'Kayak', type: 'ACTIVITY', subType: 'WATER', bookingQuestions: [] } } }, channelMappings: [] }, session: { id: 'session-1', serviceDate: new Date(), localStartTime: '10:00', localEndTime: '12:00', startsAt: new Date(), endsAt: new Date(), sessionKey: 'S-1', scheduleTemplate: { id: 'schedule-1', scheduleCode: 'SCH', name: 'Schedule', operatingModel: 'FIXED', timezone: 'Asia/Kolkata', capacityUnit: 'PAX' } }, agent: { id: 'agent-1', name: 'Agent Tenant' }, user: { sub: 'authenticated-user-1', id: 'wrong-id', fullName: 'Demo Agent', email: 'agent@example.com' }, policy: [], policyFingerprint: 'policy-1', questions: [{ id: 'q-1', code: 'passport', label: 'Passport', helpText: 'Optional', type: 'TEXT', required: false, options: [], appliesPerTraveller: true, rank: 1, createdAt: new Date(), updatedAt: new Date() }], bookingAnswers: {}, cancellationAcknowledgedAt: new Date(), quote: { bookingMode: 'INSTANT', confirmationSlaMinutes: null } });
    const data = create.mock.calls[0][0].data;
    expect(data.agentSnapshot).toEqual({ tenantId: 'agent-1', tenantName: 'Agent Tenant', userId: 'authenticated-user-1', userName: 'Demo Agent', email: 'agent@example.com' });
    expect(data.questionsSnapshot).toEqual([{ id: 'q-1', code: 'passport', label: 'Passport', helpText: 'Optional', type: 'TEXT', required: false, options: [], appliesPerTraveller: true, rank: 1 }]);
  });
});
