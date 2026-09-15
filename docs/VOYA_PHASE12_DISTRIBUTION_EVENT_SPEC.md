# Phase 12 Distribution Event Specification

`DistributionEvent` is a channel-specific current-state projection, not a second source of truth and not a copy of confidential Outbox JSON. Its payload tells the consumer which resource changed; the consumer re-fetches the normalized resource.

Supported types are `PRODUCT_CHANGED`, `VARIANT_CHANGED`, `RATE_CHANGED`, `AVAILABILITY_CHANGED`, `BOOKING_CHANGED`, and `MAPPING_CHANGED`.

`DistributionEventProjectorService` reads `OutboxEvent` without changing its status. It uses the independent `DistributionProjectionCursor`, a PostgreSQL advisory lock, ordered `(createdAt, id)` progress, and the unique event identity to provide idempotent projection under retries and concurrent projector instances. Quality, Demand, Finance, and Settlement events are not distributed by default.

Phase 12 provides an event feed only. It does not POST to arbitrary third-party webhook URLs.

## Phase 12.1 closure

Projection routing resolves real Product, ProductRevision, Variant, Rate Plan, Commercial Version, Schedule, Session, Inventory, Booking, Channel, and mapping resources from source events. It does not rely on a synthetic `payload.channelId` for core resource events, leaves source Outbox rows untouched, and keeps external resource codes in the projected event.
