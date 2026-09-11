import { ResourceAllocationMode } from '@prisma/client';
import { ResourcesService } from './resources.service';

describe('ResourcesService Phase 4.1 lifecycle', () => {
  it('reports an active specific requirement as unassigned until an active allocation exists', async () => {
    const client: any = {
      serviceSession: { findUnique: jest.fn(async () => ({ id: 'session-1', startsAt: new Date('2026-01-01T09:00:00Z'), endsAt: new Date('2026-01-01T10:00:00Z'), scheduleTemplate: { variant: { product: { tenantId: 'tenant-1' } }, resourceRequirements: [{ required: true, active: true, archivedAt: null, resourceType: 'VEHICLE', specificResourceId: 'resource-1', quantity: 1 }] }, resourceAllocations: [] })) },
      resource: { findUnique: jest.fn(async () => ({ id: 'resource-1', tenantId: 'tenant-1', type: 'VEHICLE', active: true, archivedAt: null })) },
    };
    const service = new ResourcesService({} as any, {} as any, {} as any);
    await expect(service.resourceReadiness('session-1', client)).resolves.toEqual({ ready: false, reasonCodes: ['RESOURCE_REQUIREMENT_UNASSIGNED'] });
  });

  it('requires bounded resources to have positive capacity', () => {
    const service = new ResourcesService({} as any, {} as any, {} as any);
    expect(() => (service as any).validate({ allocationMode: ResourceAllocationMode.SHARED, capacity: 0 })).toThrow('positive capacity');
  });
});
