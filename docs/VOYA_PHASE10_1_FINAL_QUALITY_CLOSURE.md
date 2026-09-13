# Voya Phase 10.1 Final Quality Closure

Phase 10.1 corrects the Phase 10 metric cohorts and governance controls without redesigning Booking, Fulfilment, Inventory, Marketplace, Commercial, Settlement, or Payout models.

## Corrected calculation contract

- SLA is request-time scoped to canonical Vendor-confirmation bookings created in `[windowStart, windowEnd)`. Observable requests are due-at reached or terminally responded/expired. Vendor response includes both confirm and reject; expiry is not a response.
- Cancellation and fulfilment are service-date scoped to confirmed canonical bookings across all three booking modes. Vendor cancellation counts only `CancellationInitiator.VENDOR`; short notice uses `daysBeforeService <= shortNoticeDays` with vendor cancellations as denominator.
- Voucher readiness uses the earliest valid non-void voucher. Fulfilment excludes only cancellations before the immutable service boundary; cancellations at or after that boundary remain obligations. Readiness is compared with snapshot `startsAt` when present, or local service-date end-of-day using the booking-era timezone. Turnaround uses that same first ready instant and cohort.
- Stop-sell uses `ScheduleException.createdAt`, not evaluation time, and counts unique affected ServiceSession IDs. Slot exceptions affect only matching slots; global exceptions affect all sessions for the schedule/date.
- Traveller rating, NPS, and complaints remain `UNAVAILABLE`, score-excluded, and issue-free until a first-class feedback source exists. `INSUFFICIENT_DATA` is reserved for measurable data below policy minimum.

## Governance closure

Metric dimension/direction must match the canonical registry. Policy names cannot be blank, nested DTOs are validated, and draft PATCH requires `expectedLockVersion`. A PostgreSQL partial unique index guarantees one ACTIVE policy. Activation locks the active/candidate rows, rejects active-policy conflicts with a stable code, and cannot reactivate RETIRED policy. Tier bands require strict ELITE-to-RESTRICTED ordering and a zero Restricted floor when recommendation rules are present.

Quality governance tables now have tenant/user/snapshot foreign keys. Tier evidence is ownership checked. Tier assignment and issue transitions are state-safe; issue mutation and audit are one transaction. Auto-resolution is audited.

## UI and reproducibility

Admin Quality includes overview/vendor quality/issues/policy/tier governance surfaces; vendor Performance includes current metrics, unavailable traveller outcome messaging, and policy-versioned assessment history. Admin quality lists are paginated and expensive current computations are limited to the requested page. `backend-src.zip` contains `src/`, `package.json`, `prisma/`, and `scripts/`.
