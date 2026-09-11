import { InventoryReservationService } from './inventory-reservation.service';

function reviewedService() {
  const tx: any = {
    $queryRawUnsafe: jest.fn(async () => [{ id: 'state-1', sessionId: 'session-1', totalCapacity: 10, blockedCapacity: 0, heldCapacity: 0, confirmedCapacity: 0, version: 1 }]),
    serviceSession: { findUniqueOrThrow: jest.fn(async () => ({ id: 'session-1', status: 'OPEN', scheduleTemplate: { capacityUnit: 'PERSON', capacityUnitReviewRequired: true } })) },
    inventoryHold: { findUnique: jest.fn(async () => ({ id: 'hold-1', inventoryStateId: 'state-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000), quantity: 1 })), findUniqueOrThrow: jest.fn(async () => ({ id: 'hold-1', inventoryStateId: 'state-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000), quantity: 1 })) },
  };
  const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
  return new InventoryReservationService(prisma, { write: jest.fn() } as any, { enqueue: jest.fn() } as any, { resourceReadiness: jest.fn() } as any);
}

describe('InventoryReservationService capacity review boundary', () => {
  it.each([
    ['createHold', (service: InventoryReservationService) => service.createHold({ sessionId: 'session-1', quantity: 1 })],
    ['confirmDirect', (service: InventoryReservationService) => service.confirmDirect({ sessionId: 'session-1', quantity: 1 })],
    ['convertHoldToConfirmed', (service: InventoryReservationService) => service.convertHoldToConfirmed('hold-1')],
  ])('%s rejects unreviewed migrated capacity', async (_name, action) => {
    await expect(action(reviewedService())).rejects.toThrow('CAPACITY_UNIT_REVIEW_REQUIRED');
  });
});
