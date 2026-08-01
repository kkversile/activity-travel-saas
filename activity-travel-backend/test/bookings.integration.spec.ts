import { ActivityStatus, PrismaClient } from "@prisma/client";
import { BookingsService } from "../src/bookings/bookings.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { PaymentsService } from "../src/modules/payments/payments.service";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";

(runIntegration ? describe : describe.skip)("booking capacity integration", () => {
  const prisma = new PrismaClient();
  let tenantId: string;
  let foreignTenantId: string;
  let foreignActivityId: string;
  let foreignScheduleId: string;
  let activityId: string;
  let scheduleId: string;
  const service = new BookingsService(prisma as unknown as PrismaService);
  const payments = new PaymentsService(prisma as unknown as PrismaService);

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: "Capacity Test Tenant", slug: `capacity-test-${Date.now()}` } });
    tenantId = tenant.id;
    const activity = await prisma.activity.create({
      data: {
        tenantId, name: "Capacity Test", slug: "capacity-test", summary: "test", description: "test", destination: "Test", timezone: "UTC", durationMinutes: 60, status: ActivityStatus.PUBLISHED,
        pricePlans: { create: { tenantId, name: "Test", currency: "INR", adultMinor: 100, childMinor: 50, infantMinor: 0 } },
        schedules: { create: { tenantId, startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), capacity: 1 } }
      }, include: { schedules: true }
    });
    activityId = activity.id;
    scheduleId = activity.schedules[0].id;
    const foreignTenant = await prisma.tenant.create({ data: { name: "Foreign Capacity Tenant", slug: `foreign-capacity-${Date.now()}` } });
    foreignTenantId = foreignTenant.id;
    const foreignActivity = await prisma.activity.create({
      data: {
        tenantId: foreignTenantId, name: "Foreign Capacity", slug: "foreign-capacity", summary: "test", description: "test", destination: "Other", timezone: "UTC", durationMinutes: 60, status: ActivityStatus.PUBLISHED,
        pricePlans: { create: { tenantId: foreignTenantId, name: "Foreign", currency: "INR", adultMinor: 100, childMinor: 50, infantMinor: 0 } },
        schedules: { create: { tenantId: foreignTenantId, startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), capacity: 2 } }
      }, include: { schedules: true }
    });
    foreignActivityId = foreignActivity.id;
    foreignScheduleId = foreignActivity.schedules[0].id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.activity.deleteMany({ where: { id: { in: [activityId, foreignActivityId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, foreignTenantId] } } });
    await prisma.$disconnect();
  });

  it("allows only one of two simultaneous one-seat bookings", async () => {
    const makeDto = (key: string) => ({ activityId, scheduleId, customerName: key, customerEmail: `${key}@example.com`, idempotencyKey: key, passengers: [{ type: "ADULT" as const, firstName: "Test", lastName: key }] });
    const results = await Promise.allSettled([service.create(tenantId, makeDto("capacity-a")), service.create(tenantId, makeDto("capacity-b"))]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const schedule = await prisma.activitySchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(schedule.bookedSeats).toBe(1);
    const successfulIndex = results.findIndex((result) => result.status === "fulfilled");
    const successful = results[successfulIndex];
    expect(successful?.status).toBe("fulfilled");
    if (successful?.status !== "fulfilled") throw new Error("Expected one booking attempt to succeed");
    const replayKey = successfulIndex === 0 ? "capacity-a" : "capacity-b";
    const replay = await service.create(tenantId, makeDto(replayKey));
    expect(replay.id).toBe(successful!.value.id);
    const paymentPayload = { bookingId: replay.id, amountMinor: replay.totalMinor, currency: replay.currency, idempotencyKey: "payment-capacity-a" };
    const payment = await payments.create(tenantId, paymentPayload);
    const paymentReplay = await payments.create(tenantId, paymentPayload);
    expect(paymentReplay.id).toBe(payment.id);
    const webhookPayload = { eventId: "mock-event-capacity-a", paymentId: payment.id, provider: "mock", status: "CAPTURED" as const };
    const webhook = await payments.handleWebhook(tenantId, webhookPayload);
    const webhookReplay = await payments.handleWebhook(tenantId, webhookPayload);
    expect(webhook.duplicate).toBe(false);
    expect(webhookReplay.duplicate).toBe(true);
    expect(webhookReplay.payment.id).toBe(payment.id);
    const cancelled = await service.cancel(tenantId, replay.id);
    expect(cancelled.status).toBe("CANCELLED");
    const released = await prisma.activitySchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(released.bookedSeats).toBe(0);
  });

  it("rejects a schedule owned by another tenant", async () => {
    const dto = { activityId: foreignActivityId, scheduleId: foreignScheduleId, customerName: "Cross Tenant", customerEmail: "cross-tenant@example.com", idempotencyKey: `cross-${Date.now()}`, passengers: [{ type: "ADULT" as const, firstName: "Cross", lastName: "Tenant" }] };
    await expect(service.create(tenantId, dto)).rejects.toThrow("Published activity or active price plan not found");
  });

  it("updates mutable booking metadata without changing reserved capacity", async () => {
    const booking = await service.create(tenantId, { activityId, scheduleId, customerName: "Editable Guest", customerEmail: `editable-${Date.now()}@example.com`, idempotencyKey: `editable-${Date.now()}`, passengers: [{ type: "ADULT" as const, firstName: "Editable", lastName: "Guest" }] });
    const before = await prisma.activitySchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    const updated = await service.update(tenantId, booking.id, { customerName: "Updated Guest", notes: "Updated by integration", source: "AGENT" });
    expect(updated.customerName).toBe("Updated Guest");
    expect(updated.notes).toBe("Updated by integration");
    expect(updated.source).toBe("AGENT");
    const after = await prisma.activitySchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(after.bookedSeats).toBe(before.bookedSeats);
  });
});
