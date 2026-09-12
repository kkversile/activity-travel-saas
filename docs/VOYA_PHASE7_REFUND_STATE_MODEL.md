# Phase 7 Refund State Model

## Phase 7.1 final integrity closure

Refund transitions lock the Refund row before reading its status. Confirm/fail races therefore have one winner; a repeated confirmation with the same external reference is idempotent, while a different reference is rejected. `FAILED -> PENDING` is explicit retry only. The UI says “Record refund completion”; it records external finance evidence and does not execute a payment.

`Refund` is a refund instruction, not a payment execution record.

| State | Meaning | Allowed next action |
|---|---|---|
| `PENDING` | Refund obligation/instruction recorded | Confirm, fail, or explicit retry after failure |
| `CONFIRMED` | External completion was recorded with a reference | No duplicate confirmation |
| `FAILED` | External/refund processing failed and is visible to Finance | Explicit retry to `PENDING` |

`Booking.status` remains `CANCELLED` throughout. `BookingCancellation.financialState` moves to `REFUND_PENDING`, `REFUNDED`, or `REFUND_FAILED`. A zero-entitlement cancellation uses `CANCELLED_NO_REFUND` and creates no Refund row.

Admin Finance endpoints are:

- `GET /admin/refunds`
- `POST /admin/refunds/:id/confirm` with `externalReference`
- `POST /admin/refunds/:id/fail` with a reason
- `POST /admin/refunds/:id/retry`
- `POST /admin/cancellations/:id/resolve-financial`

Every transition is audited and appends a FinancialEvent/BookingEvent where applicable. Failed history is not overwritten; retry changes only the current instruction state and preserves the previous failure event.
