# Phase 10 Quality Policy and Scoring

Policies are DRAFT, ACTIVE, or RETIRED. Only one policy is ACTIVE, enforced by a PostgreSQL partial unique index. Activation is explicit, audited, and emits `SUPPLIER_QUALITY_POLICY_ACTIVATED`; migration creates none. RETIRED is terminal. A competing active policy must be explicitly retired before another draft is activated, and concurrent activation conflicts are controlled.

Rules define direction, target, warning threshold, weight, minimum sample size, missing-data treatment, and pass/warn/fail scores. For HIGHER_BETTER, target is at least warning. For LOWER_BETTER, target is at most warning. Invalid bands are rejected and never silently swapped.

`weightedScore = SUM(metricScore * weight) / SUM(participating weight)`, clamped to 0–100. EXCLUDE unavailable/insufficient metrics from the denominator; WARN and FAIL treatments use the configured score. All inputs and outputs are preserved in snapshot metric rows and source trace.

The current projection is read-only. Snapshot capture is explicit and immutable, keyed by vendor/window/policy. A later policy, tier, or booking change does not mutate historical rows. Draft PATCH requires `expectedLockVersion`; stale updates return `QUALITY_POLICY_VERSION_MISMATCH` and non-draft updates return `QUALITY_POLICY_NOT_DRAFT`.
