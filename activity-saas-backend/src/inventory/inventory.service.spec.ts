import { InventoryService } from './inventory.service';
import { ScheduleOperationalStateService } from '../schedules/schedule-operational-state.service';
import { UserRole } from '@prisma/client';

const user = { sub: 'actor', email: 'vendor@example.com', role: UserRole.VENDOR, tenantId: 'tenant-1' };

function makeService(status: 'BLACKOUT' | 'CLOSED' | 'OPEN', options: { scheduleVersion?: number; expectedScheduleVersion?: number; sessionVersion?: number; expectedSessionVersion?: number; global?: boolean; selectedCount?: number; allCount?: number } = {}) {
  const scheduleVersion = options.scheduleVersion ?? 3; const sessionVersion = options.sessionVersion ?? 4; const session = { id: 'session-1', serviceDate: new Date('2026-09-20T00:00:00.000Z'), sessionKey: '09:00', slotTemplateId: 'slot-1', status: status === 'OPEN' ? 'BLACKOUT' : 'OPEN', version: sessionVersion };
  const update = jest.fn(); const exceptionUpdate = jest.fn(); const exceptionUpsert = jest.fn(async (args) => ({ id: 'exception-1', ...args.data })); const globalException = { id: 'global-1', slotTemplateId: null, type: 'BLACKOUT', reason: 'holiday' };
  const tx: any = {
    $queryRawUnsafe: jest.fn(async (sql: string) => sql.includes('ScheduleTemplate') ? [{ id: 'schedule-1', version: scheduleVersion }] : sql.includes('ServiceSession') ? [{ ...session }] : [{ id: 'state-1', sessionId: 'session-1', totalCapacity: 10, blockedCapacity: 0, heldCapacity: 0, confirmedCapacity: 0, version: 2 }]),
    serviceSession: { findFirst: jest.fn(async () => session), findMany: jest.fn(async () => [{ ...session }]), count: jest.fn(async () => options.allCount ?? 1), update },
    inventoryState: { update: jest.fn() },
    scheduleTemplate: { updateMany: jest.fn(async () => ({ count: 1 })) },
    scheduleException: { upsert: exceptionUpsert, findMany: jest.fn(async () => status === 'OPEN' ? [] : [{ slotTemplateId: session.slotTemplateId, type: status }]), findFirst: jest.fn(async (args: any) => args.where.slotTemplateId === null && options.global ? globalException : args.where.slotTemplateId === 'slot-1' && status === 'OPEN' && !options.global ? { id: 'exact-1', slotTemplateId: 'slot-1', type: 'BLACKOUT' } : null), update: exceptionUpdate },
  };
  const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
  const audit: any = { write: jest.fn() }; const outbox: any = { enqueue: jest.fn() }; const resources: any = {};
  const service = new InventoryService(prisma, audit, outbox, resources, new ScheduleOperationalStateService());
  const row: any = { sessionId: 'session-1', expectedInventoryVersion: 2, expectedSessionVersion: options.expectedSessionVersion ?? sessionVersion, sessionStatus: status, statusReason: status === 'OPEN' ? undefined : 'operational test' };
  return { service, row, tx, update, exceptionUpdate, exceptionUpsert, audit, outbox, scheduleVersion, sessionVersion };
}

describe('InventoryService Phase 4.2 bulk status projection', () => {
  it.each(['BLACKOUT', 'CLOSED'] as const)('projects OPEN to %s immediately', async (status) => {
    const ctx = makeService(status);
    await ctx.service.bulkApply(user, { scheduleTemplateId: 'schedule-1', expectedScheduleVersion: 3, rows: [{ ...ctx.row, sessionStatus: status }] });
    expect(ctx.exceptionUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ type: status }), update: expect.objectContaining({ type: status }) }));
    expect(ctx.update).toHaveBeenCalledWith({ where: { id: 'session-1' }, data: { status, version: { increment: 1 } } });
  });

  it('archives an exact exception and reopens the session on OPEN', async () => {
    const ctx = makeService('OPEN');
    await ctx.service.bulkApply(user, { scheduleTemplateId: 'schedule-1', expectedScheduleVersion: 3, rows: [{ ...ctx.row, sessionStatus: 'OPEN', expectedSessionVersion: 4 }] });
    expect(ctx.exceptionUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: expect.any(String) }, data: { archivedAt: expect.any(Date) } }));
    expect(ctx.update).toHaveBeenCalledWith({ where: { id: 'session-1' }, data: { status: 'OPEN', version: { increment: 1 } } });
  });

  it('rejects clearing a global exception for only one slot', async () => {
    const ctx = makeService('OPEN', { global: true, allCount: 2 });
    await expect(ctx.service.bulkApply(user, { scheduleTemplateId: 'schedule-1', expectedScheduleVersion: 3, rows: [{ ...ctx.row, sessionStatus: 'OPEN' }] })).rejects.toThrow('GLOBAL_EXCEPTION_REQUIRES_FULL_SCOPE');
    expect(ctx.audit.write).not.toHaveBeenCalled();
  });

  it('requires both session and schedule versions for status mutations', async () => {
    const staleSession = makeService('BLACKOUT', { sessionVersion: 8, expectedSessionVersion: 7 });
    await expect(staleSession.service.bulkApply(user, { scheduleTemplateId: 'schedule-1', expectedScheduleVersion: 3, rows: [staleSession.row] })).rejects.toThrow('Session version conflict');
    const staleSchedule = makeService('BLACKOUT', { scheduleVersion: 8, expectedScheduleVersion: 7 });
    await expect(staleSchedule.service.bulkApply(user, { scheduleTemplateId: 'schedule-1', expectedScheduleVersion: 7, rows: [staleSchedule.row] })).rejects.toThrow('Schedule changed');
  });

  it('does not reopen an archived session', async () => {
    const ctx = makeService('OPEN'); ctx.tx.serviceSession.findMany.mockResolvedValue([{ id: 'session-1', status: 'ARCHIVED', slotTemplateId: null }]);
    await ctx.service.bulkApply(user, { scheduleTemplateId: 'schedule-1', expectedScheduleVersion: 3, rows: [{ ...ctx.row, sessionStatus: 'OPEN' }] });
    expect(ctx.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN' }) }));
  });
});
