# Voya Phase 10 — Supplier Quality, SLA, Performance & Governance

Phase 10 adds supplier-quality measurement and governance without changing catalogue, commercial, inventory, eligibility, booking, cancellation/refund, fulfilment, settlement, or payout calculations.

## Delivered

- Read-only live performance projection at `GET /vendor/performance`.
- Immutable historical snapshots captured only by an explicit admin action.
- Versioned draft/active/retired quality policies with optimistic draft concurrency.
- Configurable metric thresholds, weights, missing-data treatment, score, and tier bands.
- Recommendation is separate from the current governed tier.
- Tier assignment history uses a PostgreSQL partial unique index for one current assignment.
- Quality issues have OPEN, ACKNOWLEDGED, RESOLVED, and DISMISSED lifecycle states.
- Vendor and admin tenant-safe APIs and permissions.
- Vendor Performance and Admin Quality screens use backend data; no decorative quality numbers remain.

No automatic suspension, marketplace boost, ranking change, settlement change, payout acceleration/penalty, customer review system, demand opportunity system, AI scoring, or quality worker was added.

## Policy state

The migrations do not create or activate a policy. With no active policy, raw operational metrics remain visible while score and recommendation are `null` and the UI says **Quality scoring policy not active**.

## Quality, readiness, and bookability

`VendorProfile.readinessScore` remains the existing onboarding/readiness signal. It is not used as supplier quality and is never displayed in the quality-score column. Bookability and marketplace eligibility remain their existing rule-driven systems and do not consume SupplierTier.
