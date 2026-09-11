import { Injectable } from '@nestjs/common';

@Injectable()
export class MarketplaceRankingService {
  score(item: any, dto: { destination?: string; query?: string }) {
    const destination = (dto.destination ?? '').trim().toLowerCase();
    const query = (dto.query ?? '').trim().toLowerCase();
    const product = item.product;
    const fields = [product.name, product.destination?.city, product.destination?.state, product.destination?.country, product.productCode].filter(Boolean).map((value: string) => value.toLowerCase());
    let score = 100;
    const matchReasons: string[] = ['Available on selected date'];
    if (destination && fields.some((field) => field === destination)) { score += 50; matchReasons.unshift('Exact destination match'); }
    else if (destination && fields.some((field) => field.includes(destination))) { score += 20; matchReasons.unshift('Destination match'); }
    if (query && fields.some((field) => field.includes(query))) { score += 15; matchReasons.unshift('Text match'); }
    if (item.offer.bookingMode === 'INSTANT') { score += 5; matchReasons.push('Instant confirmation'); }
    return { score, matchReasons };
  }

  sort(items: any[], sort = 'RELEVANCE') {
    return [...items].sort((a, b) => {
      const by = sort === 'PRICE_ASC' ? Number(a.offer.price.finalAmount) - Number(b.offer.price.finalAmount) : sort === 'PRICE_DESC' ? Number(b.offer.price.finalAmount) - Number(a.offer.price.finalAmount) : sort === 'RATING' ? Number(b.product.starRating ?? 0) - Number(a.product.starRating ?? 0) : sort === 'EARLIEST_SESSION' ? new Date(a.offer.startsAt ?? a.offer.serviceDate).getTime() - new Date(b.offer.startsAt ?? b.offer.serviceDate).getTime() : b._ranking.score - a._ranking.score;
      if (by) return by;
      return [a.product.productCode, a.variant.variantCode, a.offer.ratePlanCode, a.offer.localStartTime ?? '', a.offer.sessionId].join('|').localeCompare([b.product.productCode, b.variant.variantCode, b.offer.ratePlanCode, b.offer.localStartTime ?? '', b.offer.sessionId].join('|'));
    });
  }
}
