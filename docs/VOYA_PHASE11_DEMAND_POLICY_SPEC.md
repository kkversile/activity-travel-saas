# Phase 11 — Demand Policy Governance

Demand thresholds are not hard-coded in generation. A policy has a version, measurement window, future horizon, cooldown, lock version, and one rule per enabled signal type. Rule fields are validated by type:

- High demand: minimum searches, unique Agents, and maximum average Products; optional zero-result rate.
- Sold out: minimum searches, sold-out Session count, and sold-out rate.
- Cancellations: minimum confirmed bookings and cancellation rate.
- Price gap: minimum searches, ceiling-miss count, and ceiling-miss rate.
- Coverage: minimum searches, unique Agents, and zero-result rate.

The Admin Demand Policy workspace exposes draft creation/editing, type-specific rule fields, activation, retirement, status, version, and lock version. PRICE_GAP `minSearchCount` means minimum price-ceiling searches, not all marketplace searches.

Policy updates reject blank trimmed names with `DEMAND_POLICY_NAME_REQUIRED`. Retirement is a conditional ACTIVE-to-RETIRED transition inside a transaction, so concurrent retirement produces one audit transition and one `DEMAND_POLICY_NOT_ACTIVE` result.

New migrations create no active Demand policy. Raw observations continue without a policy; preview and generation return `DEMAND_POLICY_NOT_ACTIVE` until an Admin explicitly activates a validated draft. DRAFT policies use `expectedLockVersion`; ACTIVE policies are immutable and RETIRED policies are terminal. Rates are 0–1 and thresholds cannot be negative.
