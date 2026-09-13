# Phase 9 — Settlement Engine Specification

## Policy and configuration

`FinanceConfiguration` is a singleton. Its initial state is `UNCONFIGURED`; no release can proceed until the collection model is explicit. `VendorSettlementPolicy` is one row per vendor. Existing vendors are seeded with `reviewRequired=true` and `active=false`, so activation is deliberate.

The policy records cycle mode, eligibility trigger, delay days, optional weekly day, active state, review state, and version. The current implementation supports the manual preview/batch flow; cycle values are policy data and are not an automatic scheduler.

## Preview

Preview is read-only and returns eligible lines, blocked candidates, reason codes, component explanations, totals, policy snapshot, collection model, and a deterministic fingerprint. Tenant scope is derived from the authenticated vendor; an admin must select the vendor explicitly. An event already allocated to an active or settled batch is excluded. Holds, missing economics, unresolved cancellation liability, refund exceptions, policy review/inactive state, and service-trigger failures are surfaced as blocking reasons.

## Batch

Batch creation checks the preview fingerprint, locks source events in a serializable transaction, creates one line per booking or standalone adjustment, and allocates each source event once. A partial unique index prevents a source event from being actively allocated twice. A zero net closes as `CLOSED_NO_PAYOUT`; a negative net is rejected. Positive batches are `READY_FOR_PAYOUT` only for `VOYA_COLLECTS`; otherwise they are `PAYOUT_BLOCKED`.

The batch stores the policy snapshot and totals. It never creates a relationship to an existing legacy payout.
