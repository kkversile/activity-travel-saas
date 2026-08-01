import { ActivityStatus, PrismaClient } from "@prisma/client";
import { BookingsService } from "../src/bookings/bookings.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { AgentsService } from "../src/modules/agents/agents.service";
import { SuppliersService } from "../src/modules/suppliers/suppliers.service";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";

(runIntegration ? describe : describe.skip)("partner commercial integration", () => {
  const prisma = new PrismaClient();
  const suppliers = new SuppliersService(prisma as unknown as PrismaService);
  const agents = new AgentsService(prisma as unknown as PrismaService);
  const bookings = new BookingsService(prisma as unknown as PrismaService);
  let tenantId: string;
  let otherTenantId: string;
  let supplierId: string;
  let agentId: string;
  let activityId: string;
  let scheduleId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: "Partner Integration", slug: `partner-integration-${Date.now()}` } });
    const otherTenant = await prisma.tenant.create({ data: { name: "Other Partner Tenant", slug: `other-partner-${Date.now()}` } });
    tenantId = tenant.id;
    otherTenantId = otherTenant.id;
    const supplier = await prisma.supplier.create({ data: { tenantId, company: "Integration Supplier", contactPerson: "Supplier Contact", email: "supplier-integration@example.test" } });
    const agent = await prisma.agent.create({ data: { tenantId, company: "Integration Agent", contactPerson: "Agent Contact", email: "agent-integration@example.test", commissionPercent: 10 } });
    supplierId = supplier.id;
    agentId = agent.id;
    const activity = await prisma.activity.create({ data: { tenantId, name: "Partner Activity", slug: "partner-activity", summary: "integration", description: "integration", destination: "Test", timezone: "UTC", durationMinutes: 60, status: ActivityStatus.PUBLISHED, pricePlans: { create: { tenantId, name: "Partner price", currency: "INR", adultMinor: 1000, childMinor: 500, infantMinor: 0 } }, schedules: { create: { tenantId, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), capacity: 10 } } }, include: { schedules: true } });
    activityId = activity.id;
    scheduleId = activity.schedules[0].id;
    await suppliers.assignActivity(tenantId, supplierId, { activityId, costMinor: 400, commissionPercent: 5 });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.activity.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId } });
    await prisma.agent.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it("links a supplier to an activity and exposes partner booking aggregates", async () => {
    const booking = await bookings.create(tenantId, { activityId, scheduleId, supplierId, agentId, source: "AGENT", customerName: "Partner Customer", customerEmail: "partner-customer@example.test", idempotencyKey: `partner-booking-${Date.now()}`, passengers: [{ type: "ADULT", firstName: "Partner", lastName: "Customer" }] });
    await bookings.confirm(tenantId, booking.id);
    const supplierList = await suppliers.list(tenantId, { page: 1, pageSize: 25, sortBy: "company", sortOrder: "asc" });
    const agentList = await agents.list(tenantId, { page: 1, pageSize: 25, sortBy: "company", sortOrder: "asc" });
    expect(supplierList.data[0]._count.activities).toBe(1);
    expect(supplierList.data[0]._count.bookings).toBe(1);
    expect(agentList.data[0]._count.bookings).toBe(1);
    expect(agentList.data[0].revenueMinor).toBe(1000);
    const filtered = await bookings.list(tenantId, { page: 1, pageSize: 25, agentId, supplierId, source: "AGENT", sortBy: "createdAt", sortOrder: "desc" });
    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0].agent?.id).toBe(agentId);
    expect(filtered.data[0].supplier?.id).toBe(supplierId);
  });

  it("rejects cross-tenant supplier activity assignment", async () => {
    const foreignActivity = await prisma.activity.create({ data: { tenantId: otherTenantId, name: "Foreign Activity", slug: "foreign-activity", summary: "foreign", description: "foreign", destination: "Other", timezone: "UTC", durationMinutes: 60 } });
    await expect(suppliers.assignActivity(tenantId, supplierId, { activityId: foreignActivity.id, costMinor: 1, commissionPercent: 1 })).rejects.toThrow("Activity not found for tenant");
    await prisma.activity.delete({ where: { id: foreignActivity.id } });
  });
});
