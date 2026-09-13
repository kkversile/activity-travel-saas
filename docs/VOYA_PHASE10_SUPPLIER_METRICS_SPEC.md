# Phase 10 Supplier Metrics Specification

All metrics use a vendor-scoped measurement window. SLA uses `Booking.recordType = CANONICAL`, `bookingMode = VENDOR_CONFIRMATION`, and `createdAt >= windowStart AND createdAt < windowEnd`; its observable denominator is due-at reached or terminal response. Service quality uses `recordType = CANONICAL`, `confirmedAt != null`, and `serviceDate` inside the window across INSTANT, VENDOR_CONFIRMATION, and MANUAL_ON_REQUEST. Numerators, denominators, sample size, unit, status, and source trace are returned/stored.

| Metric | Definition | Denominator | Missing/unavailable |
|---|---|---|---|
| Confirmation within SLA | Confirmed at or before `confirmationDueAt` | Observable cases: due date reached or terminal vendor response | Policy-controlled |
| Vendor response within SLA | Vendor confirm/reject at or before due time | Vendor responses | Policy-controlled |
| Average vendor response | Response timestamp minus booking creation | Vendor responses, non-negative | Policy-controlled |
| Confirmation overdue | Expired/overdue vendor-confirmation cases | Observable cases | Policy-controlled |
| Vendor cancellation | Vendor-initiated cancellation in confirmed service cohort | Confirmed canonical vendor bookings | Policy-controlled |
| Short-notice cancellation | Vendor cancellation within policy `shortNoticeDays` | Vendor cancellations | Policy-controlled |
| Voucher ready before service | Earliest non-void VoucherVersion generated before immutable `BookingSnapshot.sessionSnapshot.startsAt`; date-only fallback is local end-of-day in snapshot/service timezone | Confirmed bookings whose cancellation is not before the immutable service boundary | Policy-controlled |
| Fulfilment turnaround | First valid voucher-ready instant minus vendor confirmation | Same fulfilment-expected cohort; successful first voucher rows only | Policy-controlled |
| Last-minute stop-sell | BLACKOUT/CLOSED exception whose `createdAt` is within the configured service-calendar days before service | Unique affected Vendor ServiceSession IDs / Vendor service sessions | No stale-feed inference |
| Live image coverage | LIVE Product with current PUBLISHED Revision and active IMAGE media | LIVE products with published revision | Policy-controlled |
| Customer rating, NPS, complaints | Reserved for a first-class traveller-outcome source | N/A | `UNAVAILABLE`; no ProductRevision.starRating substitute |

The API exposes `UNAVAILABLE`/`INSUFFICIENT_DATA` rather than treating no data as good or bad. `UNAVAILABLE` means no authoritative source exists and always remains excluded from scoring; `INSUFFICIENT_DATA` means a measurable sample is below policy minimum and may use policy missing-data treatment. Traveller metrics explicitly say the feedback source is not configured.
