# VOYA Phase 11 — Demand Intelligence Report

Phase 11 adds a demand-to-supply operating queue. Marketplace Search remains the source of Agent-facing results and remains read-only for business state. It now records one privacy-safe analytics observation per deliberate `searchAttemptId`; retries are deduplicated.

Search history begins at Phase 11 deployment. There is no historical search backfill and no inferred search demand from bookings. Before deployment, Search Observations, Demand Analysis Runs, and Demand Opportunities are zero. Existing Booking, Inventory, Cancellation, and immutable snapshot facts remain available for future cancellation/context analysis.

The five deterministic signals are HIGH_DEMAND_LOW_SUPPLY, FREQUENT_SOLD_OUT, HIGH_CANCELLATIONS, PRICE_GAP, and COVERAGE_GAP. Every system opportunity points to an immutable assessment and analysis run explaining its window, rule, scope, numerator/denominator or aggregate metrics, and recommended action.

The controlled verifier (`npm run verify:phase11`) confirms all five signals end to end, including a cancellation-backed signal, retry-safe observations, policy activation, lifecycle cooldown, concurrent generation uniqueness, verified-Vendor targeting/response, privacy-safe Vendor projection, and no Booking, Inventory Hold, or Inventory Allocation mutation. Its fixtures are removed after the run.

Demand recommends and routes work. It never creates Products, adds Inventory, creates Schedules, changes Rate Plans, changes Commercial rules, changes Marketplace ranking, or changes Supplier Tier. Supplier Tier and Supplier Quality may be shown as context only.

Phase 11.2 closes runtime correctness: COVERAGE_GAP uses `coverageGapCount / searchCount` and the configured `minZeroResultRate`; cancellation workflow identity excludes rolling measurement dates; concurrent first creation is serialized by a deterministic PostgreSQL advisory lock; and every persisted run candidate receives immutable Assessment evidence. Removed Vendor targets have no Vendor projection or detail access, while Admin audit history remains available.
