import { BookingStatus, CancellationInitiator, Prisma, UserRole } from '@prisma/client';
import { CancellationService } from './cancellation.service';

const user = (tenantId: string, role: UserRole): any => ({ sub: `${tenantId}-user`, email: `${tenantId}@test.local`, role, tenantId, organizationRole: 'OWNER' });
const booking = (agentTenantId = 'agent-a', vendorTenantId = 'vendor-a'): any => ({ id: 'booking-1', agentTenantId, vendorTenantId, recordType: 'CANONICAL', status: BookingStatus.CANCELLED, bookingCode: 'VY-1', serviceDate: new Date(), serviceTimezone: 'Asia/Kolkata', customerName: 'Customer', amount: new Prisma.Decimal('1000.00'), currency: 'INR', cancellation: null, travellers: [], events: [], operationalSnapshot: null, economicsSnapshot: null });
const cancellation = (initiator: CancellationInitiator = CancellationInitiator.AGENT): any => ({ id: 'cancel-1', initiator, reasonCategory: 'CUSTOMER_REQUEST', reason: 'test', financialState: 'REFUND_PENDING', cancellationCharge: new Prisma.Decimal('100.00'), refundEntitlement: new Prisma.Decimal('900.00'), currency: 'INR', cancelledAt: new Date(), daysBeforeService: 3, refund: null, financialEvents: [] });

describe('CancellationService authorization and invariants', () => {
  it('returns an own existing agent cancellation with the stored initiator', async () => {
    const prisma: any = { bookingCancellation: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new CancellationService(prisma, {} as any, {} as any, {} as any);
    const row = { ...cancellation(), requestFingerprint: (service as any).requestFingerprint('booking-1', 'random-key', 'CUSTOMER_REQUEST', 'test'), booking: booking() };
    prisma.bookingCancellation.findFirst.mockResolvedValue(row);
    await expect(service.agentCancel(user('agent-a', UserRole.TRAVEL_AGENT), 'booking-1', { expectedCancellationFingerprint: 'x', reasonCategory: 'CUSTOMER_REQUEST', reason: 'test', acknowledged: true }, 'random-key')).resolves.toEqual(expect.objectContaining({ cancellation: expect.objectContaining({ initiator: CancellationInitiator.AGENT }) }));
    expect(prisma.bookingCancellation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ booking: { agentTenantId: 'agent-a' } }) }));
  });

  it('denies an other agent before returning an existing cancellation', async () => {
    const tx: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'booking-1' }]), booking: { findUniqueOrThrow: jest.fn().mockResolvedValue(booking('agent-a')) } };
    const prisma: any = { bookingCancellation: { findFirst: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new CancellationService(prisma, {} as any, {} as any, {} as any);
    await expect(service.agentCancel(user('agent-b', UserRole.TRAVEL_AGENT), 'booking-1', { expectedCancellationFingerprint: 'x', reasonCategory: 'CUSTOMER_REQUEST', reason: 'test', acknowledged: true }, 'known-key')).rejects.toThrow('Booking not found');
  });

  it('denies an other agent on the uniqueness-conflict reload path', async () => {
    const prisma: any = { bookingCancellation: { findFirst: jest.fn().mockResolvedValue(null) }, booking: { findFirst: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }) };
    const service = new CancellationService(prisma, {} as any, {} as any, {} as any);
    await expect(service.agentCancel(user('agent-b', UserRole.TRAVEL_AGENT), 'booking-1', { expectedCancellationFingerprint: 'x', reasonCategory: 'CUSTOMER_REQUEST', reason: 'test', acknowledged: true }, 'known-key')).rejects.toThrow('Booking not found');
  });

  it('denies a cross-vendor existing cancellation before projecting it', async () => {
    const tx: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'booking-1' }]), booking: { findUniqueOrThrow: jest.fn().mockResolvedValue(booking('agent-a', 'vendor-a')) } };
    const prisma: any = { bookingCancellation: { findFirst: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn((callback: any) => callback(tx)) };
    const service = new CancellationService(prisma, {} as any, {} as any, {} as any);
    await expect(service.operationalCancel(user('vendor-b', UserRole.VENDOR), 'booking-1', { reasonCategory: 'WEATHER', reason: 'test' }, CancellationInitiator.VENDOR)).rejects.toThrow('Booking not found');
  });

  it.each([
    [[], 'CANCELLATION_HOLD_MISSING'],
    [[{ id: 'h1' }, { id: 'h2' }], 'CANCELLATION_HOLD_AMBIGUOUS'],
  ])('rejects pending hold cardinality %j', (holds, message) => {
    const service = new CancellationService({} as any, {} as any, {} as any, {} as any);
    expect(() => (service as any).requirePendingHold(holds)).toThrow(message);
  });

  it('accepts exactly one pending hold', () => {
    const service = new CancellationService({} as any, {} as any, {} as any, {} as any);
    expect((service as any).requirePendingHold([{ id: 'h1' }])).toEqual({ id: 'h1' });
  });

  it.each(['', '-100', '1e3', 'Infinity', '1.234'])('rejects invalid financial input %s', (value) => {
    const service = new CancellationService({} as any, {} as any, {} as any, {} as any);
    expect(() => (service as any).financialMoney(value, 'charge')).toThrow();
  });
});
