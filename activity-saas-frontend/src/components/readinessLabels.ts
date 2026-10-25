const readinessReasonLabels: Record<string, string> = {
  NO_ACTIVE_COMMERCIAL_VERSION: 'Pricing not activated',
  LEGACY_COMMERCIAL_REVIEW_REQUIRED: 'Existing pricing needs review',
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

