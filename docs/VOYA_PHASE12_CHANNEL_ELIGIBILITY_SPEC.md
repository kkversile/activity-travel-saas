# Phase 12 Channel Eligibility Specification

Distribution readiness is server-side and explainable through `ChannelEligibilityService`. It is separate from date/session/traveller bookability.

The service evaluates `CHANNEL`, `CONTRACT`, `PRODUCT_MAPPING`, `VARIANT_MAPPING`, `RATE_PLAN_MAPPING`, `PRODUCT_STATE`, `VARIANT_STATE`, `RATE_PLAN_STATE`, `COMMERCIAL`, and `INVENTORY_RULE` gates. It returns `eligible`, ordered `gates`, and stable `reasonCodes`.

Stable examples include `CHANNEL_NOT_FOUND`, `CHANNEL_INACTIVE`, `CHANNEL_CONTRACT_MISSING`, `CHANNEL_CONTRACT_NOT_ACTIVE`, `CHANNEL_PRODUCT_NOT_MAPPED`, `CHANNEL_PRODUCT_MAPPING_DISABLED`, `CHANNEL_VARIANT_NOT_MAPPED`, `CHANNEL_VARIANT_MAPPING_DISABLED`, `CHANNEL_RATE_PLAN_NOT_MAPPED`, `CHANNEL_RATE_PLAN_MAPPING_DISABLED`, `CHANNEL_CURRENCY_NOT_ALLOWED`, `CHANNEL_INVENTORY_NOT_EXPOSED`, and `CHANNEL_MAX_UNITS_EXCEEDED`.

The pre-existing Agent consumers retain `MARKETPLACE_CHANNEL_NOT_CONFIGURED` and `MARKETPLACE_CHANNEL_DISABLED` through the existing Eligibility service.

## Phase 12.1 closure

Eligibility now also enforces verified, unsuspended vendor governance, current published Product revision, active Variant and Rate Plan state/effective dates, fulfilment policy validity, required inventory exposure, max-units limits, and exact Product–Variant–Rate Plan hierarchy. Partner quote evaluation reuses the core eligibility service with agent governance explicitly not evaluated; it never creates a fake agent tenant.
