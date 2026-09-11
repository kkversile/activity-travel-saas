import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OperatingModel, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, dateKey, dayName, isoDate, validateTimezone, zonedTimeToUtc } from './schedule-utils';
import { MaterializeSessionsDto } from './schedules.dto';

@Injectable()
export class SessionMaterializerService {
  constructor(private readonly prisma: PrismaService) {}

  async materialize(scheduleTemplateId: string, dto: MaterializeSessionsDto) {
    const from = isoDate(dto.dateFrom); const to = isoDate(dto.dateTo); const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    if (days < 1 || days > 366) throw new BadRequestException('Materialization range must be 1-366 days');
    return this.prisma.$transaction(async (tx) => { if ((tx as any).$executeRawUnsafe) await (tx as any).$executeRawUnsafe('SET LOCAL search_path TO public');
      const rows = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "ScheduleTemplate" WHERE "id" = $1 FOR UPDATE`, scheduleTemplateId); if (!rows[0]) throw new NotFoundException('Schedule not found'); if (Number(rows[0].version) !== dto.expectedVersion) throw new ConflictException('Schedule changed; reload and retry.');
      const schedule = await tx.scheduleTemplate.findUnique({ where: { id: scheduleTemplateId }, include: { variant: true, slotTemplates: { where: { active: true, archivedAt: null }, orderBy: { rank: 'asc' } }, exceptions: { where: { archivedAt: null, serviceDate: { gte: from, lte: to } } } } }); if (!schedule) throw new NotFoundException('Schedule not found');
      if (schedule.status !== 'ACTIVE') throw new ConflictException('Only ACTIVE schedules can be materialized'); if (!schedule.operatingModel) throw new ConflictException('Schedule operating model is missing'); validateTimezone(schedule.timezone);
      const exceptionMap = new Map(schedule.exceptions.map((exception) => [`${dateKey(exception.serviceDate)}|${exception.slotTemplateId ?? '*'}`, exception])); const sessionIds: string[] = [];
      for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
        if (cursor < schedule.effectiveFrom || (schedule.effectiveTo && cursor > schedule.effectiveTo) || (schedule.operatingDays.length && !schedule.operatingDays.includes(dayName(cursor)))) continue;
        const timed = schedule.operatingModel === OperatingModel.FIXED_SLOT || schedule.operatingModel === OperatingModel.MULTIPLE_SLOTS; const slots = timed ? schedule.slotTemplates : [null];
        for (const slot of slots) {
          const exception = exceptionMap.get(`${dateKey(cursor)}|${slot?.id ?? '*'}`) ?? exceptionMap.get(`${dateKey(cursor)}|*`); const localStartTime = slot?.startTime ?? null; let localEndTime = slot?.endTime ?? null;
          if (localStartTime && !localEndTime && schedule.variant.durationMinutes != null) { const minutes = Number(localStartTime.slice(0, 2)) * 60 + Number(localStartTime.slice(3)) + schedule.variant.durationMinutes; localEndTime = `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
          const startsAt = localStartTime ? zonedTimeToUtc(cursor, localStartTime, schedule.timezone) : null; let endsAt = localEndTime ? zonedTimeToUtc(cursor, localEndTime, schedule.timezone) : null; if (startsAt && endsAt && endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86400000); if (localStartTime && !endsAt) throw new ConflictException('SESSION_DURATION_MISSING');
          const sessionKey = slot?.slotCode ?? 'DATE'; const existing = await tx.serviceSession.findUnique({ where: { scheduleTemplateId_serviceDate_sessionKey: { scheduleTemplateId, serviceDate: cursor, sessionKey } }, include: { inventoryState: true } }); const desired = (exception?.type as SessionStatus | undefined) ?? SessionStatus.OPEN;
          if (existing?.status === SessionStatus.ARCHIVED) { sessionIds.push(existing.id); continue; }
          if (existing) {
            const structureChanged = existing.slotTemplateId !== (slot?.id ?? null) || existing.localStartTime !== localStartTime || existing.localEndTime !== localEndTime || existing.startsAt?.getTime() !== startsAt?.getTime() || existing.endsAt?.getTime() !== endsAt?.getTime();
            if (structureChanged && existing.inventoryState) { const [hold, allocation] = await Promise.all([tx.inventoryHold.findFirst({ where: { inventoryStateId: existing.inventoryState.id } }), tx.inventoryAllocation.findFirst({ where: { inventoryStateId: existing.inventoryState.id } })]); if (hold || allocation) throw new ConflictException('SESSION_STRUCTURE_LOCKED'); }
            await tx.serviceSession.update({ where: { id: existing.id }, data: { ...(structureChanged ? { slotTemplateId: slot?.id, localStartTime, localEndTime, startsAt, endsAt } : {}), ...(existing.status !== desired ? { status: desired } : {}), ...((structureChanged || existing.status !== desired) ? { version: { increment: 1 } } : {}) } });
            if (schedule.defaultCapacity != null) await tx.inventoryState.upsert({ where: { sessionId: existing.id }, update: {}, create: { sessionId: existing.id, totalCapacity: schedule.defaultCapacity, sourcePayload: { createdFromSchedule: schedule.id } } }); sessionIds.push(existing.id);
          } else {
            const session = await tx.serviceSession.create({ data: { scheduleTemplateId, slotTemplateId: slot?.id, serviceDate: cursor, sessionKey, localStartTime, localEndTime, startsAt, endsAt, status: desired, sourcePayload: { materializedBy: 'phase4.1' } } }); if (schedule.defaultCapacity != null) await tx.inventoryState.create({ data: { sessionId: session.id, totalCapacity: schedule.defaultCapacity, sourcePayload: { createdFromSchedule: schedule.id } } }); sessionIds.push(session.id);
          }
        }
      }
      await tx.scheduleTemplate.updateMany({ where: { id: scheduleTemplateId, version: dto.expectedVersion }, data: { version: { increment: 1 } } });
      return { scheduleTemplateId, from: dateKey(from), to: dateKey(to), sessions: sessionIds.length, sessionIds };
    });
  }
}
