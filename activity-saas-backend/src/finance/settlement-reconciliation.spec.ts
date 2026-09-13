import { FinancialEventStatus, FinancialEventType, PaymentCollectionMode, Prisma, UserRole } from '@prisma/client';
import { FinanceService } from './finance.service';

function make(events: any[]) { const prisma: any = { financeConfiguration: { upsert: jest.fn().mockResolvedValue({ paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED, baseCurrency: 'INR' }) }, vendorSettlementPolicy: { findUnique: jest.fn().mockResolvedValue({ vendorTenantId: 'v', active: true, reviewRequired: false, cycleMode: 'MANUAL', eligibilityTrigger: 'BOOKING_CONFIRMED', settlementDelayDays: 0, version: 1 }) }, financialEvent: { findMany: jest.fn().mockResolvedValue(events) }, settlementHold: { findMany: jest.fn().mockResolvedValue([]) } }; return new FinanceService(prisma, {} as any, {} as any); }
const e = (id: string, amount: string, booking?: any) => ({ id, vendorTenantId: 'v', type: booking ? FinancialEventType.BOOKING_CONFIRMED : FinancialEventType.VENDOR_ADJUSTMENT, status: FinancialEventStatus.POSTED, currency: 'INR', amount: new Prisma.Decimal(amount), vendorAmount: new Prisma.Decimal(amount), booking: booking || null, bookingId: booking?.id || null, settlementAllocations: [], components: {}, occurredAt: new Date(Date.now() - 20 * 86400000) });
const user: any = { sub: 'a', role: UserRole.ADMIN, tenantId: null };

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
