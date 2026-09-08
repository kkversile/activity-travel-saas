# Source-to-demo mapping

## Vendor prototype

The prototype navigation is retained as working React screens:

- Dashboard
- Onboarding
- Listings / Add-Edit Activity
- Availability & Pricing
- Bookings
- Payouts
- Performance

The seven activity-builder sections are represented in the React activity editor. Commercial/logistics settings that can vary by rate plan are intentionally kept under rate plans rather than duplicated on the activity master.

## Activity Product Master – Final sheet

Core product fields mapped into typed `Activity` fields include product name/type/sub-type, descriptions, terms, FAQs, highlights, channels, hotel-link metadata, sub-category, merchandising labels, ranking/rating, safety/important/carry/additional information, meta/location and status.

Core rate-plan fields mapped into typed `RatePlan` fields include identity/status/description, validity, currency/unit, inventory flags, pax limits, affiliates, day validity, suitability, inclusions/exclusions, duration/meal/time, pickup/drop-off/vehicle, ticket/entry flags, voucher/confirmation/redeem behavior, pickup/cutoff and adult requirements.

Traveller age/count rules are normalized into `TravellerRule`; cancellation charge slabs are normalized into `CancellationRule`; date/slot capacity is normalized into `AvailabilitySlot`.

`sourcePayload` exists on Activity and RatePlan to preserve import-only or not-yet-normalized fields without blocking the demo or silently dropping future source data.
