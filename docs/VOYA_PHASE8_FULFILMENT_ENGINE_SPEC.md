# VOYA Phase 8 Fulfilment Engine Specification

## Domain boundary

`BookingStatus` answers whether the commercial booking is pending, confirmed, cancelled, redeemed, or completed. `BookingFulfilmentStatus` answers whether the supplier fulfilment path is awaiting confirmation, waiting for evidence, ready for a voucher, voucher-ready, or voided. Fulfilment readiness is never encoded by adding states to BookingStatus.

## Policy contract

`ProductFulfilmentPolicy` is one-to-one with a ProductRevision. It stores mode, required evidence kinds, match mode, review flag, operations/emergency contacts, voucher notes, timestamps, and migration provenance. A published policy is valid only when its mode rules are satisfied:

| Mode | Published requirement |
|---|---|
| AUTO | No supplier evidence required |
| PNR_ONLY | `PNR_REFERENCE` is declared |
| TICKET_QR | Ticket or QR path is declared |
| AFTER_FULFILMENT | Explicit kinds plus `ALL`/`ANY`; no silent default |

Missing, unresolved, or invalid policies produce `FULFILMENT_POLICY_MISSING`, `FULFILMENT_POLICY_REVIEW_REQUIRED`, or `FULFILMENT_POLICY_INVALID` at eligibility.

## Runtime flow

1. Final Booking transaction reads the current published revision and snapshots policy.
2. The same transaction creates one BookingFulfilment row.
3. Confirmed AUTO bookings become `READY_FOR_VOUCHER` / `PENDING`; other modes wait for evidence.
4. The Booking transaction moves authoritative BookingFulfilment state to PENDING and emits an outbox event. The voucher worker polls BookingFulfilment state; the outbox is an integration/notification seam and is not the worker queue.
5. Worker claim locks the aggregate, increments attempts, generates outside the Booking transaction, then re-locks and rechecks cancellation/readiness/evidence fingerprint.
6. Finalization creates the next VoucherVersion and private FileAsset atomically.

## State and race rules

Evidence and voucher versions are immutable records. Current uniqueness is enforced with PostgreSQL partial unique indexes. Finalization rejects stale evidence and never publishes a stale voucher. Cancellation locks fulfilment before voiding vouchers. Retry is allowed for failed/succeeded generation but not voided/cancelled bookings.

## API surface

Vendor routes cover fulfilment list/detail, PNR/QR references, ticket/attachment upload, replacement, retry, and voucher projection. Agent routes cover traveller-safe voucher projection and audited sharing. Admin routes cover exception list/detail and retry. Manifest routes cover service-day JSON/CSV, manual check-in, and completion.
