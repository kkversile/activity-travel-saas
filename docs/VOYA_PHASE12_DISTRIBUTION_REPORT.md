# VOYA Phase 12 Distribution Report

Phase 12 adds a normalized Distribution Layer over the existing Voya catalogue, commercial, schedule, inventory, booking, and Outbox sources. It does not create a second Product, Inventory, Booking, payment, settlement, or OTA adapter master.

## Delivered

- Existing `VOYA_AGENT` was evolved in place and retained its live ID: `bea5761d-7fa4-4888-8f09-afbb48476904`.
- `VOYA_AGENT` is classified as `INTERNAL_MARKETPLACE` and has one controlled active internal contract.
- Product, Variant, and Rate Plan mappings use stable external identifiers with uniqueness and active-identifier immutability.
- `RatePlanChannelMapping.status` is canonical; `enabled` remains a derived compatibility field.
- Channel inventory exposure applies buffer and maximum publication limits without changing `InventoryState`.
- Optional `CommercialRule.distributionChannelId` implements channel-qualified precedence over an unqualified rule at equal business scope.
- Server-side Channel Eligibility explains contract, mapping, entity state, commercial, currency, and inventory-rule gates.
- Versioned normalized Catalog, Availability, Quote, and Event Feed APIs are exposed under `/api/distribution/v1`.
- API credentials are random, one-time-returned secrets stored only as SHA-256 hashes and prefixes.
- Distribution events are independent Outbox projections with an independent cursor, advisory lock, and idempotent uniqueness protection.
- Admin Distribution Control Tower navigation covers overview, channels, contracts, mappings, inventory rules, credentials, events, and readiness.

## Scope guardrails

No Viator, GetYourGuide, Booking.com, Expedia, channel-manager SDK, external booking creation, external cancellation, payment, OTA settlement, or arbitrary webhook delivery was introduced.

## Runtime evidence

The PostgreSQL-backed Phase 12 verifier creates and removes only an isolated `PHASE12_PARTNER_*` channel fixture. It proves contract activation race safety, mapping hierarchy, catalog privacy, availability buffer/cap behavior, quote read-only behavior and stable fingerprinting, channel-qualified commercials, cross-channel denial, secret storage, event projection idempotency, credential revocation, and unchanged booking/hold/allocation/snapshot counts.

See [VOYA_PHASE12_MIGRATION_VERIFICATION.md](VOYA_PHASE12_MIGRATION_VERIFICATION.md) and [VOYA_PHASE12_EXISTING_CHANNEL_MAPPING_AUDIT.md](VOYA_PHASE12_EXISTING_CHANNEL_MAPPING_AUDIT.md) for the evidence trail.

## Phase 12.1 closure

Phase 12.1 closes runtime, eligibility, event-routing, concurrency, and admin-operability gaps. The dedicated verifier uses an isolated `PARTNER_API` fixture, proves capability intersection, safe commercial behavior, date-only horizon enforcement, governance failures, mapping/channel races, immutable identifiers, terminal retirement, canonical legacy endpoint delegation, real-resource event projection, revoke idempotency, and unchanged booking/hold/allocation/snapshot counts.
