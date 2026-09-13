# Phase 9 — Finance Decisions

1. **Ledger boundary:** financial events are immutable historical facts; operational booking/refund/cancellation states are not collapsed into settlement status.
2. **Tenant boundary:** vendor scope comes from the authenticated identity for vendor reads. Admin mutations carry an explicit vendor tenant and are checked server-side.
3. **Economics boundary:** settlement uses the booking economics snapshot and never derives vendor liability from the customer refund amount.
4. **Cancellation boundary:** cancellation vendor liability is unresolved until finance records original payable, final payable, and signed delta with reason and reference. The deterministic cancellation key makes resolution idempotent.
5. **Policy boundary:** existing vendors require review and explicit activation. Configuration starts `UNCONFIGURED`.
6. **Collection boundary:** only `VOYA_COLLECTS` can produce a releasable canonical payout. Other modes block payout release rather than implying money movement.
7. **Concurrency boundary:** serializable transactions, source-event row locks, version fields, and partial active-allocation uniqueness protect double settlement.
8. **Legacy boundary:** old payout rows are never rewritten into canonical batches, lines, allocations, or payout events.
9. **Scope boundary:** Phase 9 records and reconciles payout control evidence but intentionally excludes payment execution, scheduling, tax filing, receivables, and quality scoring.
