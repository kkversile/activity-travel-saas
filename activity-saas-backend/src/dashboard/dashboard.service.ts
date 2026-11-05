import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus, PayoutRecordType, PayoutStatus, ProductStatus } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { SupplierPerformanceService } from '../quality/supplier-performance.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly performance: SupplierPerformanceService) {}

  async summary(user: AuthUser) {
    const tenantId = requireTenant(user);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousMonthLastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
    const previousPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, Math.min(now.getUTCDate(), previousMonthLastDay), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));

    const sevenDays = new Date(today); sevenDays.setUTCDate(sevenDays.getUTCDate() + 7);
    const documentExpiryEnd = new Date(today); documentExpiryEnd.setUTCDate(documentExpiryEnd.getUTCDate() + 30);
    const monthlyVendorBookingFilter = {
      booking: {
        is: {
          vendorTenantId: tenantId,
          createdAt: { gte: monthStart, lt: now },
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
        },
      },
    };
    const [todayBookings, todayGuestRows, nextSevenDayRows, netVendorRevenue, baseVendorRevenue, previousNetVendorRevenue, previousBaseVendorRevenue, nextPayout, vendorActionRequiredBookings, manualReviewPendingBookings, legacyPendingBookings, totalBookings, cancelled, listings, liveListings, draftListings, rejectedListings, vendorDocuments, profile, recentBookings, upcomingDepartures, todayDepartures, quality, reviewsToReply, averageReviewRating] = await Promise.all([
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, createdAt: { gte: today, lt: tomorrow } } }),
      this.prisma.booking.findMany({ where: { vendorTenantId: tenantId, serviceDate: { gte: today, lt: tomorrow }, status: { notIn: [BookingStatus.CANCELLED, BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED] } }, select: { pax: true } }),
      this.prisma.booking.findMany({ where: { vendorTenantId: tenantId, serviceDate: { gte: today, lt: sevenDays }, status: { notIn: [BookingStatus.CANCELLED, BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED] } }, select: { pax: true } }),
      this.prisma.bookingEconomicsSnapshot.aggregate({
        _sum: { netVendorPayable: true },
        where: { ...monthlyVendorBookingFilter, netVendorPayable: { not: null } },
      }),
      this.prisma.bookingEconomicsSnapshot.aggregate({
        _sum: { vendorPayable: true },
        where: { ...monthlyVendorBookingFilter, netVendorPayable: null },
      }),
      this.prisma.bookingEconomicsSnapshot.aggregate({
        _sum: { netVendorPayable: true },
        where: { booking: { is: { vendorTenantId: tenantId, createdAt: { gte: previousMonthStart, lt: previousPeriodEnd }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } } }, netVendorPayable: { not: null } },
      }),
      this.prisma.bookingEconomicsSnapshot.aggregate({
        _sum: { vendorPayable: true },
        where: { booking: { is: { vendorTenantId: tenantId, createdAt: { gte: previousMonthStart, lt: previousPeriodEnd }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } } }, netVendorPayable: null },
      }),
      this.prisma.payout.findFirst({
        where: {
          tenantId,
          recordType: PayoutRecordType.CANONICAL,
          status: { notIn: [PayoutStatus.PAID, PayoutStatus.RELEASED, PayoutStatus.RECONCILED] },
        },
        orderBy: { dueDate: 'asc' },
        select: { amount: true, dueDate: true, currency: true },
      }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, recordType: 'CANONICAL', status: BookingStatus.PENDING_VENDOR_CONFIRMATION } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, recordType: 'CANONICAL', status: BookingStatus.PENDING_MANUAL_REVIEW } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, recordType: 'LEGACY', status: { in: [BookingStatus.PENDING, BookingStatus.NEW] } } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, createdAt: { gte: monthStart } } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, createdAt: { gte: monthStart }, status: BookingStatus.CANCELLED } }),
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.product.count({ where: { tenantId, status: ProductStatus.LIVE } }),
      this.prisma.product.count({ where: { tenantId, status: ProductStatus.DRAFT } }),
      this.prisma.productRevision.count({ where: { product: { tenantId }, status: 'REJECTED' } }),
      this.prisma.vendorDocument.findMany({ where: { tenantId, currentStatus: 'VERIFIED' }, select: { type: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { status: true, expiresAt: true } } } }),
      this.prisma.vendorProfile.findUnique({ where: { tenantId }, select: { readinessScore: true, payoutAccountMasked: true, payoutBankName: true, payoutCurrency: true, verificationStatus: true } }),
      this.prisma.booking.findMany({
        where: { vendorTenantId: tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } } },
      }),
      this.prisma.booking.findMany({
        where: { vendorTenantId: tenantId, serviceDate: { gte: today, lt: sevenDays }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.REDEEMED] } },
        orderBy: { serviceDate: 'asc' }, take: 6,
        include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } } },
      }),
      this.prisma.booking.findMany({
        where: { vendorTenantId: tenantId, serviceDate: { gte: today, lt: tomorrow }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.REDEEMED] } },
        orderBy: { createdAt: 'asc' }, take: 12,
        include: { variant: { select: { name: true } }, session: { select: { localStartTime: true } }, product: { select: { productCode: true, currentRevision: { select: { productName: true, meetingPoint: true } } } } },
      }),
      this.performance.computeCurrent(tenantId, now),
      this.prisma.vendorReview.count({ where: { tenantId, status: 'PUBLISHED', vendorReply: null } }),
      this.prisma.vendorReview.aggregate({ where: { tenantId, status: 'PUBLISHED', reviewedAt: { gte: monthStart } }, _avg: { rating: true } }),
    ]);

    const verifiedLatestDocuments = vendorDocuments.flatMap((document: any) => {
      const latest = document.versions[0];
      return latest?.status === 'VERIFIED' && latest.expiresAt
        ? [{ type: document.type, expiresAt: latest.expiresAt }]
        : [];
    });
    const expiredDocuments = verifiedLatestDocuments.filter((document: any) => document.expiresAt < today);
    const expiringDocuments = verifiedLatestDocuments.filter((document: any) => document.expiresAt >= today && document.expiresAt <= documentExpiryEnd)
      .sort((a: any, b: any) => a.expiresAt.getTime() - b.expiresAt.getTime());

    const vendorNetEarningsMtd = Number(netVendorRevenue._sum.netVendorPayable ?? 0) + Number(baseVendorRevenue._sum.vendorPayable ?? 0);
    const previousPeriodVendorEarnings = Number(previousNetVendorRevenue._sum.netVendorPayable ?? 0) + Number(previousBaseVendorRevenue._sum.vendorPayable ?? 0);
    const vendorNetEarningsMtdChangePercent = previousPeriodVendorEarnings > 0 ? Number(((vendorNetEarningsMtd - previousPeriodVendorEarnings) / previousPeriodVendorEarnings * 100).toFixed(1)) : null;
    return {
      bookingsToday: todayBookings,
      guestsToday: todayGuestRows.reduce((sum, row) => sum + row.pax, 0),
      nextSevenDays: nextSevenDayRows.length,
      guestsNextSevenDays: nextSevenDayRows.reduce((sum, row) => sum + row.pax, 0),
      vendorNetEarningsMtd,
      vendorNetEarningsMtdChangePercent,
      nextPayout: nextPayout ? { amount: Number(nextPayout.amount), dueDate: nextPayout.dueDate, currency: nextPayout.currency } : null,
      payoutAccount: { masked: profile?.payoutAccountMasked || null, bankName: profile?.payoutBankName || null, currency: profile?.payoutCurrency || null, verificationStatus: profile?.verificationStatus || 'PENDING' },
      pendingBookings: vendorActionRequiredBookings + manualReviewPendingBookings + legacyPendingBookings,
      vendorActionRequiredBookings,
      manualReviewPendingBookings,
      legacyPendingBookings,
      cancellationRate: totalBookings ? Number(((cancelled / totalBookings) * 100).toFixed(1)) : 0,
      listings,
      liveListings,
      draftListings,
      rejectedListings,
      expiredDocuments: expiredDocuments.length,
      documentsExpiring: expiringDocuments.length,
      nearestExpiringDocument: expiringDocuments[0] || null,
      responseTimeMinutes: quality.metrics.find((m) => m.metricCode === 'AVG_VENDOR_RESPONSE_MINUTES')?.rawValue ?? null,
      readinessScore: profile?.readinessScore ?? 0,
      qualityIssueCount: quality.openIssues.length,
      reviewsToReply,
      averageReviewRatingMtd: averageReviewRating._avg.rating ?? null,
      recentBookings: recentBookings.map((b) => ({ ...b, amount: Number(b.amount) })),
      upcomingDepartures: upcomingDepartures.map((b) => ({ id: b.id, bookingCode: b.bookingCode, serviceDate: b.serviceDate, pax: b.pax, status: b.status, product: b.product.currentRevision?.productName || b.product.productCode })),
      todayDepartures: todayDepartures.map((b) => ({ id: b.id, bookingCode: b.bookingCode, serviceDate: b.serviceDate, time: b.session?.localStartTime || '—', pax: b.pax, status: b.status, product: b.product.currentRevision?.productName || b.product.productCode, option: b.variant?.name || 'Standard option', meetingPoint: b.product.currentRevision?.meetingPoint || 'Confirm meeting point', manifestUrl: `/api/vendor/manifest/export.csv?serviceDate=${b.serviceDate.toISOString().slice(0, 10)}` })),
    };
  }

  async bookingTrend(user: AuthUser, fromInput?: string, toInput?: string) {
    const tenantId = requireTenant(user);
    const now = new Date();
    const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const defaultFrom = new Date(defaultTo); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 13);
    const parseDate = (value: string | undefined, fallback: Date) => {
      if (!value) return fallback;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Dashboard trend dates must use YYYY-MM-DD.');
      return parsed;
    };
    const from = parseDate(fromInput, defaultFrom);
    const toStart = parseDate(toInput, defaultTo);
    const to = new Date(toStart); to.setUTCDate(to.getUTCDate() + 1);
    if (to <= from) throw new BadRequestException('Dashboard trend end date must be after the start date.');
    const rows = await this.prisma.booking.findMany({
      where: { vendorTenantId: tenantId, serviceDate: { gte: from, lt: to }, status: { notIn: [BookingStatus.CANCELLED, BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED] } },
      select: { serviceDate: true, pax: true, amount: true }, orderBy: { serviceDate: 'asc' },
    });
    const totals = new Map<string, { bookings: number; guests: number; revenue: number }>();
    for (const row of rows) {
      const date = row.serviceDate.toISOString().slice(0, 10);
      const current = totals.get(date) || { bookings: 0, guests: 0, revenue: 0 };
      current.bookings += 1; current.guests += row.pax; current.revenue += Number(row.amount); totals.set(date, current);
    }
    const days: Array<{ date: string; bookings: number; guests: number; revenue: number }> = [];
    for (const cursor = new Date(from); cursor < to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10); days.push({ date, ...(totals.get(date) || { bookings: 0, guests: 0, revenue: 0 }) });
    }
    return { from: from.toISOString().slice(0, 10), to: toStart.toISOString().slice(0, 10), days };
  }
}
