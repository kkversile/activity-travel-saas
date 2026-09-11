import { CutoffService } from './cutoff.service';

describe('CutoffService', () => {
  const service = new CutoffService();
  const schedule = { timezone: 'Asia/Kolkata', operatingModel: 'MULTIPLE_SLOTS' as any };
  it('uses the timed session instant', () => { const result = service.evaluate({ startsAt: new Date('2026-09-20T06:00:00.000Z'), serviceDate: new Date('2026-09-20T00:00:00.000Z'), scheduleTemplate: schedule }, 120, null, new Date('2026-09-20T03:59:59.000Z')); expect(result.eligible).toBe(true); expect(result.cutoffAt?.toISOString()).toBe('2026-09-20T04:00:00.000Z'); });
  it('marks the cutoff at the exact instant and after it', () => { const exact = service.evaluate({ startsAt: new Date('2026-09-20T06:00:00.000Z'), serviceDate: new Date('2026-09-20T00:00:00.000Z'), scheduleTemplate: schedule }, 120, null, new Date('2026-09-20T04:00:00.000Z')); const after = service.evaluate({ startsAt: new Date('2026-09-20T06:00:00.000Z'), serviceDate: new Date('2026-09-20T00:00:00.000Z'), scheduleTemplate: schedule }, 120, null, new Date('2026-09-20T04:00:01.000Z')); expect(exact.eligible).toBe(false); expect(exact.code).toBe('CUTOFF_PASSED'); expect(after.eligible).toBe(false); });
  it('uses explicit local date-level cutoff', () => { const result = service.evaluate({ startsAt: null, serviceDate: new Date('2026-09-20T00:00:00.000Z'), scheduleTemplate: schedule }, 60, '10:00', new Date('2026-09-20T03:29:00.000Z')); expect(result.eligible).toBe(true); expect(result.cutoffAt?.toISOString()).toBe('2026-09-20T03:30:00.000Z'); });
  it('fails safely when a date-level reference is missing', () => { const result = service.evaluate({ startsAt: null, serviceDate: new Date('2026-09-20T00:00:00.000Z'), scheduleTemplate: schedule }, 0, null, new Date()); expect(result.eligible).toBe(false); expect(result.code).toBe('CUTOFF_REFERENCE_MISSING'); });
});
