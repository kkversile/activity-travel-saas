import { ActivityStatus, PrismaClient } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { BookingsService } from "../src/bookings/bookings.service";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { RefundsService } from "../src/modules/refunds/refunds.service";
import { InvoicesService } from "../src/modules/invoices/invoices.service";
import { ReportsService } from "../src/modules/reports/reports.service";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";

(runIntegration ? describe : describe.skip)("finance and reports integration", () => {
  const prisma = new PrismaClient();
  const db = prisma as unknown as PrismaService;
  const bookings = new BookingsService(db);
  const payments = new PaymentsService(db);
  const refunds = new RefundsService(db);
  const invoices = new InvoicesService(db);
  const reports = new ReportsService(db);
  let tenantId: string;
  let otherTenantId: string;
  let activityId: string;
  let bookingId: string;
  let paymentId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: "Finance Integration Tenant", slug: `finance-${Date.now()}` } });
    const otherTenant = await prisma.tenant.create({ data: { name: "Finance Other Tenant", slug: `finance-other-${Date.now()}` } });
    tenantId = tenant.id;
    otherTenantId = otherTenant.id;
    const activity = await prisma.activity.create({
      data: {
        tenantId,
        name: "Finance Integration Activity",
        slug: `finance-activity-${Date.now()}`,
        summary: "finance integration",
        description: "finance integration",
        destination: "Test",
        timezone: "UTC",
        durationMinutes: 60,
        status: ActivityStatus.PUBLISHED,
        pricePlans: { create: { tenantId, name: "Integration price", currency: "INR", adultMinor: 1000, childMinor: 500, infantMinor: 0 } },
        schedules: { create: { tenantId, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), capacity: 3 } }
      },
      include: { schedules: true }
    });
    activityId = activity.id;
    const booking = await bookings.create(tenantId, { activityId, scheduleId: activity.schedules[0].id, customerName: "Finance Guest", customerEmail: `finance-${Date.now()}@example.test`, idempotencyKey: `finance-booking-${Date.now()}`, passengers: [{ type: "ADULT", firstName: "Finance", lastName: "Guest" }] });
    bookingId = booking.id;
  });

  afterAll(async () => {
    await prisma.refund.deleteMany({ where: { tenantId } });
    await prisma.paymentWebhookEvent.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.activity.deleteMany({ where: { id: activityId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it("enforces payment transitions, partial refunds and invoice issuing", async () => {
    const pending = await payments.create(tenantId, { bookingId, amountMinor: 600, currency: "INR", method: "MOCK", idempotencyKey: `finance-payment-${Date.now()}` });
    paymentId = pending.id;
    expect(pending.status).toBe("PENDING");
    const captured = await payments.capture(tenantId, paymentId);
    expect(captured.status).toBe("CAPTURED");
    const refund = await refunds.create(tenantId, { paymentId, amountMinor: 200, reason: "Partial cancellation" });
    expect((await refunds.approve(tenantId, refund.id)).status).toBe("APPROVED");
    expect((await refunds.process(tenantId, refund.id)).status).toBe("PROCESSED");
    expect((await payments.get(tenantId, paymentId)).status).toBe("CAPTURED");
    const invoice = await invoices.create(tenantId, { bookingId, invoiceNumber: `FIN-${Date.now()}`, subtotalMinor: 1000, taxMinor: 100, totalMinor: 1100, currency: "INR" });
    expect((await invoices.issue(tenantId, invoice.id)).status).toBe("ISSUED");
  });

  it("enforces tenant scope and report filters/exports", async () => {
    await expect(payments.get(otherTenantId, paymentId)).rejects.toThrow("Payment not found");
    const filtered = await reports.bookings(tenantId, { page: 1, pageSize: 25, status: "CONFIRMED", activityId });
    expect(filtered.data).toHaveLength(1);
    const csv = await reports.exportCsv(tenantId, "bookings", { status: "CONFIRMED", activityId });
    expect(csv).toContain("reference");
    const revenueCsv = await reports.exportCsv(tenantId, "revenue", {});
    expect(revenueCsv).toContain("revenueMinor");
  });
});
