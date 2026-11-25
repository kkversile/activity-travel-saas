import { BadRequestException, ConflictException } from '@nestjs/common';
import { PricingUnit, TravellerType } from '@prisma/client';
import type { ActivityPriceOptionDto } from './catalogue.dto';
import { bulkRateSegments, type BulkRateVersion } from './bulk-rate-update';

/** Resolve a field patch against each date segment, never against the latest
 * version of an unrelated period. Existing full-save callers keep their API. */
export function activityPricePatchSegments(versions: BulkRateVersion[], plan: BulkRateVersion, patch: ActivityPriceOptionDto) {
  if (!versions.length) throw new ConflictException({ code: 'ACTIVITY_PRICES_VERSION_CONFLICT', message: 'Saved pricing is no longer available. Reload the activity and retry.' });
  return bulkRateSegments(versions, plan, {
    validFrom: patch.effectiveFrom!, validTo: patch.effectiveTo!,
  } as any, patch.variantId).map(segment => {
    const { updateMode, removeTravellerTypes, removeVisitorTypes, ...changes } = patch;
    const source = segment.version.sourcePayload || {};
    const inherited = segment.option;
    const option: ActivityPriceOptionDto = {
      ...inherited,
      ratePeriods: source.ratePeriods,
      availabilityBookingType: source.availabilityBookingType,
      openDatedValidityDays: source.openDatedValidityDays,
      availabilityBlackouts: source.availabilityBlackouts,
      availabilityStates: source.availabilityStates,
      ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
      effectiveFrom: segment.option.effectiveFrom,
      effectiveTo: segment.option.effectiveTo,
    };
    const sameBasis = option.pricingUnit === inherited.pricingUnit;
    const amounts = new Map((sameBasis ? inherited.travellerPrices || [] : []).map(price => [price.travellerType, price.amount]));
    if (sameBasis && option.pricingUnit === PricingUnit.PER_PERSON) {
      const removed = (removeTravellerTypes || []).find(type => amounts.has(type) ||
        (plan.travellerRules || []).some((rule: any) => rule.type === type && rule.maxCount > 0));
      if (removed) throw new BadRequestException({
        code: 'TRAVELLER_PRICE_REQUIRED',
        message: `${removed} already has a saved price or is enabled for this option. Keep a price for ${option.effectiveFrom} to ${option.effectiveTo}, or enter 0 for free admission. Existing ticket types cannot be removed by clearing a rate.`,
      });
    }
    for (const type of removeTravellerTypes || []) amounts.delete(type);
    for (const price of patch.travellerPrices || []) amounts.set(price.travellerType, price.amount);
    option.travellerPrices = option.pricingUnit === PricingUnit.PER_PERSON
      ? [...amounts].map(([travellerType, amount]) => ({ travellerType, amount })) : [];
    if (option.pricingUnit === PricingUnit.PER_PERSON) {
      const missing = (plan.travellerRules || []).filter((rule: any) => rule.maxCount > 0)
        .map((rule: any) => rule.type as TravellerType).filter((type: TravellerType) => !amounts.has(type) || amounts.get(type) === '');
      if (missing.length) throw new BadRequestException({
        code: 'TRAVELLER_PRICE_REQUIRED',
        message: `Enter a price for every enabled ticket type (${missing.join(', ')}) for ${option.effectiveFrom} to ${option.effectiveTo}, or enter 0 for free admission. Changing the pricing basis does not remove enabled ticket types.`,
      });
    }
    // A non-person version may retain visitor terms in its source payload.
    // Re-entering traveller prices must not discard those foreign prices.
    const visitors = new Map((sameBasis || option.pricingUnit === PricingUnit.PER_PERSON ? inherited.visitorPrices || [] : []).map(price => [price.travellerType, { ...price }]));
    for (const type of [...(removeVisitorTypes || []), ...(removeTravellerTypes || [])]) visitors.delete(type);
    for (const price of patch.visitorPrices || []) visitors.set(price.travellerType, { ...price });
    // Indian prices follow the ordinary category, including an adult-only edit.
    const changedTypes = new Set([...(patch.travellerPrices || []), ...(patch.visitorPrices || [])].map(price => price.travellerType));
    for (const [type, price] of visitors) if (changedTypes.has(type) && amounts.has(type)) price.indian = amounts.get(type)!;
    option.visitorPrices = option.pricingUnit === PricingUnit.PER_PERSON ? [...visitors.values()] : undefined;
    return { ...segment, option };
  });
}
