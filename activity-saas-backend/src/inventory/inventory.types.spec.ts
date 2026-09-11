import { CapacityUnit } from '@prisma/client';
import { calculatedAvailable, capacityQuantity } from './inventory.types';

describe('canonical inventory formula', () => {
  it.each([
    [CapacityUnit.PERSON, 4, 4],
    [CapacityUnit.BOOKING, 4, 1],
    [CapacityUnit.UNIT, 3, 3],
  ])('normalizes %s demand without FOC side effects', (unit, requested, expected) => expect(capacityQuantity(unit, requested)).toBe(expected));

  it('derives available from four buckets', () => expect(calculatedAvailable(12, 2, 3, 4, 'OPEN')).toBe(3));
  it.each(['CLOSED', 'BLACKOUT', 'ARCHIVED'])('forces effective availability to zero for %s', (status) => expect(calculatedAvailable(12, 0, 0, 0, status)).toBe(0));
});
