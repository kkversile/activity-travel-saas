# Phase 12 Channel Contract Specification

`ChannelContract` is a versioned commercial, visibility, and distribution agreement attached to one `DistributionChannel`.

States are `DRAFT`, `ACTIVE`, and terminal `RETIRED`. Drafts are editable with `expectedLockVersion`. Active contracts are immutable. Activation locks the channel, refuses to silently retire an existing active contract, and returns `CHANNEL_ACTIVE_CONTRACT_EXISTS` when a competing active contract exists. Retirement is an explicit transaction that records audit and Outbox evidence.

Each contract declares capabilities (`CATALOG_READ`, `AVAILABILITY_READ`, `PRICING_READ`, `EVENT_READ`), allowed currencies, and an availability horizon. External authentication requires an active channel, an effective active contract, and the capability required by the endpoint.

The existing `VOYA_AGENT` contract is an internal compatibility backfill, not an external integration.

## Phase 12.1 closure

Contract currencies are trimmed, uppercased, deduplicated, and validated as ISO alpha-3 values; pricing capability requires at least one currency. Credential scopes are intersected with the active contract at authentication time, so activating a narrower contract immediately reduces existing credential power. Channel contract creation and activation serialize on the channel row and every change emits audit and Outbox evidence.
