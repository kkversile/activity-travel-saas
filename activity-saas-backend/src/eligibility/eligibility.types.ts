import { BookingMode, CapacityUnit, TravellerType } from '@prisma/client';

export type TravellerRequest = { travellerType: TravellerType; quantity: number };
export type EligibilityInput = {
  agentTenantId: string;
  ratePlanId: string;
  sessionId: string;
  travellers: TravellerRequest[];
  units?: number;
  channelCode?: string;
  now?: Date;
};
export type GateStatus = 'PASS' | 'FAIL' | 'NOT_EVALUATED';
export type EligibilityGate = { gate: string; status: GateStatus; code?: string; message: string; details?: Record<string, unknown> };
export type EligibilityResult = {
  eligible: boolean;
  bookingMode?: BookingMode;
  evaluatedAt: string;
  capacityConsumption?: number;
  gates: EligibilityGate[];
  commercial?: Record<string, unknown>;
  inventory?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  productId?: string;
  variantId?: string;
  ratePlanId: string;
  sessionId: string;
};

export const REASON_MESSAGES: Record<string, string> = {
  AGENT_PROFILE_MISSING: 'The agent has no governance profile.',
  AGENT_NOT_APPROVED: 'The agent profile is not approved for marketplace access.',
  AGENT_SUSPENDED: 'The agent profile is suspended.',
  VENDOR_NOT_VERIFIED: 'The supplier is not verified for marketplace distribution.',
  VENDOR_SUSPENDED: 'The supplier is suspended from new marketplace eligibility.',
  PRODUCT_NOT_LIVE: 'The product is not live.',
  PRODUCT_PUBLISHED_REVISION_MISSING: 'The product has no published current revision.',
  VARIANT_NOT_ACTIVE: 'The selected variant is not active.',
  RATEPLAN_NOT_ACTIVE: 'The rate plan is not active.',
  RATEPLAN_OUTSIDE_EFFECTIVE_RANGE: 'The service date is outside the rate plan effective range.',
  MARKETPLACE_CHANNEL_NOT_CONFIGURED: 'The VOYA_AGENT channel is not configured for this rate plan.',
  MARKETPLACE_CHANNEL_DISABLED: 'The rate plan is disabled for the VOYA_AGENT channel.',
  RATEPLAN_SCHEDULE_NOT_ELIGIBLE: 'The rate plan is not actively mapped to this schedule.',
  SCHEDULE_NOT_ACTIVE: 'The schedule is not active.',
  SCHEDULE_OUTSIDE_EFFECTIVE_RANGE: 'The service date is outside the schedule effective range.',
  CAPACITY_UNIT_REVIEW_REQUIRED: 'The schedule capacity unit has not been confirmed.',
  SESSION_NOT_FOUND: 'The requested service session does not exist.',
  SESSION_CLOSED: 'The requested session is closed.',
  SESSION_BLACKOUT: 'The requested session is blacked out.',
  SESSION_ARCHIVED: 'The requested session is archived.',
  CUTOFF_REFERENCE_MISSING: 'No explicit cutoff reference exists for this date-level session.',
  CUTOFF_PASSED: 'The booking cutoff has passed.',
  PAX_BELOW_MINIMUM: 'The requested traveller count is below the rate plan minimum.',
  PAX_ABOVE_MAXIMUM: 'The requested traveller count exceeds the rate plan maximum.',
  ADULT_REQUIRED: 'At least one adult is required.',
  MINIMUM_ADULTS_NOT_MET: 'The minimum adult count was not met.',
  TRAVELLER_COUNT_INVALID: 'The requested traveller mix is not supported by the rate plan.',
  COMMERCIAL_NOT_READY: 'The commercial quote is not ready.',
  AGENT_COMMERCIAL_UNCONFIGURED: 'No agent commercial terms are configured.',
  AGENT_ELIGIBILITY_UNCONFIGURED: 'No agent eligibility rule is configured.',
  AGENT_COMMERCIAL_DENIED: 'The agent is denied by the commercial eligibility rule.',
  PRICE_NOT_CALCULABLE: 'A valid agent-facing price could not be calculated.',
  UNIT_QUANTITY_REQUIRED: 'Units are required for this capacity model.',
  CAPACITY_CONSUMPTION_INVALID: 'The requested capacity consumption is invalid.',
  INVENTORY_STATE_MISSING: 'The session has no canonical inventory state.',
  INSUFFICIENT_INVENTORY: 'There is not enough available inventory.',
  RESOURCE_NOT_READY: 'Required operational resources are not ready.',
  FULFILMENT_POLICY_MISSING: 'The published product has no fulfilment policy.',
  FULFILMENT_POLICY_REVIEW_REQUIRED: 'The product fulfilment policy requires review.',
  FULFILMENT_POLICY_INVALID: 'The product fulfilment policy is incomplete or invalid.',
};

export function messageFor(code: string) { return REASON_MESSAGES[code] ?? code.replaceAll('_', ' ').toLowerCase(); }
