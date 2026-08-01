import { Injectable } from "@nestjs/common";
import { ActivityStatus, BookingStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const now = new Date();
    const [publishedActivities, openBookings, upcomingSchedules, scheduleCapacity, revenue] = await this.prisma.$transaction([
      this.prisma.activity.count({ where: { tenantId, status: ActivityStatus.PUBLISHED } }),
      this.prisma.booking.count({ where: { tenantId, status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] } } }),
      this.prisma.activitySchedule.count({ where: { activity: { tenantId }, startsAt: { gte: now }, isBookable: true } }),
      this.prisma.activitySchedule.aggregate({ where: { activity: { tenantId }, startsAt: { gte: now }, isBookable: true }, _sum: { capacity: true, bookedSeats: true } }),
      this.prisma.booking.aggregate({ where: { tenantId, status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } }, _sum: { totalMinor: true } })
    ]);
    const capacity = scheduleCapacity._sum.capacity ?? 0;
    const booked = scheduleCapacity._sum.bookedSeats ?? 0;
    return {
      publishedActivities,
      openBookings,
      upcomingSchedules,
      seatsAvailable: Math.max(0, capacity - booked),
      confirmedRevenueMinor: revenue._sum.totalMinor ?? 0,
      generatedAt: now.toISOString()
    };
  }
}
