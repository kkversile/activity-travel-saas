import { SupplierMetricDirection, SupplierMetricMissingDataTreatment, SupplierMetricStatus, SupplierQualityDimension, SupplierQualityMetricCode } from '@prisma/client';
import { SupplierQualityEvaluator, type MetricResult } from './supplier-quality-evaluator';

const metric = (rawValue: number | null, sampleSize = 10): MetricResult => ({ metricCode: SupplierQualityMetricCode.CONFIRMATION_WITHIN_SLA_RATE, dimension: SupplierQualityDimension.CONFIRMATION_SLA, rawValue, numerator: null, denominator: sampleSize, sampleSize, unit: 'percent', status: SupplierMetricStatus.UNASSESSED, score: null, sourceTrace: {} });
describe('SupplierQualityEvaluator', () => {
  const evaluator = new SupplierQualityEvaluator();
  const rule = (direction: SupplierMetricDirection) => ({ id: 'r', policyId: 'p', metricCode: SupplierQualityMetricCode.CONFIRMATION_WITHIN_SLA_RATE, dimension: SupplierQualityDimension.CONFIRMATION_SLA, enabled: true, direction, weight: 1, targetValue: direction === 'HIGHER_BETTER' ? 90 : 10, warningValue: direction === 'HIGHER_BETTER' ? 75 : 20, minimumSampleSize: 5, missingDataTreatment: SupplierMetricMissingDataTreatment.EXCLUDE, passScore: 100, warnScore: 50, failScore: 0, rank: 0, createdAt: new Date(), updatedAt: new Date() });
  it('applies higher-is-better thresholds without swapping them', () => { expect(evaluator.assess(metric(90), rule(SupplierMetricDirection.HIGHER_BETTER)).status).toBe(SupplierMetricStatus.PASS); expect(evaluator.assess(metric(80), rule(SupplierMetricDirection.HIGHER_BETTER)).status).toBe(SupplierMetricStatus.WARN); expect(evaluator.assess(metric(70), rule(SupplierMetricDirection.HIGHER_BETTER)).status).toBe(SupplierMetricStatus.FAIL); });
  it('excludes insufficient data by policy', () => { expect(evaluator.assess(metric(null, 0), rule(SupplierMetricDirection.HIGHER_BETTER)).status).toBe(SupplierMetricStatus.INSUFFICIENT_DATA); });
});
