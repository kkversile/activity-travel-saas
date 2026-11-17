import { FinancialEventStatus, FinancialEventType, PaymentCollectionMode, SettlementHoldScope, UserRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { FinanceService } from './finance.service';

const admin: any = { sub: 'admin-1', email: 'admin@example.com', role: UserRole.SUPER_ADMIN, tenantId: null };
const policy: any = { id: 'policy-1', vendorTenantId: 'vendor-1', cycleMode: 'MANUAL', eligibilityTrigger: 'BOOKING_CONFIRMED', settlementDelayDays: 0, weeklyDay: null, active: true, reviewRequired: false, version: 1 };
const booking = (id: string, amount = '10000', confirmedAt = new Date(Date.now() - 10 * 86400000)) => ({ id, amount: new Prisma.Decimal(amount), currency: 'INR', status: 'CONFIRMED', confirmedAt, economicsSnapshot: { vendorPayable: new Prisma.Decimal(amount) }, cancellation: null, events: [], redemption: null });
const event = (id: string, type: FinancialEventType, amount: string, b?: any, currency = 'INR') => ({ id, eventKey: id, vendorTenantId: 'vendor-1', type, status: FinancialEventStatus.POSTED, currency, amount: new Prisma.Decimal(amount), vendorAmount: new Prisma.Decimal(amount), booking: b || null, bookingId: b?.id || null, settlementAllocations: [], components: {}, occurredAt: new Date(Date.now() - 10 * 86400000) });
function service(events: any[], holds: any[] = []) { const prisma: any = { financeConfiguration: { upsert: jest.fn().mockResolvedValue({ paymentCollectionMode: PaymentCollectionMode.UNCONFIGURED, baseCurrency: 'INR' }) }, vendorSettlementPolicy: { findUnique: jest.fn().mockResolvedValue(policy) }, financialEvent: { findMany: jest.fn().mockResolvedValue(events) }, settlementHold: { findMany: jest.fn().mockResolvedValue(holds) } }; return new FinanceService(prisma, {} as any, {} as any); }

describe('FinanceService settlement reconciliation', () => {
  it('returns a retryable conflict when concurrent settlement creation loses a serializable transaction', async () => {
    const finance: any = new FinanceService({ $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }) } as any, {} as any, {} as any);
    jest.spyOn(finance, 'buildPreview').mockResolvedValue({ previewFingerprint: 'current', eligibleLines: [{ sourceEventIds: ['event-a'] }] });
    await expect(finance.createBatch(admin, { vendorTenantId: 'vendor-1', currency: 'INR', expectedPreviewFingerprint: 'current' })).rejects.toThrow('SETTLEMENT_CONCURRENT_MODIFICATION_RETRY');
  });
  it('returns the next payout activity period from its settlement batch', async () => {
    const nextPayout = { id: 'payout-1', amount: new Prisma.Decimal('4500'), dueDate: new Date('2026-11-04T00:00:00.000Z'), currency: 'INR', status: 'PENDING', createdAt: new Date('2026-11-01T00:00:00.000Z'), settlementBatch: { periodFrom: new Date('2026-10-19T00:00:00.000Z'), periodTo: new Date('2026-10-25T00:00:00.000Z') } };
    const prisma: any = {
      settlementBatch: { findMany: jest.fn().mockResolvedValue([]) },
      payout: { findMany: jest.fn(({ where }: any) => Promise.resolve(where.recordType === 'CANONICAL' ? [nextPayout] : [])) },
      vendorProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const finance = new FinanceService(prisma, {} as any, {} as any);

    const result = await finance.vendorSettlements({ role: UserRole.VENDOR, tenantId: 'vendor-1' } as any);

    expect(result.summary.nextPayout).toEqual({ amount: 4500, heldAmount: 0, dueDate: nextPayout.dueDate, currency: 'INR', periodFrom: nextPayout.settlementBatch.periodFrom, periodTo: nextPayout.settlementBatch.periodTo });
  });

  it('snapshots explicit commission GST and statutory withholding components without deriving rates', () => {
    const finance: any = service([]);
    expect(finance.vendorComponents({ vendorAmount: new Prisma.Decimal('870'), components: { supplierCommission: '100', gstOnCommissionAmount: '18', tds194OAmount: '10', gstTcsAmount: '2', taxAmount: '7' } }, { amount: new Prisma.Decimal('1000') })).toMatchObject({
      supplierCommission: '100',
      gstOnCommissionAmount: '18',
      tds194OAmount: '10',
      gstTcsAmount: '2',
      taxInformational: '7',
    });
  });

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

  it('maps active holds to exact settlement-line payable amounts without double counting', () => {
    const finance: any = service([]);
    const batch = {
      vendorTenantId: 'vendor-1',
      lines: [
        { bookingId: 'booking-1', netVendorPayable: new Prisma.Decimal('120.25'), allocations: [{ financialEventId: 'base-1', financialEvent: { vendorAmount: new Prisma.Decimal('100'), amount: new Prisma.Decimal('100') } }, { financialEventId: 'adj-1', financialEvent: { vendorAmount: new Prisma.Decimal('20.25'), amount: new Prisma.Decimal('20.25') } }] },
        { bookingId: 'booking-2', netVendorPayable: new Prisma.Decimal('80.50'), allocations: [{ financialEventId: 'base-2', financialEvent: { vendorAmount: new Prisma.Decimal('80.50'), amount: new Prisma.Decimal('80.50') } }] },
      ],
    };
    const holds = [
      { scope: SettlementHoldScope.BOOKING, vendorTenantId: 'vendor-1', bookingId: 'booking-1' },
      { scope: SettlementHoldScope.FINANCIAL_EVENT, vendorTenantId: 'vendor-1', financialEventId: 'adj-1' },
      { scope: SettlementHoldScope.FINANCIAL_EVENT, vendorTenantId: 'vendor-2', financialEventId: 'base-2' },
    ];

    expect(finance.heldAmountForBatch(batch, holds).toFixed(2)).toBe('120.25');
    expect(finance.heldAmountForBatch(batch, [{ scope: SettlementHoldScope.VENDOR, vendorTenantId: 'vendor-1' }]).toFixed(2)).toBe('200.75');
    expect(finance.heldAmountForBatch(batch, [
      { scope: SettlementHoldScope.FINANCIAL_EVENT, vendorTenantId: 'vendor-1', financialEventId: 'adj-1' },
      { scope: SettlementHoldScope.FINANCIAL_EVENT, vendorTenantId: 'vendor-1', financialEventId: 'adj-1' },
      { scope: SettlementHoldScope.FINANCIAL_EVENT, vendorTenantId: 'vendor-2', financialEventId: 'base-2' },
    ]).toFixed(2)).toBe('20.25');
  });

  it('keeps unrelated blocked rows from changing eligible reconciliation lines', async () => {
    const eligible = event('eligible-1', FinancialEventType.BOOKING_CONFIRMED, '1000', booking('booking-eligible', '1000'));
    const blocked = event('blocked-1', FinancialEventType.BOOKING_CONFIRMED, '500', { ...booking('booking-blocked', '500'), cancellation: { financialState: 'REFUND_FAILED', refund: { status: 'FAILED' } } });
    const result: any = await service([eligible, blocked]).preview(admin, { vendorTenantId: 'vendor-1', currency: 'INR' } as any);
    expect(result.eligibleLines.map((line: any) => line.sourceEventIds)).toEqual([['eligible-1']]); expect(result.blocked[0].reasonCodes).toContain('REFUND_FAILED');
  });

  it('requires outlet selection when a vendor has multiple outlets and filters settlement events to one outlet', async () => {
    const finance: any = service([]);
    finance.prisma.vendorOutlet = { findMany: jest.fn().mockResolvedValue([{ id: 'outlet-a', outletCode: 'A', isDefault: true }, { id: 'outlet-b', outletCode: 'B', isDefault: false }]) };
    await expect(finance.preview(admin, { vendorTenantId: 'vendor-1', currency: 'INR' } as any)).rejects.toThrow('Choose an outlet');

    await finance.preview(admin, { vendorTenantId: 'vendor-1', currency: 'INR', outletId: 'outlet-a' } as any);
    expect(finance.prisma.financialEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendorTenantId: 'vendor-1', OR: [{ outletId: 'outlet-a' }, { outletId: null, bookingId: null, type: 'VENDOR_ADJUSTMENT' }] }) }));
    await finance.preview(admin, { vendorTenantId: 'vendor-1', currency: 'INR', outletId: 'outlet-b' } as any);
    expect(finance.prisma.financialEvent.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendorTenantId: 'vendor-1', outletId: 'outlet-b' }) }));
    await expect(finance.preview(admin, { vendorTenantId: 'vendor-1', currency: 'INR', outletId: 'other-vendor-outlet' } as any)).rejects.toThrow('Outlet not found');
  });

  it('checks the payout uniqueness window per outlet after acquiring the vendor lock', async () => {
    const finance: any = service([]);
    const tx: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([]), payout: { findFirst: jest.fn().mockResolvedValue(null) } };
    const week = { start: new Date('2026-11-16T00:00:00Z'), end: new Date('2026-11-23T00:00:00Z') };
    await finance.assertNoWeeklyVendorPayout(tx, 'vendor-1', week, 'outlet-a');
    await finance.assertNoWeeklyVendorPayout(tx, 'vendor-1', week, 'outlet-b');
    expect(tx.payout.findFirst.mock.calls.map((call: any[]) => call[0].where)).toEqual([
      expect.objectContaining({ tenantId: 'vendor-1', outletId: 'outlet-a', createdAt: { gte: week.start, lt: week.end } }),
      expect.objectContaining({ tenantId: 'vendor-1', outletId: 'outlet-b', createdAt: { gte: week.start, lt: week.end } }),
    ]);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
