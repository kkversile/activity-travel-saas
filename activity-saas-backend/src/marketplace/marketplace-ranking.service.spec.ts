import { MarketplaceRankingService } from './marketplace-ranking.service';

describe('MarketplaceRankingService', () => {
  const service = new MarketplaceRankingService();
  const item = (code: string, price: string, score = 100) => ({ product: { productCode: code }, variant: { variantCode: 'V1' }, offer: { ratePlanCode: 'R1', price: { finalAmount: price }, bookingMode: 'INSTANT', startsAt: '2026-09-20T06:00:00Z', sessionId: code }, _ranking: { score } });
  it('uses stable tie-breakers', () => { const result = service.sort([item('B', '100'), item('A', '100')]); expect(result.map((x) => x.product.productCode)).toEqual(['A', 'B']); });
  it('sorts by Agent-facing price', () => { const result = service.sort([item('A', '200'), item('B', '100')], 'PRICE_ASC'); expect(result[0].offer.price.finalAmount).toBe('100'); });
  it('applies only the configured Admin ranking boost to relevance scores', () => { const base = { product: { productCode: 'A', name: 'Coastal walk' }, offer: { bookingMode: 'VENDOR_CONFIRMATION' } }; const normal = service.score(base, {}); const plusOne = service.score({ ...base, _adminRankingBoost: 'PLUS_ONE' }, {}); const plusTwo = service.score({ ...base, _adminRankingBoost: 'PLUS_TWO' }, {}); const invalid = service.score({ ...base, _adminRankingBoost: '999' }, {}); expect(plusOne.score - normal.score).toBe(1); expect(plusTwo.score - normal.score).toBe(2); expect(invalid.score).toBe(normal.score); });
});
