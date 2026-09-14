# VOYA Phase 11.2 — Final Demand Runtime Closure

Phase 11.2 closes the Demand runtime, deduplication, target-access, and regression-fixture review. No schema migration was required.

## Runtime correctness

- `COVERAGE_GAP` stores `coverageGapCount` and `coverageGapRate`. The numerator contains only `NO_CANDIDATE_SUPPLY` and `NO_DATED_SUPPLY`; `SOLD_OUT` and `OTHER_ELIGIBILITY_GAP` are excluded. The configured `minZeroResultRate` is enforced against that rate.
- `HIGH_CANCELLATIONS` uses stable business identity: type, destination, category, and subtype. Rolling measurement dates remain only in the Assessment window/source trace. Display service dates are null for this workflow type.
- Generation captures one `analysisNow`, sorts candidates, and takes a deterministic 60-bit PostgreSQL advisory transaction lock per opportunity key. It re-reads active and cooldown state after locking and never recovers a duplicate-key error inside an aborted transaction.
- Every candidate recorded on an Analysis Run receives one immutable Assessment, including candidates attached to an existing or cooldown-suppressed workflow row. Existing workflows receive an `ASSESSMENT_ADDED` event with run, policy, and assessment identifiers.

## Marketplace and Vendor access

`MarketplaceSearchDto.searchAttemptId` is mandatory UUID v4. A client creates one ID for one deliberate search and reuses it for transport retries; a new deliberate search gets a new ID. The ID is analytics-attempt identity only and is not marketplace result idempotency.

Removed targets are excluded from Vendor list/detail/view/respond authorization. Vendor Active contains only TARGETED and VIEWED. Vendor Responded/History contains INTERESTED, DECLINED, and ACTION_TAKEN; REMOVED remains Admin-only. Retargeting re-stamps the current Admin and timestamp, clears the previous response cycle, increments the target version, and records `VENDOR_RETARGETED` plus Audit history.

Targeting re-checks Vendor kind and VERIFIED status inside the mutation transaction. Manual opportunities emit the same transactional `DEMAND_OPPORTUNITY_OPENED` Outbox contract as system opportunities.

## Policy governance

Policy updates reject blank trimmed names. Retirement is an ACTIVE-to-RETIRED conditional transition inside a transaction; concurrent retirement produces one successful transition and one `DEMAND_POLICY_NOT_ACTIVE` result, with one retirement audit event.

## Regression-fixture closure

Phase 6.2 and Phase 7 now create their own temporary active ScheduleTemplate, RatePlanSchedule mapping, eight future PERSON sessions, and InventoryState rows. The old fallback that unblocked shared seeded sessions was removed. Fixtures and temporary cancellation rules are removed after each run, and baseline business counts are restored.

## Verification evidence

`npm run verify:phase11-2` proves:

- 10 searches with one coverage gap do not trigger at a 0.5 threshold; 10 searches with six gaps trigger at a 0.6 rate.
- Shifted cancellation windows reuse one stable key with null display dates.
- Two fresh simultaneous generations produce one active opportunity, two valid runs, and two assessments pointing to that opportunity.
- Missing `searchAttemptId` fails validation and retrying the same ID persists one observation.
- Removed Vendor targets lose list, detail, view, and respond access while Admin history remains.
- Active/History projections, retarget provenance, blank policy name rejection, and retirement race safety hold.

The full Phase 4–11.2 verifier matrix passes. Jest passes with 65 suites and 269 tests. Backend and frontend production builds pass. Prisma reports 30 migrations and an up-to-date database. Controlled verifier cleanup restores genuine records and does not mutate business data.

Distribution was not started. Phase 11.2 is the stop point for this execution.
