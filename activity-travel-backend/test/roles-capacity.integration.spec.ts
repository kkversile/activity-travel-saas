import { ActivityStatus, PrismaClient } from "@prisma/client";
import { RolesService } from "../src/modules/roles/roles.service";
import { SchedulesService } from "../src/modules/schedules/schedules.service";
import { BulkGenerateScheduleDto } from "../src/modules/schedules/dto/schedule.dto";
import { UsersService } from "../src/users/users.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { BookingsService } from "../src/bookings/bookings.service";
import { CreateBookingDto } from "../src/bookings/dto/create-booking.dto";
import { BlackoutDatesService } from "../src/modules/blackout-dates/blackout-dates.service";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";

(runIntegration ? describe : describe.skip)("custom roles and capacity integration", () => {
  const prisma = new PrismaClient();
  const roles = new RolesService(prisma as unknown as PrismaService);
  const schedules = new SchedulesService(prisma as unknown as PrismaService);
  const users = new UsersService(prisma as unknown as PrismaService);
  const bookings = new BookingsService(prisma as unknown as PrismaService);
  const blackouts = new BlackoutDatesService(prisma as unknown as PrismaService);
  let tenantId: string;
  let activityId: string;
  let scheduleId: string;
  let userId: string | undefined;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: "Roles Capacity Tenant", slug: `roles-capacity-${Date.now()}` } });
    tenantId = tenant.id;
    const activity = await prisma.activity.create({
      data: { tenantId, name: "Capacity Audit Activity", slug: `capacity-audit-${Date.now()}`, summary: "test", description: "test", destination: "Test", timezone: "UTC", durationMinutes: 60, status: ActivityStatus.PUBLISHED, pricePlans: { create: { tenantId, name: "Test", currency: "INR", adultMinor: 100, childMinor: 50, infantMinor: 0 } }, schedules: { create: { tenantId, startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), capacity: 2 } } }
    , include: { schedules: true } });
    activityId = activity.id;
    scheduleId = activity.schedules[0].id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.customRole.deleteMany({ where: { tenantId } });
    await prisma.refund.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.activity.deleteMany({ where: { id: activityId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("persists tenant custom roles and archives them safely", async () => {
    const role = await roles.create(tenantId, { name: "Operations Reviewer", description: "Read-only operations access", permissions: { bookings: ["view", "export"] } });
    expect(role.tenantId).toBe(tenantId);
    expect((await roles.list(tenantId)).data.some((item) => item.id === role.id)).toBe(true);
    const updated = await roles.update(tenantId, role.id, { permissions: { bookings: ["view", "export"], schedules: ["view"] } });
    expect(updated.permissions).toEqual({ bookings: ["view", "export"], schedules: ["view"] });
    const archived = await roles.remove(tenantId, role.id);
    expect(archived.isActive).toBe(false);
    const assignedRole = await roles.create(tenantId, { name: "Assigned Operations", permissions: { roles: ["ACTIVITY_MANAGER"], global: ["view"] } });
    const user = await users.create(tenantId, { email: `assigned-${Date.now()}@example.test`, displayName: "Assigned User", password: "test-password-123", role: "ACTIVITY_MANAGER", customRoleId: assignedRole.id });
    userId = user.id;
    const membership = await prisma.tenantMembership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId, userId: user.id } } });
    expect(membership.customRoleId).toBe(assignedRole.id);
    await users.update(tenantId, user.id, { customRoleId: null });
    const clearedMembership = await prisma.tenantMembership.findUniqueOrThrow({ where: { tenantId_userId: { tenantId, userId: user.id } } });
    expect(clearedMembership.customRoleId).toBeNull();
  });

  it("audits capacity increases and rejects oversell reductions", async () => {
    const adjusted = await schedules.adjustCapacity(tenantId, undefined, scheduleId, { capacity: 4, reason: "Operator added transport capacity" });
    expect(adjusted.capacity).toBe(4);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId, entityId: scheduleId, action: "SCHEDULE_CAPACITY_ADJUSTED" }, orderBy: { createdAt: "desc" } });
    expect(audit).not.toBeNull();
    await prisma.activitySchedule.update({ where: { id: scheduleId }, data: { bookedSeats: 3 } });
    await expect(schedules.adjustCapacity(tenantId, undefined, scheduleId, { capacity: 2, reason: "Too low" })).rejects.toThrow("Capacity cannot be lower than booked seats");
  });

  it("bulk activates and deactivates only schedules in the tenant", async () => {
    await prisma.activitySchedule.update({ where: { id: scheduleId }, data: { bookedSeats: 0, isBookable: true } });
    const deactivated = await schedules.bulkStatus(tenantId, undefined, { ids: [scheduleId], isBookable: false });
    expect(deactivated).toEqual({ updated: 1, requested: 1, isBookable: false });
    expect((await prisma.activitySchedule.findUniqueOrThrow({ where: { id: scheduleId } })).isBookable).toBe(false);
    const activated = await schedules.bulkStatus(tenantId, undefined, { ids: [scheduleId], isBookable: true });
    expect(activated.updated).toBe(1);
    expect(await prisma.auditLog.count({ where: { tenantId, action: "SCHEDULES_BULK_ACTIVATED" } })).toBeGreaterThan(0);
  });

  it("previews and generates recurring schedules while skipping blackout dates", async () => {
    const start = new Date(Date.now() + 4 * 86400000); start.setUTCHours(9, 0, 0, 0);
    const blackout = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1));
    await prisma.blackoutDate.create({ data: { tenantId, activityId, date: blackout, reason: "Integration blackout" } });
    const dto: BulkGenerateScheduleDto = { activityId, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3600000).toISOString(), capacity: 10, recurrence: "DAILY", interval: 1, occurrences: 3, preview: true };
    const preview = await schedules.bulkGenerate(tenantId, undefined, dto);
    expect(preview.preview).toBe(true);
    expect(preview.candidates).toHaveLength(2);
    expect(preview.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "BLACKOUT_DATE" })]));
    const generated = await schedules.bulkGenerate(tenantId, undefined, { ...dto, preview: false });
    expect(generated.created).toHaveLength(2);
    expect(generated.created?.every((row) => row.scheduleType === "RECURRING")).toBe(true);
  });

  it("filters blackout dates by activity and rejects duplicate dates safely", async () => {
    const date = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 40));
    const created = await blackouts.create(tenantId, { activityId, date: date.toISOString(), reason: "Safe duplicate test" });
    const listed = await blackouts.list(tenantId, { activityId, from: date.toISOString(), to: date.toISOString(), page: 1, pageSize: 25, sortBy: "date", sortOrder: "asc" });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);
    await expect(blackouts.create(tenantId, { activityId, date: date.toISOString(), reason: "Duplicate" })).rejects.toThrow("already exists");
  });

  it("rejects overlapping schedule edits", async () => {
    const overlapping = await prisma.activitySchedule.create({ data: { tenantId, activityId, startsAt: new Date(Date.now() + 20 * 86400000), endsAt: new Date(Date.now() + 20 * 86400000 + 3600000), capacity: 10 } });
    await expect(schedules.update(tenantId, scheduleId, { startsAt: new Date(Date.now() + 20 * 86400000 + 1800000).toISOString(), endsAt: new Date(Date.now() + 20 * 86400000 + 5400000).toISOString() })).rejects.toThrow("overlaps");
    await prisma.activitySchedule.delete({ where: { id: overlapping.id } });
  });

  it("reports active held seats separately from confirmed seats", async () => {
    await prisma.activitySchedule.update({ where: { id: scheduleId }, data: { capacity: 2, bookedSeats: 0 } });
    const dto: CreateBookingDto = { activityId, scheduleId, customerName: "Held Guest", customerEmail: `held-${Date.now()}@example.test`, idempotencyKey: `held-${Date.now()}`, passengers: [{ type: "ADULT", firstName: "Held", lastName: "Guest" }] };
    await bookings.create(tenantId, dto);
    const result = await schedules.list(tenantId, { activityId, page: 1, pageSize: 100, sortBy: "startsAt", sortOrder: "asc" });
    const row = result.data.find((item) => item.id === scheduleId);
    expect(row).toEqual(expect.objectContaining({ heldSeats: 1, confirmedSeats: 0, availableSeats: 1 }));
  });

  it("applies availability status filters before pagination", async () => {
    await prisma.activitySchedule.update({ where: { id: scheduleId }, data: { capacity: 2, bookedSeats: 1, isBookable: true } });
    expect((await schedules.list(tenantId, { page: 1, pageSize: 25, sortBy: "startsAt", sortOrder: "asc", availabilityStatus: "AVAILABLE" })).data.some((row) => row.id === scheduleId)).toBe(true);
    await prisma.activitySchedule.update({ where: { id: scheduleId }, data: { bookedSeats: 2 } });
    expect((await schedules.list(tenantId, { page: 1, pageSize: 25, sortBy: "startsAt", sortOrder: "asc", availabilityStatus: "FULL" })).data.some((row) => row.id === scheduleId)).toBe(true);
    await prisma.activitySchedule.update({ where: { id: scheduleId }, data: { isBookable: false } });
    expect((await schedules.list(tenantId, { page: 1, pageSize: 25, sortBy: "startsAt", sortOrder: "asc", availabilityStatus: "INACTIVE" })).data.some((row) => row.id === scheduleId)).toBe(true);
  });
});
