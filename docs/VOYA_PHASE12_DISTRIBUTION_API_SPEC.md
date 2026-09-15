# Phase 12 Normalized Distribution API

All external routes are versioned under `/api/distribution/v1` and authenticate using a Channel API key. Channel identity is never accepted from the request body.

## Catalog

`GET /catalog/products` and `GET /catalog/products/:externalProductCode` return only active mappings backed by the current `PUBLISHED` Product revision. The projection includes safe product, public media, variant, and rate-plan fields. Supplier cost, payable, margin, source payload, private files, quality, demand, settlement, and commercial rule configuration are excluded.

## Availability

`GET /availability` accepts external Product/Variant/Rate Plan codes and an authoritative date range. The contract horizon is enforced with `CHANNEL_AVAILABILITY_RANGE_EXCEEDED`. Availability is derived from canonical `InventoryState`; `EXACT_REMAINING` may return published remaining capacity, while `AVAILABLE_ONLY` returns only a boolean. Held, confirmed, resource IDs, and private notes are never exposed.

## Quote

`POST /quote` accepts external Rate Plan code, session, travellers, units, and optional permitted currency. It resolves the Channel contract and mappings, runs the existing commercial engine with authoritative channel context, applies inventory exposure, and returns a provisional safe amount and `quoteFingerprint`. It creates no Booking, Hold, or Allocation.

## Event feed

`GET /events` returns only the authenticated Channel's append-only projected events with cursor pagination. Consumers use `DistributionEvent.id` for at-least-once deduplication.

## Phase 12.1 closure

Availability requires explicit external Rate Plan code and date-only `YYYY-MM-DD` values; publication cannot exceed the active contract's future horizon. Catalog and quote responses expose only public media references and canonical current commercial currency/booking mode. Ineligible availability and quote responses are structured safe failures without price fields.
