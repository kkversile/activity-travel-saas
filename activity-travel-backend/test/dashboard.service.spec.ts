import { DashboardService } from "../src/modules/dashboard/dashboard.service";

describe("DashboardService", () => {
  it("returns tenant-scoped operational metrics", async () => {
    const prisma = {
      activity: { count: jest.fn().mockResolvedValue(3) },
      booking: { count: jest.fn().mockResolvedValue(2), aggregate: jest.fn().mockResolvedValue({ _sum: { totalMinor: 12500 } }) },
      activitySchedule: {
        count: jest.fn().mockResolvedValue(4),
        aggregate: jest.fn().mockResolvedValue({ _sum: { capacity: 20, bookedSeats: 7 } })
      },
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries))
    };
    const result = await new DashboardService(prisma as never).summary("tenant-a");
    expect(result).toMatchObject({ publishedActivities: 3, openBookings: 2, upcomingSchedules: 4, seatsAvailable: 13, confirmedRevenueMinor: 12500 });
    expect(prisma.activity.count).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant-a", status: "PUBLISHED" } }));
    expect(prisma.activitySchedule.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ activity: { tenantId: "tenant-a" } }) }));
  });
});
