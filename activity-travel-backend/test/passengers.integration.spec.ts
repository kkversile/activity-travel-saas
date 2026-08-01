import { ActivityStatus, PassengerType, PrismaClient } from "@prisma/client";
import { PassengersService } from "../src/modules/passengers/passengers.service";
import { PrismaService } from "../src/prisma/prisma.service";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";
(runIntegration ? describe : describe.skip)("passengers integration", () => {
  const prisma = new PrismaClient();
  const service = new PassengersService(prisma as unknown as PrismaService);
  let tenantId: string; let otherTenantId: string; let bookingId: string; let passengerId: string;

  beforeAll(async () => {
    const [tenant, other] = await Promise.all([
      prisma.tenant.create({ data: { name: "Passenger Tenant", slug: `passenger-${Date.now()}` } }),
      prisma.tenant.create({ data: { name: "Other Passenger Tenant", slug: `passenger-other-${Date.now()}` } })
    ]);
    tenantId = tenant.id; otherTenantId = other.id;
    const activity = await prisma.activity.create({ data: { tenantId, name: "Passenger Activity", slug: `passenger-activity-${Date.now()}`, summary: "Test", description: "Test", destination: "Test", timezone: "UTC", durationMinutes: 60, status: ActivityStatus.PUBLISHED } });
    const schedule = await prisma.activitySchedule.create({ data: { tenantId, activityId: activity.id, startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), capacity: 10 } });
    const booking = await prisma.booking.create({ data: { tenantId, reference: `PASS-${Date.now()}`, activityId: activity.id, scheduleId: schedule.id, customerName: "Passenger Customer", customerEmail: "passenger@example.test", status: "HOLD", currency: "INR", subtotalMinor: 100, taxMinor: 0, discountMinor: 0, totalMinor: 100, idempotencyKey: `passenger-${Date.now()}` } });
    bookingId = booking.id;
  });

  afterAll(async () => { await prisma.passenger.deleteMany({ where: { booking: { tenantId: { in: [tenantId, otherTenantId] } } } }); await prisma.booking.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }); await prisma.activitySchedule.deleteMany({ where: { activity: { tenantId: { in: [tenantId, otherTenantId] } } } }); await prisma.activity.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }); await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }); await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } }); await prisma.$disconnect(); });

  it("rejects cross-tenant booking references and supports paginated CRUD", async () => {
    await expect(service.create(otherTenantId, { bookingId, type: PassengerType.ADULT, firstName: "No", lastName: "Access" })).rejects.toThrow("Booking not found");
    const created = await service.create(tenantId, { bookingId, type: PassengerType.ADULT, firstName: "Zed", lastName: "Passenger", age: 32 });
    passengerId = created.id;
    const listed = await service.list(tenantId, { page: 1, pageSize: 1, search: "Passenger", sortBy: "lastName", sortOrder: "asc" });
    expect(listed.data).toHaveLength(1); expect(listed.meta.totalItems).toBe(1); expect(listed.data[0].id).toBe(passengerId);
    await expect(service.get(otherTenantId, passengerId)).rejects.toThrow("Passenger not found");
    const updated = await service.update(tenantId, passengerId, { firstName: "Updated", type: PassengerType.CHILD });
    expect(updated.firstName).toBe("Updated"); expect(updated.type).toBe(PassengerType.CHILD);
    expect((await service.remove(tenantId, passengerId)).success).toBe(true);
    await expect(service.get(tenantId, passengerId)).rejects.toThrow("Passenger not found");
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED" } });
    const protectedPassenger = await service.create(tenantId, { bookingId, type: PassengerType.ADULT, firstName: "Protected", lastName: "Passenger" });
    await expect(service.remove(tenantId, protectedPassenger.id)).rejects.toThrow("cannot be deleted");
  });
});
