import { Injectable } from '@nestjs/common';
import { OperatingModel } from '@prisma/client';
import { zonedTimeToUtc } from '../schedules/schedule-utils';

@Injectable()
export class CutoffService {
  evaluate(session: { startsAt: Date | null; serviceDate: Date; scheduleTemplate: { timezone: string; operatingModel: OperatingModel | null } }, cutOffMinutes: number, dateLevelCutoffTime: string | null, now: Date) {
    let anchor: Date | null = session.startsAt;
    if (!anchor && dateLevelCutoffTime) anchor = zonedTimeToUtc(new Date(session.serviceDate), dateLevelCutoffTime, session.scheduleTemplate.timezone);
    if (!anchor) return { eligible: false, code: 'CUTOFF_REFERENCE_MISSING', cutoffAt: null };
    const cutoffAt = new Date(anchor.getTime() - cutOffMinutes * 60_000);
    const blocked = now >= cutoffAt;
    return { eligible: !blocked, ...(blocked ? { code: 'CUTOFF_PASSED' } : {}), cutoffAt };
  }
}
