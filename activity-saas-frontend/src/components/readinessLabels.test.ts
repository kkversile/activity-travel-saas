import { describe, expect, it } from 'vitest';
import { readinessExplanation, readinessReasonLabel, readinessSummary } from './readinessLabels';

describe('commercial readiness labels', () => {
  it('translates the internal commercial reason codes', () => {
    expect(readinessReasonLabel('NO_ACTIVE_COMMERCIAL_VERSION')).toBe('Pricing not activated');
    expect(readinessReasonLabel('LEGACY_COMMERCIAL_REVIEW_REQUIRED')).toBe('Existing pricing needs review');
  });

  it('combines the two commercial blockers into a client-facing message', () => {
    const reasons = ['NO_ACTIVE_COMMERCIAL_VERSION', 'LEGACY_COMMERCIAL_REVIEW_REQUIRED'];
    expect(readinessSummary(reasons)).toBe('Pricing setup required');
    expect(readinessExplanation(reasons)).toContain('activate them before this rate can be booked');
  });
});
