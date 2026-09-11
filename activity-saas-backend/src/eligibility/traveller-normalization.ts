import { BadRequestException } from '@nestjs/common';
import { TravellerType } from '@prisma/client';
import { TravellerRequest } from './eligibility.types';

export type NormalizedTravellers = {
  quantitiesByType: Partial<Record<TravellerType, number>>;
  totalPax: number;
  adultCount: number;
  normalizedTravellers: TravellerRequest[];
};

/** Canonicalizes traveller input so duplicate rows cannot change pricing or capacity semantics. */
export function normalizeTravellers(input: TravellerRequest[], requirePositive = true): NormalizedTravellers {
  if (!Array.isArray(input)) throw new BadRequestException('travellers must be an array');
  const quantitiesByType: Partial<Record<TravellerType, number>> = {};
  for (const traveller of input) {
    if (!Object.values(TravellerType).includes(traveller.travellerType)) throw new BadRequestException('Unsupported traveller type');
    if (!Number.isInteger(traveller.quantity) || traveller.quantity < 0) throw new BadRequestException('Traveller quantities must be non-negative integers');
    quantitiesByType[traveller.travellerType] = (quantitiesByType[traveller.travellerType] ?? 0) + traveller.quantity;
  }
  const normalizedTravellers = Object.values(TravellerType).filter((type) => (quantitiesByType[type] ?? 0) > 0).map((travellerType) => ({ travellerType, quantity: quantitiesByType[travellerType]! }));
  const totalPax = normalizedTravellers.reduce((sum, item) => sum + item.quantity, 0);
  if (requirePositive && totalPax < 1) throw new BadRequestException('At least one traveller is required');
  return { quantitiesByType, totalPax, adultCount: quantitiesByType.ADULT ?? 0, normalizedTravellers };
}
