import { BookingRecordType, PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.booking.findMany({ select: { id: true, bookingCode: true, vendorTenantId: true, recordType: true, agentTenantId: true, sessionId: true } });
    await prisma.booking.updateMany({ where: { recordType: { not: BookingRecordType.CANONICAL } }, data: { recordType: BookingRecordType.LEGACY } });
    const after = await prisma.booking.findMany({ select: { id: true, bookingCode: true, vendorTenantId: true, recordType: true, agentTenantId: true, sessionId: true } });
    const legacy = after.filter((row) => row.recordType === BookingRecordType.LEGACY);
    const violations = legacy.filter((row) => row.agentTenantId || row.sessionId).map((row) => row.bookingCode);
    if (violations.length) throw new Error(`Legacy rows gained canonical ownership/session data: ${violations.join(', ')}`);
    console.log(JSON.stringify({ updated: before.filter((row) => row.recordType !== BookingRecordType.LEGACY).length, totalBookings: after.length, legacyBookings: legacy.length, legacy: legacy.map(({ id, bookingCode, vendorTenantId }) => ({ id, bookingCode, vendorTenantId })), violations }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
