# Voya Phase 9 — Settlement and Reconciliation Report

## Outcome

Phase 9 adds a canonical, auditable vendor settlement ledger and payout-control workflow. It preserves the legacy `Payout` history as `LEGACY` records and does not create settlement relationships for those rows.

Implemented capabilities:

- tenant-scoped financial events with vendor and optional agent dimensions;
- immutable vendor adjustment and cancellation-liability events;
- vendor settlement policy and finance-configuration controls;
- side-effect-free settlement preview with line-level component transparency;
- serializable settlement-batch creation with active-allocation uniqueness;
- explicit holds, blocked reasons, zero-net closure, and negative-net rejection;
- canonical payout release recording, failure, retry, and reconciliation;
- admin Settlement Control Tower and vendor earnings/payout projections;
- audit and outbox records for finance mutations.

The implementation intentionally does not perform bank transfers, payment-gateway calls, UPI transfers, automatic payout scheduling, tax filing, TDS/GST calculation, agent receivables, or quality scoring.

## Verification evidence

`npm run verify:phase9` passed against PostgreSQL. The isolated verifier proved reconciliation, immutable economics projection, hold release, the double-batch race, zero and negative net behavior, payout release/failure/retry, tenant isolation, and legacy preservation. The run preserved 3 legacy payout rows and cleaned its controlled fixtures.

Backend and frontend production builds also passed. Existing Phase 4 through Phase 8.2 verifiers and the existing Jest suite remain the regression gate and should be run after every deployment.
