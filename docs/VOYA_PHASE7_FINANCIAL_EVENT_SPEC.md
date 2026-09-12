# Phase 7 Financial Event Specification

## Phase 7.1 final integrity closure

`CANCELLATION_FINANCIAL_RESOLVED` is appended when Finance resolves an operational cancellation. An unresolved Vendor/Admin `BOOKING_CANCELLED` event is `PENDING` with `amount = null`; it records only known facts. A deterministic Agent cancellation is `POSTED` with `amount = cancellationCharge` and includes original amount, refund entitlement, policy fingerprint, matched rule, initiator, and economics snapshot identity. Events are never updated to change historical meaning. Refund completion records external evidence only.

`FinancialEvent` is append-only and uses a unique `eventKey` for deterministic idempotency. It contains Booking identity, optional cancellation/refund identity, event type/status, currency, amount, components, actor, reason/reference, and occurrence time.

## Types

- `BOOKING_CONFIRMED` — exactly one for each new canonical Instant, Vendor-confirmed, or Admin-confirmed booking. Legacy bookings are not backfilled.
- `BOOKING_CANCELLED` — appended when operational cancellation commits.
- `REFUND_CREATED` — appended when a positive refund instruction is created.
- `REFUND_CONFIRMED` — appended when Finance records an external reference.
- `REFUND_FAILED` — appended when Finance records failure.

Posted events are never rewritten to change economic meaning. Refund retry creates no false transfer event; a subsequent confirmation or failure appends its own transition event. Later Settlement may consume these events, but Settlement and Payout are outside Phase 7.

Canonical confirmation paths now write `BOOKING_CONFIRMED` inside the same transaction as the Booking state change, snapshot, and inventory transition. The five legacy bookings remain without fabricated financial events.
