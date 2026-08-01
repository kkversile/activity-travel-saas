const { randomBytes, scrypt: nodeScrypt } = require("node:crypto");
const { promisify } = require("node:util");
const { PrismaClient, ActivityStatus, UserRole } = require("@prisma/client");

const scrypt = promisify(nodeScrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.upsert({ where: { slug: "demo-adventures" }, update: {}, create: { name: "Demo Adventures", slug: "demo-adventures", currency: "INR", timezone: "Asia/Kolkata" } });
    const passwordHash = await hashPassword("actdemo123!");
    const user = await prisma.user.upsert({ where: { email: "admin@demo.travel" }, update: { tenantId: tenant.id, passwordHash, isActive: true }, create: { tenantId: tenant.id, email: "admin@demo.travel", displayName: "Demo Admin", role: UserRole.PARTNER_ADMIN, passwordHash } });
    await prisma.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { role: UserRole.PARTNER_ADMIN }, create: { tenantId: tenant.id, userId: user.id, role: UserRole.PARTNER_ADMIN } });
    const category = await prisma.category.upsert({ where: { tenantId_slug: { tenantId: tenant.id, slug: "heritage" } }, update: { name: "Heritage & Culture" }, create: { tenantId: tenant.id, name: "Heritage & Culture", slug: "heritage" } });
    const destination = await prisma.destination.upsert({ where: { tenantId_slug: { tenantId: tenant.id, slug: "hyderabad" } }, update: { name: "Hyderabad", timezone: "Asia/Kolkata" }, create: { tenantId: tenant.id, name: "Hyderabad", slug: "hyderabad", timezone: "Asia/Kolkata" } });
    const activity = await prisma.activity.upsert({ where: { tenantId_slug: { tenantId: tenant.id, slug: "hyderabad-heritage-walk" } }, update: {}, create: { tenantId: tenant.id, name: "Hyderabad Heritage Walk", slug: "hyderabad-heritage-walk", summary: "A guided walk through Hyderabad's historic old city.", description: "Explore the old city, traditional markets and local history with a trained guide.", destination: "Hyderabad", categoryId: category.id, destinationId: destination.id, timezone: "Asia/Kolkata", durationMinutes: 180, status: ActivityStatus.PUBLISHED, pricePlans: { create: { tenantId: tenant.id, name: "Standard", currency: "INR", adultMinor: 150000, childMinor: 90000, infantMinor: 0 } }, schedules: { create: { tenantId: tenant.id, startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 27 * 60 * 60000), capacity: 20 } } } });
    console.log(JSON.stringify({ status: "seeded", tenantId: tenant.id, userId: user.id, activityId: activity.id }));
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
