# Phase 12 Channel Mapping Specification

Canonical exposure is the hierarchy `ProductChannelMapping` -> `VariantChannelMapping` -> `RatePlanChannelMapping`.

Product and Variant mappings have `DRAFT`, `ACTIVE`, `DISABLED`, and `RETIRED` status, optimistic `version`, and unique `(channel, Voya entity)` and `(channel, external code)` constraints. Rate Plan mappings retain the old `enabled` field for compatibility but use `status` as the canonical field.

Product, Variant, and Rate Plan activation requires the parent hierarchy to be active on the same channel. A mapped entity may be distribution-ready while its current date/session is not bookable. Activation does not require the Product to be `LIVE`; readiness reports current Product, Variant, and Rate Plan state separately.

After an active mapping has exposed an external identifier, the identifier cannot be edited in place. Disable/retire and create a controlled replacement for remapping. No suffixes are fabricated for collisions.

## Phase 12.1 closure

Existing mapping writes require `expectedVersion` and use one conditional update with exactly one version increment. `activatedAt` makes external identifiers permanently immutable after first activation, `RETIRED` is terminal, and inventory rules use the same optimistic-concurrency contract. The Admin VOYA_AGENT compatibility endpoint now delegates to these canonical mapping writes.
