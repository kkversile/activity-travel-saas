import { DemandOpportunityPriority, DemandOpportunityType } from '@prisma/client';

export const DEMAND_TYPES = Object.values(DemandOpportunityType);
export const DEMAND_PRIORITIES = Object.values(DemandOpportunityPriority);

export type DemandScope = {
  destinationNormalized?: string | null;
  cityName?: string | null;
  stateName?: string | null;
  countryName?: string | null;
  category?: string | null;
  subType?: string | null;
  serviceDateFrom?: string | null;
  serviceDateTo?: string | null;
  durationMin?: number | null;
  durationMax?: number | null;
  currency?: string | null;
};

export type DemandCandidate = DemandScope & {
  type: DemandOpportunityType;
  metrics: Record<string, unknown>;
  sourceTrace: Record<string, unknown>;
  recommendedAction: string;
  defaultPriority: DemandOpportunityPriority;
  opportunityKey: string;
};

export function normalizeScopeText(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || null;
}

