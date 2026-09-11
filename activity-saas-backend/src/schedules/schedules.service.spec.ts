import { UserRole } from '@prisma/client';
import { SchedulesService } from './schedules.service';
import { ScheduleOperationalStateService } from './schedule-operational-state.service';

const user = { sub: 'actor', email: 'vendor@example.com', role: UserRole.VENDOR, tenantId: 'tenant-1' };

describe('SchedulesService Phase 4.1 guards', () => {
  it('loads the owned variant before validating omitted slot end times', async () => {
    const order: string[] = [];
    const tx: any = {
      productVariant: { findFirst: jest.fn(async () => { order.push('variant'); return { id: 'variant-1', durationMinutes: 60 }; }) },
      scheduleTemplate: { create: jest.fn(async (args) => { order.push('schedule'); return { id: 'schedule-1', ...args.data }; }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit: any = { write: jest.fn() }; const outbox: any = { enqueue: jest.fn() }; const materializer: any = {};
    const operational: any = { exceptionKey: jest.fn(), setException: jest.fn() };
    const service = new SchedulesService(prisma, audit, outbox, materializer, operational);
    const result = await service.create(user, 'variant-1', { scheduleCode: 'NEW', name: 'New', operatingModel: 'FIXED_SLOT', timezone: 'Asia/Kolkata', effectiveFrom: '2026-01-01', operatingDays: ['MONDAY'], capacityUnit: 'PERSON', slots: [{ slotCode: '09:00', startTime: '09:00' }] } as any);
    expect(result.id).toBe('schedule-1'); expect(order).toEqual(['variant', 'schedule']); expect(audit.write).toHaveBeenCalled(); expect(outbox.enqueue).toHaveBeenCalled();
  });

  it('rejects structural changes while ACTIVE', async () => {
    const service = new SchedulesService({} as any, {} as any, {} as any, {} as any, {} as any);
    (service as any).ownedSchedule = jest.fn(async () => ({ status: 'ACTIVE', version: 4, effectiveFrom: new Date('2026-01-01'), effectiveTo: null }));
    await expect(service.update(user, 'schedule-1', { expectedVersion: 4, capacityUnit: 'BOOKING' } as any)).rejects.toThrow('Deactivate an ACTIVE schedule');
  });

  it('reconciles matching sessions but never reopens archived sessions', async () => {
    const service = new SchedulesService({} as any, {} as any, {} as any, {} as any, {} as any);
    const update = jest.fn();
    const tx: any = { scheduleException: { findMany: jest.fn(async () => [{ slotTemplateId: null, type: 'BLACKOUT' }]) }, serviceSession: { findMany: jest.fn(async () => [{ id: 'open', status: 'OPEN', slotTemplateId: 'slot' }, { id: 'archived', status: 'ARCHIVED', slotTemplateId: 'slot' }]), update } };
    await new ScheduleOperationalStateService().reconcileSessions(tx, 'schedule-1', new Date('2026-01-01'), 'slot');
    expect(update).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledWith({ where: { id: 'open' }, data: { status: 'BLACKOUT', version: { increment: 1 } } });
  });
});
