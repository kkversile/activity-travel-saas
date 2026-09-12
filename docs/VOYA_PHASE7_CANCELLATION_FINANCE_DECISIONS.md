# Phase 7 Cancellation Finance Decisions

## Phase 7.1 closure decisions

- Cross-tenant authorization is enforced from the authenticated Agent/Vendor tenant, never from idempotency-key secrecy.
- INR financial resolution accepts plain non-negative decimal strings with at most two fractional digits and enforces individual bounds plus rounded total equality.
- Vendor/Admin operational liability remains unresolved until Finance explicitly resolves it; no amount is invented in the pending cancellation event.
- Finance resolution is additive and immutable through `CANCELLATION_FINANCIAL_RESOLVED`, including when the refund entitlement is zero.
- Refund completion records an external reference only. Payment gateway, bank transfer, settlement, and payout execution remain outside this phase.

## Implemented decision

Agent/customer cancellation is calculated from the acknowledged immutable booking policy and final economics snapshot. Charge and refund entitlement are deterministic and visible to the Agent without exposing supplier basis, vendor payable, or Voya margin.

## Deliberately unresolved business decisions

The BRD does not yet provide an approved responsibility formula for the following cases:

- Agent/customer cancellation versus Vendor or Voya responsibility.
- Vendor operational cancellation.
- Weather, safety, and force majeure.
- Admin correction or goodwill adjustment.
- Whether pending bookings represent a collected payment or only an operational request.

Vendor and Admin operational cancellation therefore use `CANCELLED_PENDING_FINANCIAL`; the system does not infer liability from free-text reason or automatically apply the Agent penalty policy. Finance can resolve the amount using `resolve-financial`, which requires Decimal charge plus refund to equal the Booking amount and creates a Refund instruction only when the entitlement is positive.

## Future boundary

Settlement, vendor adjustments, payout release, gateway execution, bank transfer, and ledger posting require a later approved responsibility model. Phase 7 records auditable facts and instructions without claiming money moved.
