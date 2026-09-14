export type VerifierScheduleFixture = {
  scheduleTemplateId: string;
  ratePlanScheduleId: string;
  sessionIds: string[];
};

export async function createVerifierSchedule(
  prisma: any,
  variantId: string,
  ratePlanId: string,
  prefix: string,
  count = 8,
): Promise<VerifierScheduleFixture> {
  const start = new Date();
  const startDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 2));
  const schedule = await prisma.scheduleTemplate.create({
    data: {
      variantId,
      scheduleCode: `${prefix}-schedule`,
      name: `Verifier ${prefix}`,
      status: 'ACTIVE',
      timezone: 'Asia/Kolkata',
      effectiveFrom: startDate,
      operatingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      capacityUnit: 'PERSON',
      capacityUnitReviewRequired: false,
      defaultCapacity: 10,
    },
  });
  const mapping = await prisma.ratePlanSchedule.create({
    data: { ratePlanId, scheduleTemplateId: schedule.id, active: true },
  });
  const sessionIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const serviceDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() + index));
    const session = await prisma.serviceSession.create({
      data: {
        scheduleTemplateId: schedule.id,
        serviceDate,
        sessionKey: `${prefix}-session-${index + 1}`,
        localStartTime: '08:00',
        localEndTime: '10:00',
        startsAt: new Date(serviceDate.getTime() + 2.5 * 60 * 60 * 1000),
        endsAt: new Date(serviceDate.getTime() + 4.5 * 60 * 60 * 1000),
        status: 'OPEN',
      },
    });
    await prisma.inventoryState.create({
      data: { sessionId: session.id, totalCapacity: 10, blockedCapacity: 0, heldCapacity: 0, confirmedCapacity: 0 },
    });
    sessionIds.push(session.id);
  }
  return { scheduleTemplateId: schedule.id, ratePlanScheduleId: mapping.id, sessionIds };
}

export async function cleanupVerifierSchedule(prisma: any, fixture?: VerifierScheduleFixture) {
  if (!fixture) return;
  await prisma.inventoryState.deleteMany({ where: { sessionId: { in: fixture.sessionIds } } }).catch(() => undefined);
  await prisma.serviceSession.deleteMany({ where: { id: { in: fixture.sessionIds } } }).catch(() => undefined);
  await prisma.ratePlanSchedule.delete({ where: { id: fixture.ratePlanScheduleId } }).catch(() => undefined);
  await prisma.scheduleTemplate.delete({ where: { id: fixture.scheduleTemplateId } }).catch(() => undefined);
}
