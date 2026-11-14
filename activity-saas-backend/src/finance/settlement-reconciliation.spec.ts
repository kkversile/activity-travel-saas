import { FinancialEventStatus, FinancialEventType, PaymentCollectionMode, Prisma, UserRole } from '@prisma/client';
import { FinanceService } from './finance.service';

function make(events: any[], publicCodes?: any[]) { const prisma: any = { financeConfiguration: { upsert: jest.fn().mockResolvedValue({ paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED, baseCurrency: 'INR' }) }, vendorSettlementPolicy: { findUnique: jest.fn().mockResolvedValue({ vendorTenantId: 'v', active: true, reviewRequired: false, cycleMode: 'MANUAL', eligibilityTrigger: 'BOOKING_CONFIRMED', settlementDelayDays: 0, version: 1 }) }, financialEvent: { findMany: jest.fn().mockResolvedValue(events) }, settlementHold: { findMany: jest.fn().mockResolvedValue([]) } }; if (publicCodes) prisma.publicIdentifier = { findMany: jest.fn().mockResolvedValue(publicCodes) }; return new FinanceService(prisma, {} as any, {} as any); }
const e = (id: string, amount: string, booking?: any) => ({ id, vendorTenantId: 'v', type: booking ? FinancialEventType.BOOKING_CONFIRMED : FinancialEventType.VENDOR_ADJUSTMENT, status: FinancialEventStatus.POSTED, currency: 'INR', amount: new Prisma.Decimal(amount), vendorAmount: new Prisma.Decimal(amount), booking: booking || null, bookingId: booking?.id || null, settlementAllocations: [], components: {}, occurredAt: new Date(Date.now() - 20 * 86400000) });
const user: any = { sub: 'a', role: UserRole.SUPER_ADMIN, tenantId: null };

describe('settlement totals and currency boundaries', () => {
  it('allows a settled-base debit to offset a future booking', async () => {
    const base = { id: 'future-booking', amount: new Prisma.Decimal('10000'), currency: 'INR', status: 'CONFIRMED', confirmedAt: new Date(Date.now() - 20 * 86400000), economicsSnapshot: { vendorPayable: new Prisma.Decimal('10000') }, cancellation: null, events: [], redemption: null };
    const result: any = await make([e('future-base', '10000', base), e('debit', '-6000')]).preview(user, { vendorTenantId: 'v', currency: 'INR' } as any);
    expect(result.totals.netPayable).toBe('4000'); expect(result.eligible).toBe(true);
  });

  it('keeps a negative total open without creating an eligible payout', async () => {
    const result: any = await make([e('credit', '2000'), e('debit', '-6000')]).preview(user, { vendorTenantId: 'v', currency: 'INR' } as any);
    expect(result.totals.netPayable).toBe('-4000'); expect(result.batchReasonCodes).toContain('NEGATIVE_NET_PAYABLE'); expect(result.eligible).toBe(false);
  });

  it('requires an explicit currency before reading settlement events', async () => {
    await expect(make([]).preview(user, { vendorTenantId: 'v' } as any)).rejects.toThrow('SETTLEMENT_CURRENCY_REQUIRED');
  });
});


describe('settlement booking references', () => {
  it('adds public references without changing fingerprints or internal event selection', async () => {
    const booking = { id: 'booking-11', amount: new Prisma.Decimal('3147.9'), currency: 'INR', status: 'COMPLETED', confirmedAt: new Date('2026-01-01'), economicsSnapshot: { vendorPayable: new Prisma.Decimal('2998') }, cancellation: null, events: [], redemption: null };
    const events = [e('source-11', '2998', booking)];
    const plain: any = await make(events).preview(user, { vendorTenantId: 'v', currency: 'INR' } as any);
    const labeled: any = await make(events, [{ entityId: booking.id, publicCode: 'AG-26110011' }]).preview(user, { vendorTenantId: 'v', currency: 'INR' } as any);
    expect(labeled.eligibleLines[0]).toMatchObject({ bookingId: 'booking-11', bookingPublicCode: 'AG-26110011', sourceEventIds: ['source-11'], netVendorPayable: '2998' });
    expect(labeled.previewFingerprint).toBe(plain.previewFingerprint);
  });

  it('uses public booking references in vendor CSV while enforcing tenant scope', async () => {
    const findFirst = jest.fn().mockResolvedValue({ batchCode: 'PB-20261115', createdAt: new Date('2026-11-15T00:00:00Z'), lines: [{ lineType: 'BOOKING', bookingId: 'booking-11', currency: 'INR', grossBookingValue: '3147.9', vendorPayableBase: '2998', adjustmentAmount: '0', taxInformational: '0', netVendorPayable: '2998', components: {} }] });
    const service = new FinanceService({ settlementBatch: { findFirst }, publicIdentifier: { findMany: jest.fn().mockResolvedValue([{ entityId: 'booking-11', publicCode: 'AG-26110011' }]) } } as any, {} as any, {} as any);
    const csv = await service.vendorSettlementStatement({ sub: 'vendor-user', tenantId: 'v', role: UserRole.VENDOR } as any, 'batch-1');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'batch-1', vendorTenantId: 'v' } }));
    expect(csv).toContain('"AG-26110011","INR","3147.9","2998"');
    expect(csv).not.toContain('booking-11');
  });
});
