import { sameActivityRange, splitActivityPriceHistory } from './activity-pricing-history';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('activity editor effective-date history', () => {
  it('keeps the surrounding dates when a middle range is overridden', () => {
    const result = splitActivityPriceHistory(
      [{ effectiveFrom: date('2026-11-01'), effectiveTo: date('2026-12-01'), value: { price: 800 } }],
      { effectiveFrom: date('2026-11-14'), effectiveTo: date('2026-11-16'), value: { price: 1000 } },
    );
    expect(result.map((item) => [item.effectiveFrom.toISOString().slice(0, 10), item.effectiveTo.toISOString().slice(0, 10), item.value])).toEqual([
      ['2026-11-01', '2026-11-14', { price: 800 }],
      ['2026-11-14', '2026-11-16', { price: 1000 }],
      ['2026-11-16', '2026-12-01', { price: 800 }],
    ]);
  });

  it('makes an exact retry range deterministic instead of duplicating it', () => {
    const result = splitActivityPriceHistory(
      [{ effectiveFrom: date('2026-11-14'), effectiveTo: date('2026-11-16'), value: 'old' }],
      { effectiveFrom: date('2026-11-14'), effectiveTo: date('2026-11-16'), value: 'new' },
    );
    expect(result).toHaveLength(1);
    expect(sameActivityRange(result[0], { effectiveFrom: date('2026-11-14'), effectiveTo: date('2026-11-16'), value: 'new' })).toBe(true);
    expect(result[0].value).toBe('new');
  });
});
