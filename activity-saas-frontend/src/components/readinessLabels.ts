const readinessReasonLabels: Record<string, string> = {
  NO_ACTIVE_COMMERCIAL_VERSION: 'Pricing not activated',
  LEGACY_COMMERCIAL_REVIEW_REQUIRED: 'Existing pricing needs review',
  OPEN_DATED_VALIDITY_EXCEEDED: 'Open-dated validity window exceeded',
  SHORT_SUMMARY_MISSING: 'Short summary is missing',
  CATEGORY_MISSING: 'Category is missing',
  HIGHLIGHTS_COUNT_INVALID: 'Add between 3 and 6 highlights',
  INCLUDED_MISSING: 'What is included is missing',
  NOT_INCLUDED_MISSING: 'What is not included is missing',
  END_POINT_MISSING: 'End point is missing',
  ITINERARY_STOPS_MISSING: 'Add itinerary stops or choose single-location activity',
  ITINERARY_STOP_NAME_MISSING: 'Every itinerary stop needs a name',
  EXTERNAL_IMAGE_QUALITY_UNVERIFIED: 'External image quality needs verification; upload a validated image',
  SUPPLIER_VOUCHER_INTEGRATION_MISSING: 'Supplier voucher integration is not configured',
  CANCELLATION_POLICY_MISSING: 'Cancellation policy is missing',
  VOUCHER_CONFIGURATION_MISSING: 'Voucher configuration is incomplete',
  VOUCHER_INSTRUCTIONS_MISSING: 'Redemption instructions are missing',
};

export function readinessReasonLabel(code: string) {
  return readinessReasonLabels[code] || code.replaceAll('_', ' ').toLowerCase();
}
export function readinessSummary(reasonCodes: string[]) {
  const codes = new Set(reasonCodes);
  if (codes.has('NO_ACTIVE_COMMERCIAL_VERSION') && codes.has('LEGACY_COMMERCIAL_REVIEW_REQUIRED')) {
    return 'Pricing setup required';
  }
  return reasonCodes.map(readinessReasonLabel).join(' · ');
}

export function readinessExplanation(reasonCodes: string[]) {
  const codes = new Set(reasonCodes);
  if (codes.has('NO_ACTIVE_COMMERCIAL_VERSION') && codes.has('LEGACY_COMMERCIAL_REVIEW_REQUIRED')) {
    return 'Supplier pricing has not been activated. Review the existing commercial terms and activate them before this rate can be booked.';
  }
  if (codes.has('NO_ACTIVE_COMMERCIAL_VERSION')) {
    return 'Review the supplier commercial terms and activate a pricing version before this rate can be booked.';
  }
  if (codes.has('LEGACY_COMMERCIAL_REVIEW_REQUIRED')) {
    return 'Review the existing commercial terms and activate the current pricing version before this rate can be booked.';
  }
  return reasonCodes.map(readinessReasonLabel).join(' · ');
}

