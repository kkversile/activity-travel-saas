# VOYA Phase 8 Manifest and Redemption Specification

## Manifest

Manifest is vendor-owned and service-date scoped. It includes canonical bookings in confirmed, redeemed, or completed state and groups output by session and then by normalized pickup identity. Product, variant, local start time, timezone, and pickup/meeting-point data are sourced from BookingSnapshot. Booking rows expose booking code, pax, lead traveller name, current traveller-visible PNR where available, fulfilment/voucher status, and check-in status. Customer email, phone, financial amounts, supplier economics, and internal notes are excluded. A session never inherits the first booking's pickup for all bookings.

Both JSON and CSV exports are available. CSV values are escaped for commas, quotes, and line breaks. Filters support product, variant, schedule, and session.

## Check-in

Manual vendor check-in locks the Booking row, confirms vendor ownership and canonical identity, requires confirmed status and fulfilment readiness, creates one BookingRedemption, then transitions Booking to `REDEEMED`. A repeat check-in returns the existing redemption and does not create a second record.

## Completion

Completion locks the Booking, requires `REDEEMED`, and checks the snapshotted service `endsAt`. It transitions to `COMPLETED` with an audit/event record. If the snapshot has no end time, an explicit operational reason is mandatory.

## Future boundary

This is MVP-light manual redemption. Offline QR validation, cryptographic signatures, replay protection, and supplier-side scanning are future work and are not implied by the current QR-token evidence path.
