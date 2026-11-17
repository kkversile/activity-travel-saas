import { BookingStatus, CancellationInitiator, Prisma, UserRole } from '@prisma/client';
import { CancellationService } from './cancellation.service';

const user = (tenantId: string, role: UserRole): any => ({ sub: `${tenantId}-user`, email: `${tenantId}@test.local`, role, tenantId, organizationRole: 'OWNER' });
const booking = (agentTenantId = 'agent-a', vendorTenantId = 'vendor-a'): any => ({ id: 'booking-1', agentTenantId, vendorTenantId, recordType: 'CANONICAL', status: BookingStatus.CANCELLED, bookingCode: 'VY-1', serviceDate: new Date(), serviceTimezone: 'Asia/Kolkata', customerName: 'Customer', amount: new Prisma.Decimal('1000.00'), currency: 'INR', cancellation: null, travellers: [], events: [], operationalSnapshot: null, economicsSnapshot: null });
const cancellation = (initiator: CancellationInitiator = CancellationInitiator.AGENT): any => ({ id: 'cancel-1', initiator, reasonCategory: 'CUSTOMER_REQUEST', reason: 'test', financialState: 'REFUND_PENDING', cancellationCharge: new Prisma.Decimal('100.00'), refundEntitlement: new Prisma.Decimal('900.00'), currency: 'INR', cancelledAt: new Date(), daysBeforeService: 3, refund: null, financialEvents: [] });

describe('CancellationService authorization and invariants', () => {
  it('includes the public booking code in finance refund rows', async () => {
    const refund = { id: 'refund-1', booking: { id: 'booking-1', bookingCode: 'VY-1' }, cancellation: {} };
    const prisma: any = {
      refund: { findMany: jest.fn().mockResolvedValue([refund]) },
      publicIdentifier: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.entityType === 'BOOKING' ? [{ entityId: 'booking-1', publicCode: 'VYB-000001' }] : [{ entityId: 'refund-1', publicCode: 'RF-26110001' }])) },
    };
    const service = new CancellationService(prisma, {} as any, {} as any, {} as any);
    await expect(service.refunds()).resolves.toEqual([{ ...refund, publicCode: 'RF-26110001', booking: { ...refund.booking, publicCode: 'VYB-000001' } }]);
  });

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
    (service as any).outletAccess = { resolve: jest.fn().mockResolvedValue({ tenantId: 'vendor-b', outletIds: ['outlet-b'], aggregate: false }) };
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


describe('Cancellation outcomes use the booked policy snapshot', () => {
  afterEach(() => jest.useRealTimers());
  const strictRules = [
    { minDaysBefore: 0, maxDaysBefore: 2, chargeType: 'PERCENTAGE', chargeValue: '100' },
    { minDaysBefore: 3, maxDaysBefore: 6, chargeType: 'PERCENTAGE', chargeValue: '50' },
    { minDaysBefore: 7, maxDaysBefore: null, chargeType: 'PERCENTAGE', chargeValue: '0' },
  ];
  it.each([
    ['2026-11-16', '2520', '0', 'CANCELLED_NO_REFUND'],
    ['2026-11-17', '1260', '1260', 'REFUND_PENDING'],
    ['2026-11-18', '1260', '1260', 'REFUND_PENDING'],
    ['2026-11-20', '1260', '1260', 'REFUND_PENDING'],
    ['2026-11-21', '0', '2520', 'REFUND_PENDING'],
  ])('calculates charge and refund for %s at inclusive boundaries', async (date, charge, refund, state) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T14:00:00Z'));
    const saved = { ...booking(), status: BookingStatus.CONFIRMED, amount: new Prisma.Decimal('2520'), version: 1,
      operationalSnapshot: { serviceTimezone: 'Asia/Kolkata', cancellationPolicySnapshot: strictRules, cancellationPolicyFingerprint: 'booked-strict-policy', sessionSnapshot: { serviceDate: date, startsAt: `${date}T03:30:00Z` } },
      economicsSnapshot: { finalAmount: '2520', currency: 'INR' },
    };
    const prisma: any = { booking: { findFirst: jest.fn().mockResolvedValue(saved) } };
    const service = new CancellationService(prisma, {} as any, {} as any, {} as any);
    const result: any = await service.agentPreview(user('agent-a', UserRole.TRAVEL_AGENT), saved.id);
    expect(result).toEqual(expect.objectContaining({ eligible: true, cancellationCharge: charge, refundEntitlement: refund, financialState: state }));
    expect(new Prisma.Decimal(result.cancellationCharge).add(result.refundEntitlement).toString()).toBe('2520');
  });
  it('rounds a partial refund once and keeps charge plus refund equal to the booking amount', () => {
    const service = new CancellationService({} as any, {} as any, {} as any, {} as any);
    const saved = { ...booking(), status: BookingStatus.CONFIRMED, version: 1,
      operationalSnapshot: { serviceTimezone: 'Asia/Kolkata', cancellationPolicySnapshot: strictRules, cancellationPolicyFingerprint: 'booked-strict-policy', sessionSnapshot: { serviceDate: '2026-11-18', startsAt: '2026-11-18T03:30:00Z' } },
      economicsSnapshot: { finalAmount: '2520.01', currency: 'INR' },
    };
    const result = (service as any).calculate(saved, new Date('2026-11-14T14:00:00Z'));
    expect(result.cancellationCharge.toString()).toBe('1260.01');
    expect(result.refundEntitlement.toString()).toBe('1260');
  });
});


