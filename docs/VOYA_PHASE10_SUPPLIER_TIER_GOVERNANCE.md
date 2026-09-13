# Phase 10 Supplier Tier Governance

SupplierTier values are ELITE, PREFERRED, STANDARD, WATCHLIST, and RESTRICTED. They describe governance visibility and monitoring only. They are not verification status, readiness, product quality, settlement state, eligibility, or suspension.

An active policy can recommend a tier from configured tier rules. It never changes the governed tier automatically. Admin tier changes close the current assignment and create a new effective-dated row, preserving history, audit, and `SUPPLIER_TIER_CHANGED` outbox event. There is one current assignment per vendor through a PostgreSQL partial unique index.

No tier changes marketplace ranking, eligibility, commercial rules, settlement cycle, payout delay, promotion eligibility, or automatic suspension.
