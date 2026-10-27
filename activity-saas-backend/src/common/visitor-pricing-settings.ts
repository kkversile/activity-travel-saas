export const VISITOR_PRICING_SETTINGS_KEY = 'VISITOR_PRICING_FIELDS';

export type VisitorPricingSettings = {
  showEligibilityBasis: boolean;
  showVerificationRequired: boolean;
};

export const defaultVisitorPricingSettings: VisitorPricingSettings = {
  showEligibilityBasis: false,
  showVerificationRequired: false,
};

export function normalizeVisitorPricingSettings(value: unknown): VisitorPricingSettings {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    showEligibilityBasis: candidate.showEligibilityBasis === true,
    showVerificationRequired: candidate.showVerificationRequired === true,
  };
}
