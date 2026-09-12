# Phase 7 Cancellation Engine Specification

## Phase 7.1 security closure

Agent and Vendor fast paths prove tenant ownership before returning an existing cancellation, including uniqueness-conflict reloads. Agent cancellation keys are random UUIDs retained across retries of one attempt. Refund and financial-resolution transactions lock their aggregate rows before reloading state, so concurrent losers receive current-state conflicts. Pending cancellations validate exactly one active hold, while confirmed cancellations validate exactly one confirmed allocation. Operational provenance is derived from `BookingSnapshot.sessionSnapshot` and `BookingSnapshot.serviceTimezone`.

## Source of truth

Existing canonical cancellations read `BookingSnapshot.cancellationPolicySnapshot`, `sessionSnapshot`, `serviceTimezone`, and `startsAt`, plus `BookingEconomicsSnapshot.finalAmount` and `currency`. Live RatePlan rules, products, and commercial prices are not consulted for the historical cancellation calculation.

## Policy algorithm

The service converts the current instant to the snapshotted service timezone using `Intl.DateTimeFormat`. It reads the snapshotted service date as a local calendar date and computes `daysBeforeService = serviceDateLocal - cancellationDateLocal`. The same local service date is day 0. If `now >= startsAt`, it returns `SERVICE_ALREADY_STARTED`. It matches exactly one inclusive rule. Zero matches returns `CANCELLATION_POLICY_NO_MATCH`; multiple matches returns `CANCELLATION_POLICY_AMBIGUOUS`.

## Money

All arithmetic uses Prisma Decimal. For percentage rules, `charge = base × chargeValue / 100`; for absolute rules, `charge = chargeValue`. Charge is clamped to `[0, base]`, rounded to two decimals, and `refundEntitlement = base - charge`. Positive refunds create a `PENDING` Refund instruction; zero refunds use `CANCELLED_NO_REFUND`.

## Transaction sequence

The cancellation transaction locks the Booking, validates ownership/state and the cancellation fingerprint, locks the current allocation or hold, releases it through the supplied transaction, creates `BookingCancellation`, changes Booking to `CANCELLED`, appends Booking/Financial events, creates a refund instruction when applicable, audits, and enqueues an outbox event. Any error rolls back the complete operation.

Confirmed canonical bookings require exactly one `CONFIRMED` allocation. Pending vendor/manual bookings may be withdrawn and release their active hold; their unresolved financial state is `CANCELLED_PENDING_FINANCIAL`.

## Initiators and confidentiality

Agent, Vendor, and Admin are persisted separately and emit distinct lifecycle event/outbox names. Agent responses do not expose supplier cost, vendor payable, Voya margin, or internal responsibility rules. Vendor cancellation does not apply the Agent penalty policy.

Gate 0 also reloads the final Product, Variant, RatePlan, and ServiceSession context after deterministic row locks and before final eligibility, commercial, fingerprint, question validation, and snapshot creation.
