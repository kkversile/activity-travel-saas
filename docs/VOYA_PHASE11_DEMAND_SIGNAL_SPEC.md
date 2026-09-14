# Phase 11 — Demand Signal Specification

Rates are stored as decimal fractions from 0 to 1. The observation window is policy-controlled and uses `observedAt`; scope uses normalized destination/category/sub-type and service date.

| Signal | Evidence | Triggered when |
|---|---|---|
| HIGH_DEMAND_LOW_SUPPLY | Search count, unique Agents, average result Products, zero-result rate | Policy minimum searches/Agents are met and average Products is at or below the policy ceiling |
| FREQUENT_SOLD_OUT | `INSUFFICIENT_INVENTORY` reason counts and deduplicated Session IDs | Sold-out search rate and unique sold-out Session threshold are met |
| HIGH_CANCELLATIONS | Booking service cohort and immutable snapshot scope | Confirmed service bookings meet the policy count and cancellation rate |
| PRICE_GAP | Currency-specific eligible prices before price filtering and stated price ceiling | Repeated price-ceiling misses prove matching supply exists above the requested ceiling |
| COVERAGE_GAP | Zero-result observations, candidate counts, failure reasons | Repeated zero-result demand has no suitable candidate supply and is not an inventory sold-out case |

No product, commercial component, Agent identity, raw query, competitor, Session ID, or confidential rate is exposed to Vendors. Raw query is never stored; only `queryPresent` and an optional SHA-256 normalized hash are retained.

Phase 11.2 coverage enforcement uses `coverageGapRate = coverageGapCount / searchCount`, where the numerator contains only `NO_CANDIDATE_SUPPLY` and `NO_DATED_SUPPLY`. `SOLD_OUT` and `OTHER_ELIGIBILITY_GAP` remain excluded from this numerator even when the overall zero-result rate is high.

Phase 11.1 rules: search signals use `observedAt` for the measurement window and require `serviceDate` inside the policy future horizon. HIGH_CANCELLATIONS uses a separate historical service-date cohort of `CANONICAL` bookings with `confirmedAt != null` and allowed confirmed statuses. Supply-demand keys exclude currency; PRICE_GAP keys include currency and uses only observations with both `priceMax` and currency as its denominator. Coverage classifies zero results as `NO_CANDIDATE_SUPPLY`, `NO_DATED_SUPPLY`, `SOLD_OUT`, or `OTHER_ELIGIBILITY_GAP`; only the first two create COVERAGE_GAP opportunities. HIGH_DEMAND_LOW_SUPPLY uses post-price-filter result Products as its explicit current metric meaning; personal price mismatch remains PRICE_GAP evidence.
