# Production engineering notes

This repository is intentionally a **vendor-portal vertical slice**, not four duplicated applications. The same NestJS domain/API should later serve Admin/Sub-admin, Travel Agent and Customer experiences with role-specific frontends and authorization policies.

## Decisions already made

1. **Tenant isolation is server-side.** Vendor IDs are not trusted from request payloads. Vendor-owned Activity, RatePlan, Availability, Promotion, Booking and Payout queries are resolved through the authenticated tenant.
2. **Publishing is an approval workflow.** Vendor listings move `DRAFT -> UNDER_REVIEW`; only Admin/Sub-admin can move an item to `LIVE`. Editing a live listing as a vendor sends it back for review.
3. **Commercial rules are normalized.** Traveller rules, cancellation slabs and date/slot inventory are relational records rather than delimiter-heavy spreadsheet strings.
4. **Spreadsheet compatibility is retained.** `sourcePayload` preserves unmapped/import-only source fields while the canonical model evolves.
5. **Inventory writes use optimistic concurrency.** Slot updates carry the version read by the browser and reject stale writes instead of last-write-wins overwrites.
6. **Booking state transitions are guarded.** A pending booking cannot be confirmed twice; cancelled/completed states cannot be accidentally reconfirmed.
7. **Auth is fail-closed.** Weak/demo JWT secrets are rejected at startup and each bearer request re-checks the current user role, tenant and active status.

## Deliberately not invented

- Arbitrary standing/dynamic pricing rule precedence. Weekend/early-bird cards are visual prototype parity only until stacking, priority, channel, tax and rounding rules are approved.
- Binary document/media storage. Activity media URL records are persisted, but KYC document upload needs the chosen S3/blob provider, malware scanning and signed-URL policy.
- External channel adapters (Klook/MMT/GetYourGuide/etc.), webhook idempotency and outbox/retry processing.
- Customer-side booking creation, payment capture and inventory-hold semantics. The vendor demo manages incoming bookings; a production booking engine must atomically hold/decrement inventory to prevent oversell.
- Admin approval UI, Travel Agent portal and Customer portal. The API role model is prepared for these, but only the requested vendor UI is included.
- Full Excel import job. The schema is mapped from the Final sheet and seed data demonstrates it; production import should have row-level validation/error reporting and idempotent source keys.

## Before public go-live

- Convert the approved Prisma schema from `db push` bootstrap to checked-in, reviewed migrations and CI migration checks.
- Add refresh-token/session revocation strategy, login rate limiting, WAF and secrets-manager integration.
- Add end-to-end browser/API tests against disposable PostgreSQL in CI.
- Add audit events for every commercial mutation and immutable booking/payout history.
- Add OpenTelemetry/APM, structured logs, alerting and SLOs.
- Add DB backups/PITR, restore drills and connection pooling.
- Define timezone policy per activity/location; store instants in UTC and business-local dates/time zones explicitly.
- Define channel idempotency keys and transactional outbox before accepting external booking webhooks.
