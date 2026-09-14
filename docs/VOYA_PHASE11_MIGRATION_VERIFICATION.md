# Phase 11 — Migration Verification

Migration: `20260924100000_phase11_demand_intelligence_core`.

The migration adds the Demand enums, append-only `MarketplaceSearchObservation`, policy/rule, analysis run, opportunity, immutable assessment, Vendor target, and event tables with restrictive governance foreign keys. PostgreSQL partial unique indexes enforce one ACTIVE Demand policy and one OPEN/ACKNOWLEDGED/IN_PROGRESS opportunity per `opportunityKey`.

No Demand backfill is included. Expected initial counts after migration: Search observations = 0, Opportunities = 0, Active Demand policies = 0. Existing historical Booking/Inventory/Cancellation facts are not rewritten.

Verification commands:

```text
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate status
npx jest src/demand --runInBand
npm run build
npm run verify:phase11
npm run verify:phase11-1
```

The Phase 11 runtime verifier uses isolated fixtures and proves all five signal types: high demand/low supply, frequent sold out, high cancellations, price gap, and coverage gap. It also proves retry dedupe, one active policy, immutable explainable assessments, verified-Vendor targeting, Vendor response privacy, lifecycle cooldown suppression, parallel generation uniqueness, and no Booking/Hold/Allocation mutation. It removes only its own fixtures and restores the pre-run counts; it must never delete genuine Agent observations.

Latest controlled run: 24 deliberate searches persisted as 24 observations; five signal types generated; one verified Vendor targeted, viewed, and responded INTERESTED; cooldown suppressed the resolved opportunity on rerun; two parallel generations produced zero duplicate active keys; business-state mutation check passed.

Phase 11.2 verification adds coverage-rate threshold proof, rolling cancellation-key stability, fresh-create concurrency with one Assessment per Analysis Run candidate, mandatory UUID v4 `searchAttemptId` validation and retry dedupe, removed-target access revocation, Active/History separation, retarget provenance, and policy governance races. Phase 6.2 and Phase 7 now create and clean up their own future ScheduleTemplate, RatePlanSchedule, ServiceSession, and InventoryState fixtures rather than mutating ambient supply.
