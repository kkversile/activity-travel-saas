export type ActivityPriceHistoryRange<T = unknown> = {
  effectiveFrom: Date;
  effectiveTo: Date;
  value: T;
};

const day = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

/**
 * Returns a non-overlapping effective-date history for an activity-editor
 * override. The existing values are clipped around the candidate range and
 * the candidate wins inside its range. Dates use the existing commercial
 * engine's half-open convention: [effectiveFrom, effectiveTo).
 */
export function splitActivityPriceHistory<T>(
  existing: ActivityPriceHistoryRange<T>[],
  candidate: ActivityPriceHistoryRange<T>,
): ActivityPriceHistoryRange<T>[] {
  const candidateFrom = day(candidate.effectiveFrom);
  const candidateTo = day(candidate.effectiveTo);
  if (candidateTo <= candidateFrom) throw new Error('effectiveTo must be after effectiveFrom');

  const output: ActivityPriceHistoryRange<T>[] = [];
  for (const range of existing) {
    const from = day(range.effectiveFrom);
    const to = day(range.effectiveTo);
    if (to <= from || to <= candidateFrom || from >= candidateTo) {
      output.push(range);
      continue;
    }
    if (from < candidateFrom) {
      output.push({ effectiveFrom: new Date(from), effectiveTo: new Date(candidateFrom), value: range.value });
    }
    if (to > candidateTo) {
      output.push({ effectiveFrom: new Date(candidateTo), effectiveTo: new Date(to), value: range.value });
    }
  }
  output.push({ effectiveFrom: new Date(candidateFrom), effectiveTo: new Date(candidateTo), value: candidate.value });
  return output.sort((a, b) => day(a.effectiveFrom) - day(b.effectiveFrom));
}

export function sameActivityRange(a: ActivityPriceHistoryRange, b: ActivityPriceHistoryRange) {
  return day(a.effectiveFrom) === day(b.effectiveFrom) && day(a.effectiveTo) === day(b.effectiveTo);
}
