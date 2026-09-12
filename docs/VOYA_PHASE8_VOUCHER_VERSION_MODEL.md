# VOYA Phase 8 Voucher Version Model

## Records

- `VoucherVersion` belongs to Booking and BookingFulfilment and has monotonically increasing `versionNumber` per booking.
- Generation claims determine the next version, stable `VCH-<BOOKING_CODE>-V<n>` code, and one `generatedAt` before PDF creation. Finalization persists exactly those values and requires the claim token plus aggregate version.
- Exactly one current version is permitted per fulfilment by a partial unique index.
- A version references a private `FileAsset`, source evidence fingerprint, content fingerprint, generated time, and supersession/void metadata.
- `FulfilmentEvidence` is versioned independently per kind and records replacement lineage with `replacesEvidenceId`.

## Content policy

The generator reads immutable BookingSnapshot, BookingTraveller, current evidence, and fulfilment snapshot data. It may include booking code, product/variant, service date/timezone, meeting point, pax, lead traveller, traveller-visible supplier references, redemption instructions, and operational/emergency contacts. It does not read live product policy for an existing booking and never includes vendor net, Voya margin, internal notes, pricing controls, or raw economics. Only current `travellerVisible=true` evidence is put into the traveller payload; hidden PNR/QR references and supplier attachments remain internal.

## Replacement behavior

When a ticket, QR token, PNR, or attachment is replaced, the old evidence becomes `SUPERSEDED`. Any current voucher becomes superseded. If readiness is satisfied, generation is queued. The next successful generation creates a new voucher version; cancelled bookings void current vouchers and do not expose them as valid.

## Failure and retry

Generation claim is `PENDING -> PROCESSING`; successful publication is `SUCCEEDED` plus `VOUCHER_READY`. Failure records a safe operator-facing error and leaves Booking unchanged. Retry moves a failed/succeeded job back to `PENDING`. The prior failure remains in audit/outbox/event history.
