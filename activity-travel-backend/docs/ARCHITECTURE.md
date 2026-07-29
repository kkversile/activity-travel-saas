# Backend Architecture

## Tenant isolation

Every tenant-owned record includes `tenantId`.

The current header-based tenant context is development-only. Codex should replace it with authenticated user membership.

## Money

Store money as integer minor units.

Example:

```text
₹1,500.00 = 150000
```

Never use floating-point values for commercial calculations.

## Booking capacity

Booking creation uses:

- an idempotency key,
- a serializable PostgreSQL transaction,
- a conditional atomic capacity update.

Codex should add transaction retry handling and concurrent integration tests.

## Time

Store timestamps in UTC.

Store an IANA timezone such as `Asia/Kolkata` on each activity for local display and booking-cutoff calculation.
