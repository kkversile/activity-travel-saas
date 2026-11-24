import type { ActivityPriceOptionDto, VendorBulkRateUpdateRowDto } from './catalogue.dto';
import type { ActivityPriceHistoryRange } from './activity-pricing-history';

export type BulkRateVersion = Record<string, any>;
const date = (value: unknown, fallback: string) => new Date(value ? String(value) : fallback).getTime();
const priority = (a: BulkRateVersion, b: BulkRateVersion) =>
  Number(b.versionNumber) - Number(a.versionNumber) || Number(b.status === 'DRAFT') - Number(a.status === 'DRAFT');

/** A newer draft shadows the approved version only inside its half-open interval. */
export function bulkRateHistory(versions: BulkRateVersion[]): ActivityPriceHistoryRange<BulkRateVersion>[] {
  const boundaries = [...new Set(versions.flatMap(version => [date(version.effectiveFrom, '0001-01-01'), date(version.effectiveTo, '9999-12-31')]))].sort((a,b) => a-b);
  return boundaries.slice(0,-1).flatMap((from,index) => {
    const to = boundaries[index+1];
    const version = versions.filter(item => date(item.effectiveFrom,'0001-01-01') <= from && date(item.effectiveTo,'9999-12-31') >= to).sort(priority)[0];
    return version ? [{effectiveFrom:new Date(from),effectiveTo:new Date(to),value:version}] : [];
  });
}

export function bulkRateOption(row: VendorBulkRateUpdateRowDto, version: BulkRateVersion, plan: BulkRateVersion, variantId: string): ActivityPriceOptionDto {
  const source = version.sourcePayload || {}, rules = source.bookingRules || {};
  const unit = String(version.pricingUnit || plan.pricingUnit).toUpperCase() as ActivityPriceOptionDto['pricingUnit'];
  const replacements: Record<string, string | undefined> = {
    ADULT: row.adultSellInr, CHILD: row.childSellInr, SENIOR: row.seniorSellInr,
  };
  // Columns omitted from the template must not remove other supported types.
  const amounts = new Map<string, string>((version.travellerPrices || []).map(
    (price: any) => [price.travellerType, String(price.amount)],
  ));
  for (const [type, amount] of Object.entries(replacements)) {
    if (amount !== undefined) amounts.set(type, amount);
  }
  const prices = [...amounts].map(([travellerType, amount]) => ({travellerType, amount}));
  // The ordinary per-person amount is the Indian price in the editor. Foreign
  // amounts and untouched categories keep their existing segment-specific terms.
  const visitorPrices = source.visitorPrices?.map((price: any) => {
    const replacement = replacements[price.travellerType];
    return unit === 'PER_PERSON' && replacement !== undefined
      ? {...price, indian: replacement}
      : {...price};
  });
  return {
    variantId, pricingUnit:unit, currency:version.currency || plan.currency || 'INR',
    supplierModel:row.supplierModel || version.supplierModel || 'NET_RATE',
    supplierCommissionPercent:version.supplierCommissionPercent?.toString(),
    bookingMode:row.bookingMode || version.bookingMode || rules.bookingMode || 'INSTANT',
    confirmationSlaMinutes:version.confirmationSlaMinutes ?? rules.confirmationSlaMinutes ?? undefined,
    effectiveFrom:row.validFrom, effectiveTo:row.validTo,
    supplierBaseAmount:unit === 'PER_PERSON' ? row.supplierBaseAmount ?? version.supplierBaseAmount?.toString() : row.baseSellInr ?? version.supplierBaseAmount?.toString(),
    minPax:version.minPax ?? plan.minPax, maxPax:version.maxPax ?? plan.maxPax,
    cutOffMinutes:version.cutOffMinutes ?? plan.cutOffMinutes,
    maxPassengersPerResource:source.maxPassengersPerResource,
    timezone:source.pricingTimezone || 'Asia/Kolkata',
    pricingDays:source.pricingDays || ['MON','TUE','WED','THU','FRI','SAT','SUN'],
    pricingSlotCodes:source.pricingSlotCodes,
    ...(unit === 'PER_PERSON' ? {travellerPrices:prices as any} : {}),
    mrpMode:row.mrpInr ? 'YES' : source.mrpMode || (source.mrpAmount ? 'YES' : 'NO'),
    mrpAmount:row.mrpInr ?? source.mrpAmount, mrpProof:source.mrpProof,
    visitorPrices, visitorEligibilityBasis:source.visitorEligibilityBasis, visitorVerificationMode:source.visitorVerificationMode,
    cancellationRules:rules.cancellationRules ?? plan.cancellationRules,
  };
}

/** Split the upload at every existing boundary before inheriting blank cells. */
export function bulkRateSegments(versions: BulkRateVersion[], plan: BulkRateVersion, row: VendorBulkRateUpdateRowDto, variantId:string) {
  const from = date(row.validFrom,''), to = date(row.validTo,'');
  const history = bulkRateHistory(versions);
  const boundaries = [...new Set([from,to,...history.flatMap(range => [+range.effectiveFrom,+range.effectiveTo]).filter(value => value>from && value<to)])].sort((a,b)=>a-b);
  return boundaries.slice(0,-1).map((start,index) => {
    const end = boundaries[index+1];
    // Extending a selling period inherits the nearest existing commercial terms.
    const version = history.find(range => +range.effectiveFrom<=start && +range.effectiveTo>=end)?.value
      || [...versions].filter(item => date(item.effectiveFrom,'0001-01-01')<=start).sort((a,b)=>date(b.effectiveFrom,'0001-01-01')-date(a.effectiveFrom,'0001-01-01') || priority(a,b))[0]
      || [...versions].sort((a,b)=>date(a.effectiveFrom,'0001-01-01')-date(b.effectiveFrom,'0001-01-01') || priority(a,b))[0];
    const option = bulkRateOption(row,version,plan,variantId);
    option.effectiveFrom = new Date(start).toISOString().slice(0,10); option.effectiveTo = new Date(end).toISOString().slice(0,10);
    return {effectiveFrom:new Date(start),effectiveTo:new Date(end),version,option};
  });
}
