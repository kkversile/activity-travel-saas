# VOYA Phase 12.1 — Final Distribution Closure

## Scope

This closure completes the distribution runtime around the canonical Phase 4–12 domain. It covers channel contracts, effective credential capabilities, Product/Variant/Rate Plan mapping state, inventory publication, catalog and availability safety, authoritative commercial eligibility, governance gates, event routing, and Admin operability.

## Runtime rules closed

- Active contract capability is the intersection of credential scopes and contract capabilities.
- Contract currencies are normalized to uppercase ISO alpha-3 values; pricing requires a currency.
- Channel, contract, mapping, inventory-rule, credential, and event changes write audit and Outbox evidence transactionally.
- Existing mapping/channel updates require optimistic versions. Activated external codes cannot change and `RETIRED` is terminal.
- Distribution eligibility uses verified vendor state, published current revision, active/effective Rate Plan, fulfilment policy, resource readiness, inventory, and exact hierarchy.
- Partner quoting reuses core booking eligibility without creating a fake Agent tenant. Commercial currency and booking mode come from the authoritative current commercial version.
- Catalog media is public-only; availability is date-only and bounded by the contract horizon; quote failures do not include price fields.
- Projector routing resolves real source resources and external mapping codes, leaves source Outbox status untouched, and is idempotent under retry.
- The legacy Admin VOYA_AGENT toggle delegates to canonical mapping state and preserves the existing channel identity.
- The Admin Distribution Control Tower is operational for contracts, hierarchy mappings, inventory rules, readiness gates, credential scope/expiry/revocation, structured event filters, channel type, and confirmed emergency disable.

## Migration

Migration `20260927100000_phase12_1_distribution_integrity` adds `DistributionChannel.version`, `ProductChannelMapping.activatedAt`, and `VariantChannelMapping.activatedAt`, backfills activation timestamps for already-active mappings, and adds supporting indexes. Prisma migration status is expected to report all migrations applied.

## Verification

Primary proof: `npm run verify:phase12-1` (`scripts/verify-phase12-1-distribution-integrity.ts`). It creates an isolated `PARTNER_API_*` fixture, runs the runtime/security/concurrency/governance/projector checks, asserts unchanged Booking/Hold/Allocation/Snapshot counts, and removes fixture rows in `finally`.

Regression remains the full Phase 4–12.1 verifier matrix plus backend/frontend production builds, Prisma validation/generation, Jest, `git diff --check`, and refreshed root archives. This phase does not introduce external booking, cancellation, payment, webhook delivery, settlement, or Phase 13 work.
