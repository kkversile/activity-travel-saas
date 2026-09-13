# Voya Phase 9 — Settlement and Reconciliation Report

## Outcome

Phase 9.1 closes the canonical, auditable vendor settlement ledger and payout-control workflow. It preserves the legacy `Payout` history as `LEGACY` records and does not create settlement relationships for those rows.

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

Calculation and state-machine guarantees:

- A booking line is `BOOKING_CONFIRMED.vendorAmount` plus every signed, linked `VENDOR_ADJUSTMENT`; an adjustment-only line has a zero base and signed net amount.
- Negative individual lines remain open for review; a batch with a negative aggregate is blocked with `NEGATIVE_NET_PAYABLE`. Zero-net lines close as `CLOSED_NO_PAYOUT`.
- Preview fingerprints and optional source-event selections are re-checked inside a serializable transaction. The transaction re-resolves events, bookings, holds, policy, and configuration, so stale previews cannot create an incorrect batch.
- Currency is mandatory and normalized to an uppercase three-letter code. Booking-linked adjustments must match the booking currency. Settlement delay is represented by `triggerAt`/`eligibleAt` and is enforced at batch creation.
- Vendor, booking, and event holds are independently surfaced with stable reason codes; unrelated blocked rows do not prevent eligible rows from batching.
- Payout transitions are monotonic: only `READY_TO_RELEASE` can record failure or release; release settles allocations; reconciliation is idempotent and cannot reopen a released payout.
- Cancellation resolution is transaction-locked and requires the immutable economics snapshot plus vendor payable. Refund `PENDING`, `CONFIRMED`, and `FAILED` remain distinct states.
- Confirmed promotions with a known funder create `PROMOTION_FUNDED` events with `vendorAmount=null`; they are excluded from vendor payable.

The implementation intentionally does not perform bank transfers, payment-gateway calls, UPI transfers, automatic payout scheduling, tax filing, TDS/GST calculation, agent receivables, or quality scoring.

## Verification evidence

`npm run verify:phase9` and the alias `npm run verify:phase9-1` passed against PostgreSQL. The real canonical Booking proof reconciled INR 1,499 base vendor payable with a linked −INR 1 adjustment to INR 1,498 net, while the Booking economics snapshot remained unchanged. The verifier also proved hold release, the double-batch race, zero and negative net behavior, payout release/failure/retry, tenant isolation, and legacy preservation. Each run preserved 3 legacy payout rows and cleaned its controlled fixtures.

The direct Finance Jest contract suite passed 5 suites / 11 tests. The full backend Jest suite passed 51 suites / 231 tests. The Phase 4.1–9.1 verifier matrix passed, including Phase 6.2, 7, 7.1, 8, 8.1, 8.2, 9, and 9.1. Phase 7.1 specifically passed refund and financial-resolution races, money constraints, event semantics, and cross-tenant cancellation checks.

During regression, the earlier Phase 6.2/7 delay was diagnosed as slow remote PostgreSQL fixture execution, compounded by an overstrict one-adult fixture precondition and Phase 7 cleanup masking setup errors. The verifiers now use the actual one-adult contract, temporarily normalize only the isolated seeded session capacity, restore exact state in `finally`, and emit bounded progress markers. Both verifiers complete with `cleanup: complete` and unchanged before/after baseline counts.

Backend and frontend production builds passed. Migration `20260921100000_phase9_1_settlement_financial_integrity` is applied and Prisma reports the database up to date. Phase 9.2 required no new migration. The requested root archives were refreshed: `frontend-src.zip` contains `src/` and `package.json`; `backend-src.zip` contains `src/`, `package.json`, `prisma/`, and `scripts/`. No commit or push was performed.
