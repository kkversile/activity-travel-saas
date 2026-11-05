import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const user = { sub: 'vendor-user', email: 'vendor@example.com', role: UserRole.VENDOR, tenantId: 'tenant-1' };

  it('returns the nearest document expiry and sums vendor net earnings rather than gross booking amounts', async () => {
    const expiresAt = new Date(Date.now() + 10 * 86400000);
    const expiredAt = new Date(Date.now() - 10 * 86400000);
    const prisma: any = {
      booking: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockImplementation(({ where, select }: any) => {
        if (!select?.pax) return Promise.resolve([]);
        const windowMs = where?.serviceDate?.lt && where?.serviceDate?.gte ? where.serviceDate.lt.getTime() - where.serviceDate.gte.getTime() : 0;
        if (windowMs >= 6 * 86400000) return Promise.resolve([{ pax: 3 }, { pax: 2 }, { pax: 1 }]);
        if (windowMs > 0) return Promise.resolve([{ pax: 4 }, { pax: 3 }]);
        return Promise.resolve([]);
      }) },
      bookingEconomicsSnapshot: { aggregate: jest.fn()
        .mockResolvedValueOnce({ _sum: { netVendorPayable: '1200' } })
        .mockResolvedValueOnce({ _sum: { vendorPayable: '300' } })
        .mockResolvedValueOnce({ _sum: { netVendorPayable: '800' } })
        .mockResolvedValueOnce({ _sum: { vendorPayable: '200' } }) },
      payout: { findFirst: jest.fn().mockResolvedValue(null) },
      product: { count: jest.fn().mockResolvedValue(0) },
      productRevision: { count: jest.fn().mockResolvedValue(0) },
      vendorDocument: { findMany: jest.fn().mockResolvedValue([
        { type: 'PUBLIC_LIABILITY_INSURANCE', versions: [{ status: 'VERIFIED', expiresAt }] },
        { type: 'GSTIN', versions: [{ status: 'VERIFIED', expiresAt: expiredAt }] },
      ]) },
      vendorProfile: { findUnique: jest.fn().mockResolvedValue({ readinessScore: 80, payoutAccountMasked: '••4417', payoutBankName: 'HDFC', payoutCurrency: 'INR', verificationStatus: 'VERIFIED' }) },
      vendorReview: { count: jest.fn().mockResolvedValue(3), aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.6 } }) },
    };
    const performance = { computeCurrent: jest.fn().mockResolvedValue({ metrics: [], openIssues: [] }) };

    const result = await new DashboardService(prisma, performance as any).summary(user);

    expect(prisma.vendorDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1', currentStatus: 'VERIFIED' } }));
    expect(result.documentsExpiring).toBe(1);
    expect(result.expiredDocuments).toBe(1);
    expect(result.nearestExpiringDocument).toEqual({ type: 'PUBLIC_LIABILITY_INSURANCE', expiresAt });
    expect(result.vendorNetEarningsMtd).toBe(1500);
    expect(result.vendorNetEarningsMtdChangePercent).toBe(50);
    expect(result.nextSevenDays).toBe(3);
    expect(result.guestsNextSevenDays).toBe(6);
    expect(result.guestsToday).toBe(7);
    expect(result.reviewsToReply).toBe(3);
    expect(result.averageReviewRatingMtd).toBe(4.6);
    expect(result.payoutAccount).toEqual({ masked: '••4417', bankName: 'HDFC', currency: 'INR', verificationStatus: 'VERIFIED' });
    expect(prisma.payout.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-1',
        recordType: 'CANONICAL',
        status: { notIn: ['PAID', 'RELEASED', 'RECONCILED'] },
      },
      orderBy: { dueDate: 'asc' },
    }));
    expect(prisma.bookingEconomicsSnapshot.aggregate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      _sum: { netVendorPayable: true },
      where: expect.objectContaining({ netVendorPayable: { not: null }, booking: { is: expect.objectContaining({ vendorTenantId: 'tenant-1' }) } }),
    }));
    expect(prisma.bookingEconomicsSnapshot.aggregate).toHaveBeenNthCalledWith(3, expect.objectContaining({
      _sum: { netVendorPayable: true },
      where: expect.objectContaining({ netVendorPayable: { not: null }, booking: { is: expect.objectContaining({ vendorTenantId: 'tenant-1' }) } }),
    }));
  });

  it('builds a complete tenant-scoped booking trend', async () => {
    const prisma = { booking: { findMany: jest.fn().mockResolvedValue([
      { serviceDate: new Date('2026-10-30T00:00:00.000Z'), pax: 2, amount: '400' },
      { serviceDate: new Date('2026-10-30T00:00:00.000Z'), pax: 1, amount: '125' },
    ]) } } as any;
    const service = new DashboardService(prisma, {} as any);

    const result = await service.bookingTrend(user, '2026-10-30', '2026-10-31');

    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendorTenantId: 'tenant-1' }) }));
    expect(result.days).toEqual([
      { date: '2026-10-30', bookings: 2, guests: 3, revenue: 525 },
      { date: '2026-10-31', bookings: 0, guests: 0, revenue: 0 },
    ]);
  });

  it('rejects malformed trend date input', async () => {
    const service = new DashboardService({ booking: { findMany: jest.fn() } } as any, {} as any);
    await expect(service.bookingTrend(user, 'not-a-date', '2026-10-31')).rejects.toThrow('YYYY-MM-DD');
  });
});
