# VOYA Phase 8 Fulfilment Core Report

## Outcome

Phase 8 adds a revision-safe fulfilment path from a confirmed canonical Booking to supplier evidence, traveller-safe voucher versions, vendor manifest operations, MVP-light manual redemption, and audited sharing. Existing BookingStatus, cancellation/refund, catalogue, commercial, inventory, and eligibility state machines remain separate and were not redesigned.

Implemented modes:

- `AUTO`: a confirmed booking is ready for asynchronous voucher generation.
- `PNR_ONLY`: a current `PNR_REFERENCE` is required.
- `TICKET_QR`: a current ticket file or QR token is required.
- `AFTER_FULFILMENT`: explicit evidence kinds are evaluated with `ALL` or `ANY` semantics.

## Safety properties

- Product fulfilment policy is attached to `ProductRevision`, cloned with a revision, and editable only while the revision is `DRAFT`.
- Eligibility checks a published, valid, reviewed policy; it does not require supplier evidence during search.
- New canonical bookings snapshot policy identity, mode, evidence requirements, contacts, notes, and redemption instructions.
- One `BookingFulfilment` aggregate is created with the booking. Voucher generation is requested transactionally and performed after commit by a worker.
- Evidence is append-only by version, with one current row per evidence kind. Replacement supersedes the prior row and causes a new voucher version.
- Voucher PDFs contain traveller/operational information only; supplier net, Voya margin, and internal controls are excluded.
- Cancellation voids the current voucher and stops pending generation. A failed generation leaves Booking status unchanged and can be retried.
- Private voucher/evidence files authorize through their domain relationship and tenant/role, not a file `tenantId` shortcut.
- Agent share actions create audit/outbox records. Email/WhatsApp is reported as queued, never falsely reported as delivered.
- Manifest output is service-day scoped, grouped by session, minimizes traveller data, and supports CSV export.
- Check-in is manual and idempotent; completion requires redeemed state and an ended service (or an explicit reason where no end time exists).

## Verification evidence

`npm run verify:phase8` passed against the configured PostgreSQL database with isolated temporary data that was removed in cleanup. It covered policy readiness, snapshot/aggregate persistence, voucher versioning, generation failure/retry, evidence replacement, private-file authorization, manifest privacy, check-in/completion, and cancellation voiding. The verifier reported 3 voucher versions and 2 current evidence kinds for its temporary booking.

The full current test baseline is 41 suites / 205 tests. Phase 4.1, 4.2, 5, 6, 6.2, 7, 7.1, and 8 verifiers are intended to be run from `activity-saas-backend`.

## Explicitly out of scope

Settlement, payout, payment capture, refund redesign, supplier API integration, customer messaging delivery, and offline QR cryptographic validation are not implemented in Phase 8. Offline QR remains a future authenticated validation capability.
