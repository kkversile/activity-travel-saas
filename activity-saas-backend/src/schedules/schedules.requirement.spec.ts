import { UserRole } from '@prisma/client';
import { SchedulesService } from './schedules.service';

const user = { sub: 'actor', email: 'vendor@example.com', role: UserRole.VENDOR, tenantId: 'tenant-1' };

function requirementService(schedule: any = { id: 'schedule-1', version: 4, status: 'INACTIVE', variantId: 'variant-1', variant: { durationMinutes: 60 }, slotTemplates: [] }) {
  const requirement = { id: 'requirement-1', scheduleTemplateId: 'schedule-1', resourceType: 'VEHICLE', specificResourceId: null, quantity: 1, required: true, version: 1, archivedAt: null };
  const tx: any = { $queryRawUnsafe: jest.fn(async () => [{ id: 'schedule-1', version: schedule.version }]), scheduleResourceRequirement: { findFirst: jest.fn(async ({ where }: any) => where.id?.not ? null : requirement), findUnique: jest.fn(), update: jest.fn(async ({ data }: any) => ({ ...requirement, ...data })) }, scheduleTemplate: { findUniqueOrThrow: jest.fn(async () => schedule), updateMany: jest.fn(async () => ({ count: 1 })) }, resource: { findFirst: jest.fn(async () => ({ id: 'resource-1', tenantId: 'tenant-1', type: 'VEHICLE', active: true, archivedAt: null })) } };
  const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) }; const service = new SchedulesService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, {} as any, {} as any);
  return { service, tx, requirement };
}

describe('SchedulesService requirement PATCH', () => {
  it('updates the existing requirement identity for quantity, resource and required changes', async () => {
    const ctx = requirementService();
    await ctx.service.updateRequirement(user, 'requirement-1', { quantity: 3, specificResourceId: 'resource-1', required: false, expectedVersion: 4 });
    expect(ctx.tx.scheduleResourceRequirement.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'requirement-1' }, data: expect.objectContaining({ quantity: 3, specificResourceId: 'resource-1', required: false, version: { increment: 1 } }) }));
  });

  it('rejects PATCH against an ACTIVE schedule', async () => {
    const ctx = requirementService({ id: 'schedule-1', version: 4, status: 'ACTIVE', variantId: 'variant-1', variant: { durationMinutes: 60 }, slotTemplates: [] });
    await expect(ctx.service.updateRequirement(user, 'requirement-1', { quantity: 2, expectedVersion: 4 })).rejects.toThrow('Deactivate an ACTIVE schedule');
  });

  it('rejects a stale schedule version', async () => {
    const ctx = requirementService({ id: 'schedule-1', version: 5, status: 'INACTIVE', variantId: 'variant-1', variant: { durationMinutes: 60 }, slotTemplates: [] });
    await expect(ctx.service.updateRequirement(user, 'requirement-1', { quantity: 2, expectedVersion: 4 })).rejects.toThrow('Schedule changed');
  });
});
