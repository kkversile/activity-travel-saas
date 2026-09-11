# Booking State Model

## Record types

`LEGACY` is assigned to all five historical rows and may retain proven historical product/rate-plan references, but receives no fabricated agent, revision, variant, session, capacity, operational snapshot, economics snapshot, hold or allocation. `CANONICAL` is required for Phase 6 create.

## Statuses

`NEW` is transient and allowed only while the create transaction is open. Normal create commits as `CONFIRMED`, `PENDING_VENDOR_CONFIRMATION`, or `PENDING_MANUAL_REVIEW`. Later outcomes are `VENDOR_REJECTED`, `MANUAL_REJECTED`, `CONFIRMATION_EXPIRED`, plus retained legacy/later lifecycle values `PENDING`, `CANCELLED`, `FULFILLED`, `REDEEMED`, `COMPLETED`, `NO_SHOW`, and `CUSTOMER_CHANGE_REQUESTED`.

## Decisions and races

Booking rows are locked before confirm, reject, and expiry. Each operation rechecks ownership, status and deadline, then mutates hold/allocation and booking in one transaction. Exactly one decision wins; later operations receive a conflict or no-op. The Phase 6 DB harness verified the unique-key race: 2 simultaneous inserts produced 1 commit and 1 uniqueness conflict.
