import { ConflictException, Injectable } from '@nestjs/common';
import { ScheduleExceptionType } from '@prisma/client';
import { dateKey, isoDate } from './schedule-utils';

@Injectable()
export class ScheduleOperationalStateService {
  exceptionKey(scheduleTemplateId: string, serviceDate: Date | string, slotTemplateId?: string | null) {
    return `${scheduleTemplateId}:${dateKey(serviceDate)}:${slotTemplateId ?? 'ALL'}`;
  }

  async setException(tx: any, input: { scheduleTemplateId: string; serviceDate: Date | string; slotTemplateId?: string | null; type: ScheduleExceptionType; reason: string }) {
    const serviceDate = isoDate(input.serviceDate);
    const exceptionKey = this.exceptionKey(input.scheduleTemplateId, serviceDate, input.slotTemplateId);
    const exception = await tx.scheduleException.upsert({
      where: { exceptionKey },
      update: { type: input.type, reason: input.reason.trim(), archivedAt: null },
      create: { scheduleTemplateId: input.scheduleTemplateId, serviceDate, slotTemplateId: input.slotTemplateId ?? null, type: input.type, reason: input.reason.trim(), exceptionKey },
    });
    await this.reconcileSessions(tx, input.scheduleTemplateId, serviceDate, input.slotTemplateId);
    return exception;
  }

  async clearException(tx: any, input: { scheduleTemplateId: string; serviceDate: Date | string; slotTemplateId?: string | null; fullScope: boolean }) {
    const serviceDate = isoDate(input.serviceDate);
    const exact = input.slotTemplateId ? await tx.scheduleException.findFirst({ where: { scheduleTemplateId: input.scheduleTemplateId, serviceDate, slotTemplateId: input.slotTemplateId, archivedAt: null } }) : null;
    if (exact) {
      await tx.scheduleException.update({ where: { id: exact.id }, data: { archivedAt: new Date() } });
      await this.reconcileSessions(tx, input.scheduleTemplateId, serviceDate, input.slotTemplateId);
      return exact;
    }
    const global = await tx.scheduleException.findFirst({ where: { scheduleTemplateId: input.scheduleTemplateId, serviceDate, slotTemplateId: null, archivedAt: null } });
    if (global && !input.fullScope) throw new ConflictException('GLOBAL_EXCEPTION_REQUIRES_FULL_SCOPE');
    if (global) await tx.scheduleException.update({ where: { id: global.id }, data: { archivedAt: new Date() } });
    await this.reconcileSessions(tx, input.scheduleTemplateId, serviceDate);
    return global;
  }

  async reconcileSessions(tx: any, scheduleTemplateId: string, serviceDate: Date | string, slotTemplateId?: string | null) {
    const date = isoDate(serviceDate);
    const [exceptions, sessions] = await Promise.all([
      tx.scheduleException.findMany({ where: { scheduleTemplateId, serviceDate: date, archivedAt: null } }),
      tx.serviceSession.findMany({ where: { scheduleTemplateId, serviceDate: date, ...(slotTemplateId ? { slotTemplateId } : {}) } }),
    ]);
    for (const session of sessions) {
      if (session.status === 'ARCHIVED') continue;
      const exact = exceptions.find((item: any) => item.slotTemplateId && item.slotTemplateId === session.slotTemplateId);
      const global = exceptions.find((item: any) => item.slotTemplateId == null);
      const desired = (exact ?? global)?.type ?? 'OPEN';
      if (session.status !== desired) await tx.serviceSession.update({ where: { id: session.id }, data: { status: desired, version: { increment: 1 } } });
    }
    return sessions;
  }
}
