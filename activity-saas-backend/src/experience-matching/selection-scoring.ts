export type SelectionObjective = "MARGIN" | "LOWEST_PRICE";

export interface SelectionWeights {
  priceWeight: number;
  ratingWeight: number;
  reliabilityWeight: number;
  inventoryWeight: number;
  contractWeight: number;
  objective: SelectionObjective;
}

export interface SelectionScoreInput {
  price: number;
  minimumPrice: number;
  margin: number;
  maximumMargin: number;
  rating?: number | null;
  reliability?: number | null;
  connectionType?: string | null;
  contractPriority: number;
  maximumContractPriority: number;
}

/** Score only persisted, measurable signals; missing review/reliability sources are excluded. */
export function scoreSelectionOffer(input: SelectionScoreInput, weights: SelectionWeights) {
  const priceScore = input.price > 0 && input.minimumPrice > 0
    ? (input.minimumPrice / input.price) * 100
    : undefined;
  const marginScore = input.margin >= 0 && input.maximumMargin > 0
    ? (input.margin / input.maximumMargin) * 100
    : undefined;
  const objectiveScore = weights.objective === "LOWEST_PRICE" ? priceScore : marginScore;
  const contractScore = input.maximumContractPriority > 0
    ? (input.contractPriority / input.maximumContractPriority) * 100
    : undefined;
  const inventoryScore = selectionConnectionScore(input.connectionType);
  const ratingScore = input.rating == null
    ? undefined
    : Math.max(0, Math.min(100, ((input.rating - 3) / 2) * 100));
  const reliabilityScore = input.reliability == null
    ? undefined
    : Math.max(0, Math.min(100, input.reliability));

  const signals = [
    [objectiveScore, weights.priceWeight],
    [ratingScore, weights.ratingWeight],
    [reliabilityScore, weights.reliabilityWeight],
    [inventoryScore, weights.inventoryWeight],
    [contractScore, weights.contractWeight],
  ] as const;
  const usable = signals.filter(([score, weight]) => score !== undefined && weight > 0);
  const effectiveWeight = usable.reduce((total, [, weight]) => total + weight, 0);
  if (!effectiveWeight) return 0;
  return usable.reduce((total, [score, weight]) => total + score! * weight, 0) / effectiveWeight;
}

/** Map persisted voucher/integration sources to the prototype's connection quality factor. */
export function selectionConnectionScore(connectionType?: string | null) {
  if (!connectionType) return undefined;
  switch (connectionType.toUpperCase()) {
    case 'SUPPLIER_API': return 100;
    case 'SUPPLIER_BARCODE_POOL': return 70;
    case 'PLATFORM':
    case 'NONE': return 40;
    default: return undefined;
  }
}

const higherIsBetter = new Set([
  'CONFIRMATION_WITHIN_SLA_RATE',
  'VOUCHER_READY_BEFORE_SERVICE_RATE',
]);
const lowerIsBetter = new Set([
  'VENDOR_CANCELLATION_RATE',
  'SHORT_NOTICE_VENDOR_CANCELLATION_RATE',
  'LAST_MINUTE_STOP_SELL_RATE',
]);

/** Use only sampled, persisted supplier-quality metrics in ranking. */
export function selectionQualitySignals(metrics: Array<{
  metricCode: string;
  rawValue: number | null;
  sampleSize: number;
  status?: string;
}> = []) {
  const usable = metrics.filter((metric) =>
    Number.isFinite(metric.rawValue)
      && metric.rawValue !== null
      && metric.sampleSize > 0
      && !['UNAVAILABLE', 'INSUFFICIENT_DATA', 'UNASSESSED'].includes(String(metric.status ?? '')),
  );
  const rating = usable.find((metric) => metric.metricCode === 'CUSTOMER_RATING')?.rawValue ?? null;
  const reliabilityValues = usable.flatMap((metric) => {
    const value = Number(metric.rawValue);
    if (higherIsBetter.has(metric.metricCode)) return [Math.max(0, Math.min(100, value))];
    if (lowerIsBetter.has(metric.metricCode)) return [100 - Math.max(0, Math.min(100, value))];
    return [];
  });
  return {
    rating,
    reliability: reliabilityValues.length
      ? reliabilityValues.reduce((sum, value) => sum + value, 0) / reliabilityValues.length
      : null,
  };
}

export function shouldApplySupplierAllocation(allocation: string | undefined, scores: number[]) {
  return (allocation === "ROUND_ROBIN" || allocation === "SPLIT_70_30")
    && scores.length > 1
    && scores[0] - scores[1] <= 5;
}
