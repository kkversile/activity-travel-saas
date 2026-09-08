import { Injectable } from '@nestjs/common';
import { BookingStatus, ActivityStatus } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser) {
    const tenantId = requireTenant(user);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [todayBookings, revenue, pending, totalBookings, cancelled, listings, liveListings, recentBookings] = await Promise.all([
      this.prisma.booking.count({ where: { tenantId, createdAt: { gte: today, lt: tomorrow } } }),
      this.prisma.booking.aggregate({
        _sum: { amount: true },
        where: { tenantId, createdAt: { gte: monthStart }, status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } },
      }),
      this.prisma.booking.count({ where: { tenantId, status: BookingStatus.PENDING } }),
      this.prisma.booking.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      this.prisma.booking.count({ where: { tenantId, createdAt: { gte: monthStart }, status: BookingStatus.CANCELLED } }),
      this.prisma.activity.count({ where: { tenantId } }),
      this.prisma.activity.count({ where: { tenantId, status: ActivityStatus.LIVE } }),
      this.prisma.booking.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { activity: { select: { productName: true } } },
      }),
    ]);

    return {
      bookingsToday: todayBookings,
      revenueMtd: Number(revenue._sum.amount ?? 0),
      pendingBookings: pending,
      cancellationRate: totalBookings ? Number(((cancelled / totalBookings) * 100).toFixed(1)) : 0,
      listings,
      liveListings,
      responseTimeMinutes: 6,
      readinessScore: 81,
      recentBookings: recentBookings.map((b) => ({ ...b, amount: Number(b.amount) })),
    };
  }
}
