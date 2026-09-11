# Booking Engine Specification

## Atomic create

The create transaction loads the agent/vendor/product revision/variant/rate plan/session/channel context, computes a provisional mode, inserts a canonical `NEW` booking using the unique agent/key pair, locks `InventoryState` with `FOR UPDATE`, performs authoritative Eligibility and Commercial evaluation inside the same transaction, validates travellers/answers/policy acknowledgements, writes immutable snapshots, then creates either an allocation or a booking-linked hold and transitions the booking to its final status. Any error rolls back the root and inventory mutation.

## Idempotency

The key is required in `Idempotency-Key`. A same-agent retry with the same semantic fingerprint returns the existing booking. A different fingerprint returns `IDEMPOTENCY_KEY_REUSED` (409). The database uniqueness constraint is the concurrency boundary, so a duplicate cannot consume inventory independently.

## Modes

| Mode | Create result | Next action |
|---|---|---|
| INSTANT | confirmed allocation + `CONFIRMED` | none in Phase 6 |
| VENDOR_CONFIRMATION | active booking hold + `PENDING_VENDOR_CONFIRMATION` | vendor confirm/reject or SLA expiry |
| MANUAL_ON_REQUEST | active booking hold + `PENDING_MANUAL_REVIEW` | admin confirm/reject or SLA expiry |

Every pending booking snapshots `confirmationSlaMinutes`, `confirmationDueAt`, and the hold expiry. Generic inventory expiry ignores booking-linked holds.
