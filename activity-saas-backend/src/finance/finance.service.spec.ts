import { FinancialEventStatus, FinancialEventType, PaymentCollectionMode, SettlementHoldScope, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { FinanceService } from './finance.service';

const admin: any = { sub: 'admin-1', email: 'admin@example.com', role: UserRole.ADMIN, tenantId: null };
const policy: any = { id: 'policy-1', vendorTenantId: 'vendor-1', cycleMode: 'MANUAL', eligibilityTrigger: 'BOOKING_CONFIRMED', settlementDelayDays: 0, weeklyDay: null, active: true, reviewRequired: false, version: 1 };
const booking = (id: string, amount = '10000', confirmedAt = new Date(Date.now() - 10 * 86400000)) => ({ id, amount: new Prisma.Decimal(amount), currency: 'INR', status: 'CONFIRMED', confirmedAt, economicsSnapshot: { vendorPayable: new Prisma.Decimal(amount) }, cancellation: null, events: [], redemption: null });
const event = (id: string, type: FinancialEventType, amount: string, b?: any, currency = 'INR') => ({ id, eventKey: id, vendorTenantId: 'vendor-1', type, status: FinancialEventStatus.POSTED, currency, amount: new Prisma.Decimal(amount), vendorAmount: new Prisma.Decimal(amount), booking: b || null, bookingId: b?.id || null, settlementAllocations: [], components: {}, occurredAt: new Date(Date.now() - 10 * 86400000) });
function service(events: any[], holds: any[] = []) { const prisma: any = { financeConfiguration: { upsert: jest.fn().mockResolvedValue({ paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED, baseCurrency: 'INR' }) }, vendorSettlementPolicy: { findUnique: jest.fn().mockResolvedValue(policy) }, financialEvent: { findMany: jest.fn().mockResolvedValue(events) }, settlementHold: { findMany: jest.fn().mockResolvedValue(holds) } }; return new FinanceService(prisma, {} as any, {} as any); }

describe('FinanceService settlement reconciliation', () => {
  it('groups a booking base and linked adjustment without treating the adjustment as base', async () => {
    const base = event('base-1', FinancialEventType.BOOKING_CONFIRMED, '8000', booking('booking-1', '8000'));
    const debit = event('adjustment-1', FinancialEventType.VENDOR_ADJUSTMENT, '-6000', base.booking);
    const result: any = await service([base, debit]).preview(admin, { vendorTenantId: 'vendor-1', currency: 'inr' } as any);
    expect(result.totals).toMatchObject({ vendorBasePayable: '8000', adjustmentTotal: '-6000', netPayable: '2000' });
    expect(result.eligibleLines[0]).toEqual(expect.objectContaining({ vendorPayableBase: '8000', adjustmentAmount: '-6000', netVendorPayable: '2000', sourceEventIds: ['base-1', 'adjustment-1'] }));
  });

  it('classifies each held event once and reports stable scope reasons', async () => {
    const base = event('event-1', FinancialEventType.BOOKING_CONFIRMED, '1000', booking('booking-1', '1000'));
    const holds = [{ scope: SettlementHoldScope.VENDOR, vendorTenantId: 'vendor-1', bookingId: null, financialEventId: null }, { scope: SettlementHoldScope.BOOKING, vendorTenantId: 'vendor-1', bookingId: 'booking-1', financialEventId: null }, { scope: SettlementHoldScope.FINANCIAL_EVENT, vendorTenantId: 'vendor-1', bookingId: null, financialEventId: 'event-1' }];
    const result: any = await service([base], holds).preview(admin, { vendorTenantId: 'vendor-1', currency: 'INR' } as any);
    expect(result.eligibleLines).toHaveLength(0); expect(result.blocked[0].reasonCodes).toEqual(expect.arrayContaining(['SETTLEMENT_VENDOR_HOLD', 'SETTLEMENT_BOOKING_HOLD', 'SETTLEMENT_EVENT_HOLD']));
    expect(new Set(result.blocked.map((row: any) => row.eventId)).size).toBe(result.blocked.length);
  });

  it('keeps unrelated blocked rows from changing eligible reconciliation lines', async () => {
    const eligible = event('eligible-1', FinancialEventType.BOOKING_CONFIRMED, '1000', booking('booking-eligible', '1000'));
    const blocked = event('blocked-1', FinancialEventType.BOOKING_CONFIRMED, '500', { ...booking('booking-blocked', '500'), cancellation: { financialState: 'REFUND_FAILED', refund: { status: 'FAILED' } } });
    const result: any = await service([eligible, blocked]).preview(admin, { vendorTenantId: 'vendor-1', currency: 'INR' } as any);
    expect(result.eligibleLines.map((line: any) => line.sourceEventIds)).toEqual([['eligible-1']]); expect(result.blocked[0].reasonCodes).toContain('REFUND_FAILED');
  });
});
