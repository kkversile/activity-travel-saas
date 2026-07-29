import { ActivityStatus, PrismaClient } from "@prisma/client";
import { BookingsService } from "../src/bookings/bookings.service";
import { PrismaService } from "../src/prisma/prisma.service";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";

(runIntegration ? describe : describe.skip)("booking capacity integration", () => {
  const prisma = new PrismaClient();
  let tenantId: string;
  let activityId: string;
  let scheduleId: string;
  const service = new BookingsService(prisma as unknown as PrismaService);

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: "Capacity Test Tenant", slug: `capacity-test-${Date.now()}` } });
    tenantId = tenant.id;
    const activity = await prisma.activity.create({
      data: {
        tenantId, name: "Capacity Test", slug: "capacity-test", summary: "test", description: "test", destination: "Test", timezone: "UTC", durationMinutes: 60, status: ActivityStatus.PUBLISHED,
        pricePlans: { create: { name: "Test", currency: "INR", adultMinor: 100, childMinor: 50, infantMinor: 0 } },
        schedules: { create: { startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), capacity: 1 } }
      }, include: { schedules: true }
    });
    activityId = activity.id;
    scheduleId = activity.schedules[0].id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.activity.delete({ where: { id: activityId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("allows only one of two simultaneous one-seat bookings", async () => {
    const makeDto = (key: string) => ({ activityId, scheduleId, customerName: key, customerEmail: `${key}@example.com`, idempotencyKey: key, passengers: [{ type: "ADULT" as const, firstName: "Test", lastName: key }] });
    const results = await Promise.allSettled([service.create(tenantId, makeDto("capacity-a")), service.create(tenantId, makeDto("capacity-b"))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const schedule = await prisma.activitySchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(schedule.bookedSeats).toBe(1);
  });
});
