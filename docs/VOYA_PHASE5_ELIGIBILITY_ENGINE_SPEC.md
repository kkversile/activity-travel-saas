# Voya Phase 5 Eligibility Engine

Phase 5 derives current bookability at evaluation time. It does not persist an `isBookable` flag and it never creates a Booking, InventoryHold, or InventoryAllocation.

## Evaluation contract

`EligibilityService.evaluate({ agentTenantId, ratePlanId, sessionId, travellers, units?, channelCode?, now? }, { client? })` is framework-independent. `client` may be the root `PrismaService` or a `Prisma.TransactionClient`; the evaluator selects one client and uses it for every authoritative read, including Commercial and Resource readiness.

The authoritative order is: Agent governance, Vendor governance, Product/current published revision, Variant, Rate Plan/effective date, explicit `VOYA_AGENT` channel mapping, mapped Schedule, Service Session, cutoff, traveller compatibility, commercial evaluation, capacity consumption, InventoryState, and resource readiness.

Each gate returns `PASS`, `FAIL`, or `NOT_EVALUATED`, a stable reason code, a human-readable message, and safe details. `bookingMode` is separate from `eligible`; `VENDOR_CONFIRMATION` and `MANUAL_ON_REQUEST` can both be eligible.

## Reason codes

Governance: `AGENT_PROFILE_MISSING`, `AGENT_NOT_APPROVED`, `AGENT_SUSPENDED`, `VENDOR_NOT_VERIFIED`, `VENDOR_SUSPENDED`.

Catalogue/commercial setup: `PRODUCT_NOT_LIVE`, `PRODUCT_PUBLISHED_REVISION_MISSING`, `VARIANT_NOT_ACTIVE`, `RATEPLAN_NOT_ACTIVE`, `RATEPLAN_OUTSIDE_EFFECTIVE_RANGE`, `MARKETPLACE_CHANNEL_NOT_CONFIGURED`, `MARKETPLACE_CHANNEL_DISABLED`, `COMMERCIAL_NOT_READY`, `AGENT_COMMERCIAL_UNCONFIGURED`, `AGENT_ELIGIBILITY_UNCONFIGURED`, `AGENT_COMMERCIAL_DENIED`, `PRICE_NOT_CALCULABLE`.

Operations: `RATEPLAN_SCHEDULE_NOT_ELIGIBLE`, `SCHEDULE_NOT_ACTIVE`, `SCHEDULE_OUTSIDE_EFFECTIVE_RANGE`, `CAPACITY_UNIT_REVIEW_REQUIRED`, `SESSION_NOT_FOUND`, `SESSION_CLOSED`, `SESSION_BLACKOUT`, `SESSION_ARCHIVED`, `CUTOFF_REFERENCE_MISSING`, `CUTOFF_PASSED`, `UNIT_QUANTITY_REQUIRED`, `CAPACITY_CONSUMPTION_INVALID`, `INVENTORY_STATE_MISSING`, `INSUFFICIENT_INVENTORY`, `RESOURCE_NOT_READY`.

Traveller codes are `PAX_BELOW_MINIMUM`, `PAX_ABOVE_MAXIMUM`, `ADULT_REQUIRED`, `MINIMUM_ADULTS_NOT_MET`, and `TRAVELLER_COUNT_INVALID`.

## Cutoff and capacity

Timed sessions use `startsAt - cutOffMinutes`. Date-level sessions require `RatePlan.dateLevelCutoffTime` and convert `serviceDate + HH:mm` in `ScheduleTemplate.timezone` with the existing timezone helper before subtracting the cutoff. Missing references fail safely.

Travellers are normalized by type: duplicate rows are combined, zero rows removed, negative/non-integer quantities rejected, and at least one positive traveller is required. Every configured TravellerRule is checked against its requested count, including omitted types; unsupported positive types fail. `minPax`, `maxPax`, `adultRequired`, and `minAdultRequired` are then enforced. `PERSON` consumes total requested travellers, `BOOKING` consumes one, and `UNIT` requires explicit units. FOC discounts do not reduce operational consumption. Capacity consumption is a distinct `CAPACITY` gate; inventory availability is a separate, read-only `INVENTORY` gate.

## Commercial confidentiality

`CommercialService.evaluateInternal` reuses the Phase 3 resolver/calculator. Marketplace receives only `projectForAgent`: currency, pricing unit, booking mode, final Agent amount, tax/promotion summary, commercial readiness, and stable reason codes. Supplier basis, Vendor payable, Voya revenue/margin, internal rules, traces, source payloads, and private files are excluded.

## Phase 6 reuse

The intended Phase 6 seam is:

```ts
await prisma.$transaction(async (tx) => {
  // Phase 6 will lock InventoryState before this.
  const result = await eligibility.evaluate(input, { client: tx });
  if (!result.eligible) throw new Error('Eligibility failed');
  // Booking work is intentionally not implemented in Phase 5.1.
});
```

Phase 5 itself performs no locking or mutation. `PRICE_NOT_CALCULABLE` is returned when the resolved commercial result cannot produce a finite Agent-facing amount; underlying Commercial reason codes remain in diagnostics.

## Phase 5.1 Final Eligibility Closure Verification

Child suitability means a rate plan has a `CHILD` TravellerRule with `maxCount >= 1`. When children are actually requested, the normal traveller and Commercial gates remain authoritative.

## Phase 5.2 Final Closure

Cutoff results use one contract: `{ eligible, cutoffAt, code? }`. A timed session uses `startsAt`; a date-level session uses `dateLevelCutoffTime` interpreted in the schedule timezone. If neither reference exists, the CUTOFF gate is `FAIL` with `CUTOFF_REFERENCE_MISSING`; it is never treated as an eligible offer. The exact cutoff instant is blocked.

Marketplace `subType` is an exact case-insensitive filter on the current published Product Revision. `category` remains the broader Product Revision category (`type`, `subType`, or `subCategory`); the two concepts are documented separately. `UNIT` capacity requires an explicit positive integer `units`, consumes that many units, and does not change for FOC pricing.

Candidate rate plans are read in deterministic `id`-ordered cursor pages of 100. Every candidate is evaluated before the final `limit` (1–50) is applied to returned Products, so the limit is never a raw-candidate ceiling and Product View does not rely on search truncation.
