# Voya Phase 5 Migration Verification

Migrations:

- `20260911110000_phase5_eligibility_search_core` adds the Phase 5 schema: `AgentVerificationStatus`, `AgentProfile`, `DistributionChannel`, `RatePlanChannelMapping`, and nullable `RatePlan.dateLevelCutoffTime`, with keys, indexes, and foreign keys.
- `20260911113000_phase5_agent_profile_backfill` creates an explicit `PENDING` `AgentProfile` for historical `TRAVEL_AGENT` tenants that do not already have one. No historical Agent is auto-approved.

Existing rate plans are not auto-published to the Agent channel.

Pre-migration safety: a logical PostgreSQL backup was created at `activity-saas-backend/backups/phase5-pre-migration.sql` using a PostgreSQL 18 client. The migration was applied with `prisma migrate deploy`; no database reset was used.

The idempotent seed creates the controlled `agent@voya.demo` tenant/user/profile, explicitly approves that profile for the demo, creates `VOYA_AGENT`, maps only the controlled demo rate plan, and adds Agent commercial/eligibility rules. Other historical rate plans remain unlisted.

Verification command: `npm run verify:phase5`. It evaluates a passing offer, temporarily tests blackout, insufficient inventory, and suspended Vendor gates, runs marketplace search, and asserts held/confirmed counters plus Hold, Allocation, and Booking counts are identical before and after.

## Phase 5.1 Final Eligibility Closure Verification

`npx prisma migrate status` confirms both migrations are applied. The Phase 4.1 verifier keeps strict invariant checks but reports historical count assumptions as informational drift so later legitimate fixtures do not fail the integrity run.

## Phase 5.2 Final Closure

No migration was added for the corrective pass. Verification extends the existing controlled-fixture run with a temporary session missing both timed and date-level cutoff references, an explicit timezone-aware date-level cutoff, and a UNIT-capacity session tested with no units and with two units. The script restores session, rate-plan, schedule, inventory, and Vendor-profile values in `finally` and compares before/after counts and inventory counters.
