import type { ProductVariant } from '../../api';

/** Read legacy inherited limits without writing them back on a price-only save. */
export function optionBookingDefaults(variant: ProductVariant) {
  const plans = (variant.ratePlans || []).filter(plan => !['ARCHIVED', 'INACTIVE'].includes(plan.status));
  const resolve = (field: 'minPax' | 'maxPax' | 'cutOffMinutes', fallback: number): number | null => {
    if (variant[field] != null) return Number(variant[field]);
    if (!plans.length) return fallback;
    const values = plans.flatMap(plan => {
      const versions = (plan.commercialVersions || []).filter(version => ['ACTIVE', 'DRAFT'].includes(version.status));
      return versions.length ? versions.map(version => version[field] ?? plan[field] ?? fallback) : [plan[field] ?? fallback];
    }).map(Number);
    return new Set(values).size === 1 ? values[0] : null;
  };
  return { minPax: resolve('minPax', 1), maxPax: resolve('maxPax', 99), cutOffMinutes: resolve('cutOffMinutes', 0) };
}
