# Phase 12 Migration and Verification

## Migration sequence

- `20260926100000_phase12_distribution_core_prepare`: additive enums, channel type, contract, mapping, inventory rule, credential, event, cursor, and optional commercial qualifier structures.
- `20260926110000_phase12_distribution_core_finalize`: classifies `VOYA_AGENT` as `INTERNAL_MARKETPLACE`, synchronizes canonical mapping status from legacy `enabled`, and adds consistency checks.
- `20260926120000_phase12_distribution_contract_guard`: PostgreSQL partial unique index enforcing one active contract per channel.

The legacy `RatePlanChannelMapping.enabled` column is retained as a compatibility field and constrained to agree with status. No historical Booking or BookingSnapshot is rewritten.

## Backfill

`scripts/backfill-phase12-distribution.ts` retains existing Channel identity, creates only the internal VOYA_AGENT contract, enriches existing VOYA_AGENT mappings with stable Product/Variant/Rate Plan codes, creates conservative exact-remaining inventory rules, and creates no external credentials or fabricated channels. It also establishes the independent projection boundary.

`scripts/audit-phase12-existing-channel.ts` is read-only and runs before mutation. The live audit is recorded in [VOYA_PHASE12_EXISTING_CHANNEL_MAPPING_AUDIT.md](VOYA_PHASE12_EXISTING_CHANNEL_MAPPING_AUDIT.md).

## Runtime verification

`npm run verify:phase12` uses an isolated `PHASE12_PARTNER_*` Channel and cleans only its Channel, mappings, contract, credential, projected events, audit rows, Outbox fixtures, and commercial fixture. It verifies normalized catalog, availability, quote, credential security, cross-channel isolation, contract concurrency, mapping uniqueness, event idempotency, and unchanged Booking/Hold/Allocation/Snapshot counts.

## Phase 12.1 verification

`npm run verify:phase12-1` uses an isolated `PARTNER_API_*` fixture and removes it in `finally`. It additionally verifies contract capability intersection and currency rules, credential scope and revoke races, vendor/fulfilment/rate-state gates, date-only and horizon rules, safe no-inventory/unsupported-currency failures, mapping and channel optimistic concurrency, immutable and retired mappings, Admin VOYA_AGENT delegation, real-resource event routing, projector idempotency, and unchanged booking/hold/allocation/snapshot counts.
