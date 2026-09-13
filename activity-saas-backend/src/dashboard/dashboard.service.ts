import { Injectable } from '@nestjs/common';
import { BookingStatus, ProductStatus } from '@prisma/client';
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

    const [todayBookings, revenue, vendorActionRequiredBookings, manualReviewPendingBookings, legacyPendingBookings, totalBookings, cancelled, listings, liveListings, profile, recentBookings, quality] = await Promise.all([
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, createdAt: { gte: today, lt: tomorrow } } }),
      this.prisma.booking.aggregate({
        _sum: { amount: true },
        where: { vendorTenantId: tenantId, createdAt: { gte: monthStart }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } },
      }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, recordType: 'CANONICAL', status: BookingStatus.PENDING_VENDOR_CONFIRMATION } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, recordType: 'CANONICAL', status: BookingStatus.PENDING_MANUAL_REVIEW } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, recordType: 'LEGACY', status: { in: [BookingStatus.PENDING, BookingStatus.NEW] } } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, createdAt: { gte: monthStart } } }),
      this.prisma.booking.count({ where: { vendorTenantId: tenantId, createdAt: { gte: monthStart }, status: BookingStatus.CANCELLED } }),
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.product.count({ where: { tenantId, status: ProductStatus.LIVE } }),
      this.prisma.vendorProfile.findUnique({ where: { tenantId }, select: { readinessScore: true } }),
      this.prisma.booking.findMany({
        where: { vendorTenantId: tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { product: { select: { productCode: true, currentRevision: { select: { productName: true } } } } },
      }),
      this.performance.computeCurrent(tenantId, now),
    ]);

    return {
      bookingsToday: todayBookings,
      revenueMtd: Number(revenue._sum.amount ?? 0),
      pendingBookings: vendorActionRequiredBookings + manualReviewPendingBookings + legacyPendingBookings,
      vendorActionRequiredBookings,
      manualReviewPendingBookings,
      legacyPendingBookings,
      cancellationRate: totalBookings ? Number(((cancelled / totalBookings) * 100).toFixed(1)) : 0,
      listings,
      liveListings,
      responseTimeMinutes: quality.metrics.find((m) => m.metricCode === 'AVG_VENDOR_RESPONSE_MINUTES')?.rawValue ?? null,
      readinessScore: profile?.readinessScore ?? 0,
      qualityIssueCount: quality.openIssues.length,
      recentBookings: recentBookings.map((b) => ({ ...b, amount: Number(b.amount) })),
    };
  }
}
