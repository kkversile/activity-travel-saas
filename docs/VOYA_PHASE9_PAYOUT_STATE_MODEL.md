# Phase 9 — Payout State Model

Legacy payout rows remain separate with `recordType=LEGACY`. Canonical payout rows are created only for positive canonical settlement batches.

```text
READY_TO_RELEASE ──record release──> RELEASED ──matching reconcile──> RECONCILED
        │                                  │
        └─record failure──> RELEASE_FAILED ──retry──> READY_TO_RELEASE
                                             │
                                             └─failed/mismatched reconciliation──> RECONCILIATION_REQUIRED
```

Release is an accounting/control-plane record only. It records the external reference, actor, timestamp, attempt, payout event, batch transition, audit entry, and outbox event; it does not call a bank or payment provider.

Release is idempotent for the same reference and rejects a different reference after release. Failure creates a failed attempt and moves the batch to reconciliation review. Retry is explicit. Reconciliation compares the confirmed amount to the canonical payout amount and stores the reference, confirmed amount, actor, note, and resulting state.

Payout attempts are numbered per payout and retain the attempt outcome. Vendor views show canonical payouts and a separate legacy history projection.
