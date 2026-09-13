# Phase 9 — Settlement Engine Specification

## Policy and configuration

`FinanceConfiguration` is a singleton. Its initial state is `UNCONFIGURED`; no release can proceed until the collection model is explicit. `VendorSettlementPolicy` is one row per vendor. Existing vendors are seeded with `reviewRequired=true` and `active=false`, so activation is deliberate. An active policy must have `reviewRequired=false`; weekly settlement policies require a valid weekday.

The policy records cycle mode, eligibility trigger, delay days, optional weekly day, active state, review state, and version. The current implementation supports the manual preview/batch flow; cycle values are policy data and are not an automatic scheduler.

## Preview

Preview is read-only and returns eligible lines, blocked candidates, reason codes, component explanations, totals, policy snapshot, collection model, and a deterministic fingerprint. Tenant scope is derived from the authenticated vendor; an admin must select the vendor explicitly. An event already allocated to an active or settled batch is excluded. Holds, missing economics, unresolved cancellation liability, refund exceptions, policy review/inactive state, service-trigger failures, and settlement delay are surfaced as blocking reasons. Booking-linked adjustment events are aggregated into the booking line; standalone adjustments are separate lines and require an active settlement policy.

## Batch

Batch creation checks the preview fingerprint, locks source events in a serializable transaction, creates one line per booking or standalone adjustment, and allocates each source event once. A partial unique index prevents a source event from being actively allocated twice. A zero net closes as `CLOSED_NO_PAYOUT`; a negative net is rejected. Positive batches are `READY_FOR_PAYOUT` only for `VOYA_COLLECTS`; otherwise they are `PAYOUT_BLOCKED`.

The batch stores the policy snapshot and totals. It never creates a relationship to an existing legacy payout. `PAYOUT_BLOCKED` can be explicitly re-evaluated after configuration changes; only a positive batch that is then eligible creates the canonical `READY_TO_RELEASE` payout. Failure recording is allowed only from `READY_TO_RELEASE`, release moves allocations to `SETTLED`, and reconciliation is idempotent without reopening a released payout.

Audit is mandatory for Finance mutations. Outbox is emitted transactionally for meaningful batch/payout workflow transitions, while hold create/release and configuration/policy updates are intentionally Audit-only until a downstream notification consumer exists. Configuration and existing-policy writes use locked optimistic versions. The Admin Control Tower captures real operator evidence for release, failure, and reconciliation; it does not initiate bank transfers or generate synthetic references.
