# VOYA Phase 8.1 Final Closure

Phase 8.1 closes fulfilment runtime, security, worker, and portal gaps. Settlement, payout release, payment reconciliation, rescheduling, offline QR validation, OTA sync, and quality scoring remain out of scope.

## Runtime integrity

`BookingFulfilment` now carries `generationToken`, `generationClaimedAt`, and `generationLeaseExpiresAt`. A worker claims one `READY_FOR_VOUCHER` job with PostgreSQL `FOR UPDATE SKIP LOCKED`; pending work and expired processing leases are eligible. The claim assigns a new UUID token, increments attempts and aggregate version, and determines the next voucher version/code. Finalization and controlled failure require the same token and expected version, so a reclaimed or superseded worker cannot publish or overwrite a newer request.

The PDF, `VoucherVersion`, fingerprint payload, and generated timestamp share one claimed version/code/timestamp. Evidence fingerprints are SHA-256 hashes of the ordered current evidence identity (`kind`, version, reference, and file ID). Only current traveller-visible evidence is put into the traveller payload. Hidden PNR/QR references and supplier attachments are not placed in Voucher PDFs or Agent projections.

## API and security closure

Evidence shape rules are enforced in service code: PNR/QR require trimmed references and no file; ticket and supplier attachment kinds require a real uploaded file. Reference replacement is restricted to PNR/QR. Multipart fulfilment uploads are filtered to PDF/JPEG/PNG and limited to 10 MB at the interceptor; binary signatures remain validated in the service. Multipart booleans explicitly parse `true`/`false` strings.

Vendor rejection, manual rejection, confirmation expiry, and cancellation use the terminal fulfilment primitive. They set fulfilment to `VOIDED`, clear generation ownership, and defensively void a current voucher while retaining evidence history. Operational fulfilment events use `booking.vendorTenantId`; the audit actor remains the authenticated user.

## Portals

ProductBuilder canonicalizes AUTO, PNR_ONLY, TICKET_QR, and AFTER_FULFILMENT policy input. PNR_ONLY supplies PNR evidence/ALL semantics; TICKET_QR supplies ticket/QR choices and ANY semantics. The Vendor Fulfilment Centre provides queues, detail evidence actions, voucher retry, and pickup-grouped manifest export. Admin Fulfilment provides exception inspection and retry. Agent Bookings provides status, voucher download through the protected file endpoint, safe ticket/evidence access, and Download/Email/WhatsApp share actions. Delivery actions return/display `QUEUED`; the UI does not claim delivery occurred.

## Actual verification

- Migration: `20260919100000_phase8_1_fulfilment_runtime_integrity`, applied successfully; Prisma reports the database up to date.
- Direct Jest coverage: 46 suites / 220 tests passed, including five direct fulfilment suites covering policy modes, evidence shape/fingerprint, lifecycle tenant ownership, traveller-safe payload, and claim-token/version guards.
- DB verifier: `npm run verify:phase8-1` passed. It checked lease columns, policy modes, evidence shape rules, canonical fingerprint behavior, terminal fulfilment leakage, and post-migration marketplace impact. The Phase 8.2 PostgreSQL verifier additionally proves concurrent claims, lease recovery, stale-worker rejection, and terminal tenant audit/outbox ownership.
- Phase 8 verifier: `npm run verify:phase8` passed all 11 checks, including versioning, privacy, file authorization, retry, manifest, check-in, and cancellation guard.
- Backend and frontend production builds passed.

The Phase 8.1 DB verifier reports the current published-policy impact rather than hiding it: 19 published products, 2 valid fulfilment policies, and 17 review-required policies at verification time. Those migrated review-required policies remain blocked until resolved through the normal Draft → Review → Publish workflow.

Regression note: the former Phase 6.2 and Phase 7 verifier defects were corrected in the Phase 8.2 closure. See `docs/VOYA_PHASE8_2_REGRESSION_CLOSURE.md` for the exact compatibility changes and complete regression results.

Browser UAT was not claimed in this closure; no browser execution result is represented as a pass.
