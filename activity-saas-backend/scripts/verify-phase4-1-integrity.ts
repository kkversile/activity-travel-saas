import { PrismaClient } from '@prisma/client';
import { InventoryReservationService } from '../src/inventory/inventory-reservation.service';

const prisma = new PrismaClient();
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(`FAIL: ${message}`); };

async function concurrencyCase() {
  const variant = await prisma.productVariant.findFirstOrThrow();
  const schedule = await prisma.scheduleTemplate.create({ data: { variantId: variant.id, scheduleCode: `PH41-${Date.now()}`, name: 'Phase 4.1 concurrency verification schedule', status: 'ACTIVE', operatingModel: 'ALL_DAY', timezone: 'Asia/Kolkata', effectiveFrom: new Date('2099-01-01T00:00:00.000Z'), operatingDays: ['FRIDAY'], capacityUnit: 'PERSON', capacityUnitReviewRequired: false, defaultCapacity: 1 } });
  const session = await prisma.serviceSession.create({ data: { scheduleTemplateId: schedule!.id, serviceDate: new Date('2099-01-01T00:00:00.000Z'), sessionKey: `PH41-${Date.now()}`, status: 'OPEN', sourcePayload: { verification: 'phase4.1' } } });
  const state = await prisma.inventoryState.create({ data: { sessionId: session.id, totalCapacity: 1 } });
  const audit = { write: async () => undefined } as any;
  const outbox = { enqueue: async () => undefined } as any;
  const ready = { resourceReadiness: async () => ({ ready: true, reasonCodes: [] }) } as any;
  const service = new InventoryReservationService(prisma as any, audit, outbox, ready);
  try {
    const results = await Promise.allSettled([
      service.createHold({ sessionId: session.id, quantity: 1, referenceKey: 'PH41-RACE-A' }),
      service.createHold({ sessionId: session.id, quantity: 1, referenceKey: 'PH41-RACE-B' }),
    ]);
    assert(results.filter((result) => result.status === 'fulfilled').length === 1, 'row locking allows exactly one hold at capacity one');
    const hold = await prisma.inventoryHold.findFirstOrThrow({ where: { inventoryStateId: state.id, status: 'ACTIVE' } });
    const blocked = new InventoryReservationService(prisma as any, audit, outbox, { resourceReadiness: async () => ({ ready: false, reasonCodes: ['RESOURCE_REQUIREMENT_UNASSIGNED'] }) } as any);
    await expectReject(() => blocked.convertHoldToConfirmed(hold.id), 'RESOURCE_NOT_READY');
    const stillActive = await prisma.inventoryHold.findUniqueOrThrow({ where: { id: hold.id } });
    assert(stillActive.status === 'ACTIVE', 'failed conversion leaves the hold active');
  } finally {
    await prisma.inventoryAllocation.deleteMany({ where: { inventoryStateId: state.id } });
    await prisma.inventoryHold.deleteMany({ where: { inventoryStateId: state.id } });
    await prisma.inventoryState.delete({ where: { id: state.id } });
    await prisma.serviceSession.delete({ where: { id: session.id } });
    await prisma.scheduleTemplate.delete({ where: { id: schedule.id } });
  }
}

async function expectReject(fn: () => Promise<unknown>, code: string) {
  let rejected = false;
  try { await fn(); } catch (error) { rejected = true; assert(String((error as Error).message).includes(code), `error is ${code}`); }
  assert(rejected, `expected ${code}`);
}

async function integrityCase() {
  const negative = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS count FROM "InventoryState" WHERE "totalCapacity" < 0 OR "blockedCapacity" < 0 OR "heldCapacity" < 0 OR "confirmedCapacity" < 0`);
  const violations = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS count FROM "InventoryState" WHERE "totalCapacity" < "blockedCapacity" + "heldCapacity" + "confirmedCapacity"`);
  const duplicateScopes = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS count FROM (SELECT "scheduleTemplateId", "serviceDate", "slotTemplateId" FROM "ScheduleException" WHERE "archivedAt" IS NULL GROUP BY 1,2,3 HAVING count(*) > 1) x`);
  const crossScheduleSlots = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS count FROM "ScheduleException" e JOIN "ScheduleSlotTemplate" s ON s."id" = e."slotTemplateId" WHERE e."slotTemplateId" IS NOT NULL AND e."scheduleTemplateId" <> s."scheduleTemplateId"`);
  const invalidResources = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS count FROM "ScheduleResourceRequirement" r LEFT JOIN "Resource" x ON x."id" = r."specificResourceId" WHERE r."specificResourceId" IS NOT NULL AND (x."id" IS NULL OR x."tenantId" <> (SELECT p."tenantId" FROM "ScheduleTemplate" st JOIN "ProductVariant" v ON v."id" = st."variantId" JOIN "Product" p ON p."id" = v."productId" WHERE st."id" = r."scheduleTemplateId") OR x."type" <> r."resourceType" OR x."active" = false OR x."archivedAt" IS NOT NULL)`);
  const duplicateAssignments = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS count FROM (SELECT "sessionId", "resourceId" FROM "SessionResourceAllocation" WHERE "status" = 'ACTIVE' GROUP BY 1,2 HAVING count(*) > 1) x`);
  const [sessions, plans, bookings, reviewRequired, confirmed] = await Promise.all([
    prisma.serviceSession.count(), prisma.ratePlan.count(), prisma.booking.count(), prisma.scheduleTemplate.count({ where: { capacityUnitReviewRequired: true } }), prisma.scheduleTemplate.count({ where: { capacityUnitReviewRequired: false } }),
  ]);
  assert(Number(negative[0].count) === 0, 'no negative inventory counters'); assert(Number(violations[0].count) === 0, 'no capacity violations'); assert(Number(duplicateScopes[0].count) === 0, 'no duplicate active exception scopes'); assert(Number(crossScheduleSlots[0].count) === 0, 'no cross-schedule exception slots'); assert(Number(invalidResources[0].count) === 0, 'no invalid specific resources'); assert(Number(duplicateAssignments[0].count) === 0, 'no duplicate active resource assignment identities'); assert(sessions === 110, `all 110 sessions preserved (found ${sessions})`); assert(plans === 40, `all 40 rate plans preserved (found ${plans})`); assert(bookings === 5, `all 5 bookings preserved (found ${bookings})`); assert(reviewRequired > 0, 'legacy schedules are review-gated'); assert(confirmed >= 0, 'capacity-unit confirmation state is queryable');
  console.log(JSON.stringify({ pass: true, sessions, plans, bookings, reviewRequired, confirmed, negative: Number(negative[0].count), capacityViolations: Number(violations[0].count), duplicateExceptionScopes: Number(duplicateScopes[0].count), crossScheduleSlots: Number(crossScheduleSlots[0].count), invalidSpecificResources: Number(invalidResources[0].count), duplicateActiveAssignments: Number(duplicateAssignments[0].count) }, null, 2));
}

async function main() { await integrityCase(); await concurrencyCase(); console.log('Phase 4.1 concurrency cases passed: concurrent hold capacity and conversion readiness rollback.'); }
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
