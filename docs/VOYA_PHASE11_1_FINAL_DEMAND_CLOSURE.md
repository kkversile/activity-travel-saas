# VOYA Phase 11.1 - Final Demand Closure

Phase 11.1 closes Demand Intelligence correctness and supply workflow gaps. Distribution is not started.

## Calculation rules

- HIGH_CANCELLATIONS uses only `CANONICAL` bookings with `confirmedAt != null`, service dates inside the historical measurement window, and statuses CONFIRMED, FULFILLED, REDEEMED, COMPLETED, or CANCELLED. Pending withdrawal, Vendor rejection, confirmation expiry, and LEGACY records are excluded.
- Search signals use `observedAt` for the measurement window and `serviceDate` inside the policy future horizon. Cancellation analysis remains historical and is not forced into the future horizon.
- Supply-demand grouping excludes currency. PRICE_GAP grouping includes currency and measures `priceCeilingSearchCount` only where `priceMax` and currency are present. Currencies are never averaged together.
- Zero-result coverage is classified as NO_CANDIDATE_SUPPLY, NO_DATED_SUPPLY, SOLD_OUT, or OTHER_ELIGIBILITY_GAP. Only the first two create COVERAGE_GAP opportunities; sold-out remains FREQUENT_SOLD_OUT.
- HIGH_DEMAND_LOW_SUPPLY currently means post-price-filter result Products. Agent-specific price mismatch is separately retained as PRICE_GAP evidence.

## Workflow closure

The Admin Demand page now has queue, Demand Policy, and Manual Opportunity workspaces. It supports type/status/priority/destination/category/owner/target/service-date filters with pagination, policy draft editing with `expectedLockVersion`, activation/retirement, manual creation, owner assignment restricted to active platform Admin/SubAdmin users, and reasoned priority overrides.

Vendor targeting is explicit and restricted to verified Vendors. Closed opportunities cannot receive new targets. Target rows are preserved as `REMOVED` with reason, actor, timestamp, audit, and `VENDOR_UNTARGETED` event. Vendor responses are terminal Interested/Declined outcomes protected by target optimistic versioning; first view creates one `VENDOR_VIEWED` event. Vendor Active and Responded/History views are available.

## Verifier evidence

`npm run verify:phase11` passed: 24 deliberate searches persisted as 24 observations, all five signals generated, policy activation succeeded, targeting/privacy/cooldown/concurrency checks passed, and Booking/Hold/Allocation state was unchanged.

`npm run verify:phase11-1` passed with:

- cancellation denominator 10, cancellations 2, rate 20%; pending, legacy, and rejected records excluded;
- future horizon included +30-day demand and excluded +120-day demand while retaining the observation;
- PRICE_GAP 5 price-ceiling searches, 5 misses, 100% miss rate among 100 total searches;
- coverage generated no-candidate and no-dated opportunities, excluding sold-out and cutoff cases;
- non-price grouping retained two differently denominated observations in one supply scope;
- closed targeting rejected, response race had one winner, and target history was preserved;
- no Product, Inventory, or Commercial mutation.

Fixtures are removed and baseline counts are restored after each verifier.
