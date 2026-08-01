import { PrismaClient } from "@prisma/client";
import { CategoriesService } from "../src/modules/categories/categories.service";
import { DestinationsService } from "../src/modules/destinations/destinations.service";
import { PrismaService } from "../src/prisma/prisma.service";

const runIntegration = process.env.RUN_DB_INTEGRATION === "1";
(runIntegration ? describe : describe.skip)("tenant isolation integration", () => {
  const prisma = new PrismaClient();
  const service = new CategoriesService(prisma as unknown as PrismaService);
  const destinations = new DestinationsService(prisma as unknown as PrismaService);
  let tenantA: string; let tenantB: string; let categoryA: string; let destinationA: string;
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.tenant.create({ data: { name: "Isolation A", slug: `isolation-a-${Date.now()}` } }),
      prisma.tenant.create({ data: { name: "Isolation B", slug: `isolation-b-${Date.now()}` } })
    ]);
    tenantA = a.id; tenantB = b.id;
    const category = await prisma.category.create({ data: { tenantId: tenantA, name: "Private A", slug: `private-a-${Date.now()}` } });
    categoryA = category.id;
    const destination = await destinations.create(tenantA, { country: "India", city: "Private City", latitude: "17.385044", longitude: "78.486671" });
    destinationA = destination.id;
  });
  afterAll(async () => { await prisma.category.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }); await prisma.destination.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } }); await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }); await prisma.$disconnect(); });
  it("cannot list or fetch another tenant's category", async () => {
    const list = await service.list(tenantB, { page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });
    expect(list.data).toHaveLength(0);
    await expect(service.get(tenantB, categoryA)).rejects.toThrow("Category not found");
  });

  it("cannot list or fetch another tenant's destination and preserves coordinates on update", async () => {
    const list = await destinations.list(tenantB, { page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });
    expect(list.data).toHaveLength(0);
    await expect(destinations.get(tenantB, destinationA)).rejects.toThrow("Destination not found");
    const updated = await destinations.update(tenantA, destinationA, { country: "India", city: "Private City Updated", latitude: "17.400000", longitude: "78.500000" });
    expect(updated.latitude).toBeCloseTo(17.4);
    expect(updated.longitude).toBeCloseTo(78.5);
  });
});
