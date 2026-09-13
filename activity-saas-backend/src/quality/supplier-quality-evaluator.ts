import { BadRequestException, Injectable } from '@nestjs/common';
import { SupplierMetricDirection, SupplierMetricMissingDataTreatment, SupplierMetricStatus, SupplierQualityMetricCode, SupplierQualityMetricRule, SupplierQualityPolicy } from '@prisma/client';
import { validateMetricClassification } from './quality-metric-registry';

export type MetricResult = {
  metricCode: SupplierQualityMetricCode;
  dimension: string;
  rawValue: number | null;
  numerator: number | null;
  denominator: number | null;
  sampleSize: number;
  unit: string;
  status: SupplierMetricStatus;
  score: number | null;
  sourceTrace: Record<string, unknown>;
};

export function validateRule(rule: Pick<SupplierQualityMetricRule, 'direction' | 'targetValue' | 'warningValue' | 'weight' | 'minimumSampleSize' | 'passScore' | 'warnScore' | 'failScore'>) {
  if (rule.weight <= 0 || rule.minimumSampleSize < 0 || [rule.passScore, rule.warnScore, rule.failScore].some((n) => n < 0 || n > 100)) throw new BadRequestException('Quality rule weight, sample size, and scores are invalid');
  if (rule.direction === SupplierMetricDirection.HIGHER_BETTER && rule.targetValue < rule.warningValue) throw new BadRequestException('HIGHER_BETTER requires targetValue >= warningValue');
  if (rule.direction === SupplierMetricDirection.LOWER_BETTER && rule.targetValue > rule.warningValue) throw new BadRequestException('LOWER_BETTER requires targetValue <= warningValue');
}

@Injectable()
export class SupplierQualityEvaluator {
  assess(raw: MetricResult, rule?: SupplierQualityMetricRule | null): MetricResult {
    if (!rule) return { ...raw, status: raw.status === SupplierMetricStatus.UNAVAILABLE ? raw.status : SupplierMetricStatus.UNASSESSED, score: null };
    validateRule(rule);
    validateMetricClassification(rule);
    if (raw.status === SupplierMetricStatus.UNAVAILABLE) return { ...raw, score: null };
    const hasData = raw.rawValue !== null && raw.sampleSize >= rule.minimumSampleSize;
    if (!hasData) {
      if (rule.missingDataTreatment === SupplierMetricMissingDataTreatment.WARN) return { ...raw, status: SupplierMetricStatus.WARN, score: rule.warnScore };
      if (rule.missingDataTreatment === SupplierMetricMissingDataTreatment.FAIL) return { ...raw, status: SupplierMetricStatus.FAIL, score: rule.failScore };
      return { ...raw, status: SupplierMetricStatus.INSUFFICIENT_DATA, score: null };
    }
    const value = raw.rawValue as number;
    const pass = rule.direction === SupplierMetricDirection.HIGHER_BETTER ? value >= rule.targetValue : value <= rule.targetValue;
    const warn = rule.direction === SupplierMetricDirection.HIGHER_BETTER ? value >= rule.warningValue : value <= rule.warningValue;
    return { ...raw, status: pass ? SupplierMetricStatus.PASS : warn ? SupplierMetricStatus.WARN : SupplierMetricStatus.FAIL, score: pass ? rule.passScore : warn ? rule.warnScore : rule.failScore };
  }

  score(metrics: MetricResult[], rules: SupplierQualityMetricRule[]) {
    const participating = metrics.map((m) => ({ m, rule: rules.find((r) => r.metricCode === m.metricCode) })).filter((x): x is { m: MetricResult & { score: number }; rule: SupplierQualityMetricRule } => Boolean(x.rule?.enabled && x.m.score !== null && x.m.status !== SupplierMetricStatus.UNAVAILABLE && x.m.status !== SupplierMetricStatus.INSUFFICIENT_DATA));
    if (!participating.length) return null;
    const denominator = participating.reduce((sum, x) => sum + x.rule.weight, 0);
    return Math.max(0, Math.min(100, participating.reduce((sum, x) => sum + (x.m.score as number) * x.rule.weight, 0) / denominator));
  }

  recommendedTier(score: number | null, policy: SupplierQualityPolicy & { tierRules: Array<{ tier: any; minimumScore: number }> }) {
    if (score === null || policy.tierRules.length !== 5) return null;
    return [...policy.tierRules].sort((a, b) => b.minimumScore - a.minimumScore).find((rule) => score >= rule.minimumScore)?.tier ?? null;
  }
}
