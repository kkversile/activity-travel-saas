import { CapacityUnit } from '@prisma/client';

export function capacityQuantity(unit: CapacityUnit, requested: number) {
  if (!Number.isInteger(requested) || requested < 1) throw new Error('quantity must be a positive integer');
  return unit === CapacityUnit.BOOKING ? 1 : requested;
}

export function calculatedAvailable(totalCapacity: number, blockedCapacity: number, heldCapacity: number, confirmedCapacity: number, status: string) {
  if (['CLOSED', 'BLACKOUT', 'ARCHIVED'].includes(status)) return 0;
  return Math.max(0, totalCapacity - blockedCapacity - heldCapacity - confirmedCapacity);
}
