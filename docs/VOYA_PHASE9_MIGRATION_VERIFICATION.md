# Phase 9 — Migration and Verification Runbook

## Migration order

1. Take a fresh logical PostgreSQL backup and record baseline counts.
2. Apply `20260920100000_phase9_settlement_ledger_prepare`.
3. Run `npm run backfill:phase9`.
4. Apply `20260920110000_phase9_settlement_ledger_finalize`.
5. Run `npm run verify:phase9` and all existing Phase 4–8.2 verifiers.

For this workspace, both pending migrations were applied together by Prisma's deployment command before the idempotent backfill was run. The prepare migration itself also safely enriches booking-linked ledger dimensions, so the applied result is equivalent for existing data and no reset or legacy rewrite occurred.

The prepare migration adds enums, nullable dimensions, new tables, and deterministic enrichment of booking-linked events. The idempotent backfill ensures the finance singleton and vendor policies exist and marks all pre-existing payout rows as `LEGACY`. The finalize migration adds required vendor tenancy, foreign keys, indexes, monetary/scope checks, and the partial unique index for active allocations. No data reset or legacy deletion is part of the process.

## Phase 9 verifier coverage

The PostgreSQL verifier creates controlled fixtures and cleans them up: reconciliation, immutable economics projection, unresolved cancellation/adjustment pathways, holds and release, double-batch race, zero and negative net, canonical payout release/failure/retry/reconciliation, tenant isolation, and legacy row preservation. It reports a non-zero exit code on any failed assertion.

## Current evidence

The Phase 9 backfill completed with 13 vendor policies, 59 enriched financial events, 30 confirmed events with vendor amounts, zero batches created, zero fabricated payout relationships, and zero fabricated cancellation liabilities. The verifier passed with 3 legacy payout rows before and after the run.
