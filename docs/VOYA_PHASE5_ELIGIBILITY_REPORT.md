# Voya Phase 5 Eligibility Report

## Delivered

- Gate 0 bulk inventory status Apply now sends Preview's exact `scheduleVersion` and disables Apply when it is unavailable.
- Agent governance and explicit approval/suspension APIs with audit/outbox transitions.
- Normalized `VOYA_AGENT` channel mapping and admin enable/disable API with audit/outbox transitions.
- Central dynamic Eligibility Engine reused by marketplace search and Inspector.
- Read-only Agent search and traveller-safe Customer View.
- Deterministic ranking and stable tie-breakers.
- Role-specific Travel Agent shell with Marketplace and Customer View; Admin Eligibility Inspector shell.
- Phase 5 migration, controlled seed fixture, verification script, and specifications.
- Phase 5.1 final closure: transaction-client reuse, canonical traveller normalization, distinct Capacity/Inventory gates, direct Eligibility/Marketplace tests, context-preserving Customer View, structured filters, safe uploaded media URLs, and future-phase-safe Phase 4.1 verification.

## APIs

`POST /api/marketplace/search`, `POST /api/marketplace/products/:productId/view`, `GET /api/admin/agents`, `POST /api/admin/agents/:tenantId/approve`, `POST /api/admin/agents/:tenantId/suspend`, `POST /api/admin/rate-plans/:ratePlanId/agent-channel`, and `POST /api/admin/eligibility/inspect`.

## Explicit stop boundary

No Booking creation, idempotency, inventory holds, Vendor confirmation workflow, snapshots, cancellation, refunds, vouchers, fulfilment, or settlement were added.

## Phase 5.1 Final Eligibility Closure Verification

Agent permissions are explicit by organization role: OWNER, CATALOGUE, OPERATIONS, and VIEWER may search/view; FINANCE has no marketplace access by default. Vendor OWNER permissions are explicit and do not inherit Admin/Agent capabilities.

The evaluator supports `{ client: Prisma.TransactionClient }` and passes that same client to Commercial and Resource readiness. Product View preserves the exact submitted search date/traveller/units context and projects only the current published revision, public media URL, safe Variant details, eligible offers, and Agent-facing price.

## Phase 5.2 Final Closure

Final correctness coverage includes the unified `eligible` cutoff contract, a real missing-reference rejection, timezone-aware date-level cutoff evaluation, exact current-revision Sub-type filtering, explicit UNIT quantity propagation, and Customer View context preservation. The Admin Eligibility Inspector exposes the missing-cutoff failure as a normal gate diagnostic.

Marketplace candidate discovery uses deterministic cursor paging rather than a hidden `take: 250`; every candidate is evaluated before the 50-product response limit. DTO validation covers date-only service dates, non-negative duration/price values, rating 0–5, and HTTP 400 responses for inverted ranges. The database verification also exercises temporary missing-cutoff, explicit-cutoff, and UNIT-capacity fixtures and restores all changed records.
