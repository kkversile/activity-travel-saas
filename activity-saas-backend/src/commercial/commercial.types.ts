import { AgentCommercialModel, BookingMode, CommercialRuleKind, PricingUnit, SupplierCommercialModel, TaxMode, VoyaRevenueModel } from '@prisma/client';

export type QuoteInput = {
  ratePlanId: string;
  serviceDate: Date;
  units: number;
  travellers: Array<{ travellerType: string; quantity: number }>;
  agentTenantId?: string;
  channel?: string;
};

export type ReasonCode = 'NO_ACTIVE_COMMERCIAL_VERSION' | 'COMMERCIAL_VERSION_MISSING' | 'SUPPLIER_MODEL_MISSING' | 'SUPPLIER_MODEL_UNSUPPORTED' | 'PRICING_UNIT_MISSING' | 'BOOKING_MODE_MISSING' | 'SUPPLIER_BASE_AMOUNT_MISSING' | 'TRAVELLER_PRICE_MISSING' | 'VOYA_REVENUE_RULE_MISSING' | 'AGENT_COMMERCIAL_UNCONFIGURED' | 'AGENT_FACING_QUOTE_INCOMPLETE' | 'AGENT_ELIGIBILITY_UNCONFIGURED' | 'AGENT_COMMERCIAL_DENIED' | 'FOC_UNSUPPORTED_PRICING_UNIT' | 'FOC_FUNDING_MODEL_NOT_LOCKED' | 'AMBIGUOUS_RULE' | 'INVALID_RULE_CONFIG' | 'TAX_CONFIGURATION_MISSING' | 'LEGACY_COMMERCIAL_REVIEW_REQUIRED';
export type AppliedRule = { ruleId: string; ruleVersionId: string; kind: CommercialRuleKind; scope: string; priority: number; stackingMode: string; effectiveFrom: string; effectiveTo?: string | null; config: unknown };
export type QuoteResult = {
  ready: boolean;
  reasonCodes: ReasonCode[];
  currency: string;
  pricingUnit?: PricingUnit;
  bookingMode?: BookingMode;
  ratePlanCommercialVersionId?: string;
  commercialVersionNumber?: number;
  supplier?: { model?: SupplierCommercialModel; grossBasis: string; commission: string; vendorPayable: string };
  voya?: { model?: VoyaRevenueModel; revenue: string };
  agent?: { model?: AgentCommercialModel; markup: string; commission: string; facingAmount: string };
  tax?: { mode: TaxMode; amount: string; context?: Record<string, unknown> };
  promotionAmount: string;
  promotionFunder?: string | null;
  promotionApplicationStage?: string | null;
  promotionFundingBreakdown: Record<string, string>;
  foc: { applied: boolean; freeChargeableQuantity: number; discountAmount: string; funder?: string };
  commercialEligibility: 'ALLOWED' | 'DENIED' | 'UNCONFIGURED' | 'NOT_APPLICABLE';
  agentFacingAmount: string;
  focAmount: string;
  finalAmount: string;
  appliedRules: AppliedRule[];
  calculationInputs: unknown;
  calculationOutputs: unknown;
};
