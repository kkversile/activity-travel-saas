import { scoreSelectionOffer, selectionQualitySignals, shouldApplySupplierAllocation } from './selection-scoring';

const base = { ratingWeight: 0, reliabilityWeight: 0, inventoryWeight: 0, contractWeight: 0 };

describe('multi-supplier selection scoring', () => {
  it('uses the configured objective to choose margin or lowest-price scores', () => {
    const offerA = { price: 100, minimumPrice: 100, margin: 10, maximumMargin: 20, contractPriority: 0, maximumContractPriority: 0 };
    const offerB = { price: 120, minimumPrice: 100, margin: 20, maximumMargin: 20, contractPriority: 0, maximumContractPriority: 0 };
    expect(scoreSelectionOffer(offerA, { ...base, priceWeight: 100, objective: 'LOWEST_PRICE' })).toBe(100);
    expect(scoreSelectionOffer(offerB, { ...base, priceWeight: 100, objective: 'MARGIN' })).toBe(100);
  });

  it('does not fabricate review or reliability scores when those sources are absent', () => {
    const offer = { price: 100, minimumPrice: 100, margin: 0, maximumMargin: 0, contractPriority: 0, maximumContractPriority: 0, availableCapacity: 3 };
    const score = scoreSelectionOffer(offer, { priceWeight: 40, ratingWeight: 30, reliabilityWeight: 20, inventoryWeight: 10, contractWeight: 0, objective: 'LOWEST_PRICE' });
    expect(score).toBe(100);
  });
  it('uses sampled rating and reliability weights when quality metrics are available', () => {
    const input = { price: 100, minimumPrice: 100, margin: 50, maximumMargin: 50, rating: 5, reliability: 100, contractPriority: 0, maximumContractPriority: 0, availableCapacity: 5 };
    const weights = { priceWeight: 0, ratingWeight: 50, reliabilityWeight: 50, inventoryWeight: 0, contractWeight: 0, objective: 'LOWEST_PRICE' as const };
    expect(scoreSelectionOffer(input, weights)).toBe(100);
    expect(scoreSelectionOffer({ ...input, rating: 3, reliability: 60 }, weights)).toBe(30);
  });
  it('uses the persisted supplier connection source for the prototype inventory weight', () => {
    const input = { price: 100, minimumPrice: 100, margin: 50, maximumMargin: 50, contractPriority: 0, maximumContractPriority: 0 };
    const weights = { priceWeight: 0, ratingWeight: 0, reliabilityWeight: 0, inventoryWeight: 100, contractWeight: 0, objective: 'MARGIN' as const };
    expect(scoreSelectionOffer({ ...input, connectionType: 'SUPPLIER_API' }, weights)).toBe(100);
    expect(scoreSelectionOffer({ ...input, connectionType: 'SUPPLIER_BARCODE_POOL' }, weights)).toBe(70);
    expect(scoreSelectionOffer({ ...input, connectionType: 'NONE' }, weights)).toBe(40);
    expect(scoreSelectionOffer(input, weights)).toBe(0);
  });
  it('derives reliability from sampled operational metrics and excludes unavailable feedback', () => {
    expect(selectionQualitySignals([
      { metricCode: 'CUSTOMER_RATING', rawValue: null, sampleSize: 0, status: 'UNAVAILABLE' },
      { metricCode: 'CONFIRMATION_WITHIN_SLA_RATE', rawValue: 90, sampleSize: 20, status: 'PASS' },
      { metricCode: 'VENDOR_CANCELLATION_RATE', rawValue: 10, sampleSize: 20, status: 'WARN' },
      { metricCode: 'LAST_MINUTE_STOP_SELL_RATE', rawValue: 20, sampleSize: 5, status: 'FAIL' },
    ])).toEqual({ rating: null, reliability: 86.66666666666667 });
  });

  it('applies split and round-robin only when the leading eligible offers are within five points', () => {
    expect(shouldApplySupplierAllocation('SPLIT_70_30', [90, 85])).toBe(true);
    expect(shouldApplySupplierAllocation('ROUND_ROBIN', [90, 84.9])).toBe(false);
    expect(shouldApplySupplierAllocation('WINNER_TAKES_ALL', [90, 90])).toBe(false);
  });
});