describe('Independent customer and vendor cancellation resolutions', () => {
  it('keeps unresolved vendor liability visible after the customer refund is resolved', async () => {
    const row: any = { id: 'cancel-1', financialState: 'REFUNDED', initiator: 'VENDOR', reasonCategory: 'WEATHER', reason: 'Unsafe conditions', bookingAmount: new Prisma.Decimal('2520'), cancellationCharge: new Prisma.Decimal('0'), refundEntitlement: new Prisma.Decimal('2520'), currency: 'INR', vendorSettlementResolution: null, booking: { id: 'booking-1', bookingCode: 'VY-1', economicsSnapshot: { vendorPayable: new Prisma.Decimal('2400') }, vendorTenant: { id: 'vendor-1', name: 'Supplier' } } };
    const prisma: any = { bookingCancellation: { findMany: jest.fn().mockResolvedValue([row]) }, publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityId: 'booking-1', publicCode: 'AG-26110005' }]) } };
    const service = new CancellationService(prisma, {} as any, {} as any, {} as any);
    await expect(service.operationalCancellations()).resolves.toEqual([expect.objectContaining({ publicCode: 'AG-26110005', bookingAmount: '2520', vendorPayable: '2400', vendorSettlementResolved: false, financialState: 'REFUNDED' })]);
    expect(prisma.bookingCancellation.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ vendorSettlementResolution: true }) }));
    row.vendorSettlementResolution = { finalVendorPayable: new Prisma.Decimal('0') };
    await expect(service.operationalCancellations()).resolves.toEqual([expect.objectContaining({ finalVendorPayable: '0', vendorSettlementResolved: true })]);
  });

  function resolutionService(financialState = 'CANCELLED_PENDING_FINANCIAL') {
    const row: any = { id: 'cancel-1', bookingId: 'booking-1', initiator: 'VENDOR', currency: 'INR', financialState, refund: null, bookingAmount: new Prisma.Decimal('2520'), calculationSnapshot: {}, booking: { vendorTenantId: 'vendor-1', economicsSnapshot: { id: 'economics-1' } } };
    const tx: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'cancel-1' }]), bookingCancellation: { findUniqueOrThrow: jest.fn().mockResolvedValue(row), update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...row, ...data })) }, booking: { findUnique: jest.fn().mockResolvedValue({ vendorTenantId: 'vendor-1', agentTenantId: 'agent-1' }) }, financialEvent: { upsert: jest.fn() } };
    const service = new CancellationService({ $transaction: (fn: any) => fn(tx) } as any, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any);
    const createRefund = jest.spyOn(service as any, 'createRefund').mockResolvedValue({ id: 'refund-1' });
    return { service, tx, createRefund };
  }
  it('rejects a mismatched financial total without creating a refund', async () => {
    const { service, tx, createRefund } = resolutionService();
    await expect(service.resolveFinancial(user('', UserRole.ADMIN), 'cancel-1', { cancellationCharge: '0', refundEntitlement: '2500', reason: 'Supplier cancelled' })).rejects.toThrow('FINANCIAL_TOTAL_MISMATCH');
    expect(tx.bookingCancellation.update).not.toHaveBeenCalled(); expect(createRefund).not.toHaveBeenCalled();
  });
  it('records a full refund decision and creates exactly one refund', async () => {
    const { service, tx, createRefund } = resolutionService();
    await expect(service.resolveFinancial(user('', UserRole.ADMIN), 'cancel-1', { cancellationCharge: '0', refundEntitlement: '2520', reason: 'Supplier cancelled' })).resolves.toEqual(expect.objectContaining({ financialState: 'REFUND_PENDING' }));
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(tx.financialEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ type: 'CANCELLATION_FINANCIAL_RESOLVED', eventKey: 'cancellation:cancel-1:financial-resolved' }) }));
  });
  it('prevents a second decision from overwriting the saved financial resolution', async () => {
    const { service, tx, createRefund } = resolutionService('REFUND_PENDING');
    await expect(service.resolveFinancial(user('', UserRole.ADMIN), 'cancel-1', { cancellationCharge: '0', refundEntitlement: '2520', reason: 'Duplicate request' })).rejects.toThrow('FINANCIAL_STATE_NOT_PENDING');
    expect(tx.bookingCancellation.update).not.toHaveBeenCalled(); expect(createRefund).not.toHaveBeenCalled();
  });
});
