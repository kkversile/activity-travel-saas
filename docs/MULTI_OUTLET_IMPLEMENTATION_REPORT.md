# Multi-outlet implementation and regression report

Reviewed and repaired on 17 November 2026. This report supersedes the earlier implementation summary. The original review is retained in `MULTI_OUTLET_REVIEW.md` as the record of defects found before repair.

## Delivered architecture

One legally registered vendor remains one `Tenant`, one legal/onboarding/KYC identity, and the existing unique-email authentication and functional roles. Outlets are operating locations, not separate legal businesses. OWNER has consolidated access; every other vendor user needs explicit active outlet grants. Separate legal entities must continue using separate tenants/onboarding.

The existing partner hub theme is retained. The outlet selector is visible on desktop and small screens, employees with one outlet see a scope label, switching remounts the current workspace and refreshes counts, URL navigation carries selection, and logout/account changes clear it. Owners can create/edit/deactivate/reactivate outlets, submit bank proof and beneficiary details, select verified shared/distinct banks, invite employees to outlets, and grant/revoke access. Resource creation is available in the existing Inventory resource workspace.

Products own an outlet; bookings derive attribution from the selected product on the server. Product/booking descendants use that parent ownership. Commercial pricing, catalogue revisions/media/questions/variants, inventory, sessions, schedules, resources, fulfilment/evidence, vouchers, manifests, reviews, promotions and downloadable reports enforce outlet access. Request context prevents a direct-ID request from accessing a different outlet than the explicit query selection. Agent/public distribution eligibility blocks inactive outlets without applying employee membership restrictions to agents.

## Resolution of the 11 review findings

| Finding | Repair and verification |
| --- | --- |
| 1. Resource index migration failure | Replaced DROP CONSTRAINT with DROP INDEX. Also corrected the payout week expression to use the immutable timestamp overload. Prisma deployment rehearsed against the pre-change schema with historical fixtures. |
| 2. Resource scope bypass | Central resolver now validates explicit and omitted selection before list query. Real HTTP A-to-B negative check and resolver tests. |
| 3. Commercial pricing bypass | Rate-plan/version parent outlet authorization before reads/creates/updates/activation. Unit tests cover all four paths; HTTP guessed-ID read/update denied. |
| 4. Private file bypass | Rate proofs, vouchers and fulfilment evidence resolve owning product/booking outlet before storage reads. Unit tests for each purpose and a real HTTP negative download. |
| 5. Cancellation deductions missing | Cancellation liability and held-payout credit events inherit outlet attribution. Actual database cancellation preview includes the -1000 deduction without rewriting the original economics snapshot. |
| 6. Revoked bank accepted at release | Request and approval validate and lock the issued payout's bank, currency, verification, tenant and snapshot identity. Bank reassignment leaves old snapshots intact. Negative maker/checker checks use the real database. |
| 7. Admin settlement UI incomplete | Admin outlet selection flows into preview/create; adjustment scope is explicit; bank review includes proof download and notes; payout table displays the issued bank snapshot and outlet. Browser preview for D shows its cancellation deduction. |
| 8. Mutation scope lost | Inventory preview/apply and resource creation accept the selected query scope. Real API checks cover resource creation and versioned inventory changes, including rejection of a different selected outlet. |
| 9. Deactivation blocks obligations | New-sales authorization remains active-only; existing booking/fulfilment operations can finish at inactive authorized outlets. Local HTTP completion is checked after deactivation. Historical records remain selectable/readable. |
| 10. Multiple defaults/race | Lifecycle changes serialize on the tenant row; select one deterministic replacement; a partial unique index enforces one default. Concurrent last-outlet deactivation leaves one active/default outlet. |
| 11. Review leakage | Review reads filter parent-product outlet and replies authorize ownership. Dashboard review/performance calculations also scope to outlet. Actual HTTP B-review reply denied for A. |

Additional repairs include catalogue nested-ID checks, fulfilment evidence-write authorization, buy-box product/bid scope, inactive-outlet distribution eligibility, atomic invitation grants/audits and acceptance validation, non-regranting backfills, collision-free outlet payout code suffixes, explicit default-outlet handling of vendor-wide adjustments, and retryable 409 responses for serializable settlement conflicts.

## Finance and compatibility rules

- Booking financial events use immutable booking attribution. Cancellation/refund economics remain based on existing snapshots; holds, maker/checker approvals and reconciliation rules remain in place.
- Manual adjustments declare an outlet or are stored as VENDOR_WIDE. Unattributed vendor-wide adjustments enter only the current default outlet's settlement. Event allocation prevents settling them again. Vendor-wide holds still affect all applicable outlets.
- Payout uniqueness is vendor + outlet + ISO week. Payout public codes retain the legacy MAIN form and use full distinct outlet codes for other outlets. Accounts shared by A/C and B/D still produce four separate payouts.
- New releases require the payout's own verified active beneficiary and matching currency. An ambiguous historical canonical payout with no outlet is blocked at both request and approval until reconciled; its immutable history is retained. They never substitute a new outlet bank for an issued snapshot. Vendors lacking outlet backfill fail closed rather than generating unverified tenant-wide payouts.
- Legacy single-location payouts receive the sole outlet without changing identifiers, amounts or status. Finance employees retain access. Ambiguous multi-outlet historical records stay unassigned and available to the owner in All outlets for review.
- Legal GST/PAN, onboarding and commission invoice identity remain at tenant level. Quality history produced before this feature remains a master-vendor snapshot: only owner aggregate views expose it. Current outlet quality metrics are computed from scoped product/booking/session data. Market-wide demand opportunities and legal-vendor targets remain shared commercial intelligence; product-specific bids are outlet-authorized.

## Migration and data rehearsal

Migration: `20261117100000_multi_outlet_core`. Expansion adds nullable attribution columns, outlet/bank/access/invitation tables, indexes, composite tenant constraints and weekly payout/default-outlet invariants. No required attribution column becomes NOT NULL before reconciliation. No prisma migrate reset or db push was used, and no existing application database was reset. Only the named disposable rehearsal databases were recreated.

`backfill-multi-outlet.ts` is dry-run by default and requires `--apply` for writes. It refuses non-loopback database hosts. It creates/reuses one default outlet, attributes products/resources/bookings/booking-linked events, assigns only unambiguous batches and payouts, preserves existing member grant/revocation decisions, and reports remaining rows. Verified onboarding beneficiaries migrate only with encrypted details, verification provenance and a verified bank proof; masked-only profiles never become verified usable accounts.

Initial synthetic database work used isolated PostgreSQL 16 at `127.0.0.1:55439`, with databases `voya_outlet_baseline` and `voya_outlet_deploy`. The subsequent authorized staging-copy review inspected the live demo read-only and captured a logical snapshot. It restored and rehearsed that actual snapshot on isolated PostgreSQL 16 and matching PostgreSQL 15.20 copies. The live application/database remain unchanged. See `MULTI_OUTLET_STAGING_REHEARSAL.md` for source preflight, fixes, evidence and the deployment runbook.

`rehearse-multi-outlet.cjs` refuses any other host/port/database. It builds the pre-change schema from repository revision `a599c635b6cb940713cd5b274fd52a51c3179bc6`, inserts legacy records before migration, baselines the 97 previous migration records in this disposable database, executes the new migration through `prisma migrate deploy`, runs backfill twice, and checks original amounts/snapshots/IDs. Evidence: `multi-outlet-evidence/migration-rehearsal.json`.

A clean chronological install of the old migration chain has a pre-existing ordering defect: `20260914110000_phase11_1_demand_integrity` references `DemandTargetStatus` before its defining migration. Historical applied migrations/checksums were not edited. Existing installations and a documented baseline can deploy the outlet migration; a fresh install must use a reviewed baseline rather than assuming that old chain runs from zero.

## Verification

Final validation results:

| Check | Result |
| --- | --- |
| Backend Jest | 115 suites, 675 tests passed |
| Frontend Vitest | 45 files, 241 tests passed |
| Prisma validate and prisma:generate | Passed; generation required stopping the local API to release Windows' DLL lock, then succeeded |
| Backend Nest build | Passed |
| Frontend TypeScript/Vite build | Passed; existing bundle-size warning |
| Prisma deploy/backfill rehearsal | Passed against the fixture baseline and the actual live snapshot on PostgreSQL 16 and 15.20; idempotency and 121 original table fingerprints verified |
| Existing-user staging HTTP smoke | 150 successful checks, 13 active accounts, three historical report downloads, unchanged financial fingerprints |
| Local PostgreSQL/Nest API verification | 20 scenarios passed; case list in local-integration.json |
| git diff --check | Passed |

The frontend reconciliation error-focus assertion now waits for its existing asynchronous focus effect, retaining the focus requirement rather than weakening it. Evidence includes:

- Backend Jest suite, including additional isolation/finance regression cases.
- Frontend Vitest suite, including vendor query scope, credential resets and admin bank review.
- Prisma validation and client generation; backend/frontend production builds.
- `multi-outlet-evidence/local-integration.json`: actual PostgreSQL + Nest HTTP checks with live JWT/user lookup, grants, IDs, private downloads, invitations, bank proof upload, inventory mutation, cancellation, fulfilment and settlements.
- `multi-outlet-evidence/concurrency-proof.json`: concurrent settlement outcomes and one resulting payout.
- Browser screenshots: `owner-all.jpg`, `owner-outlet-a.jpg`, `employee-a.jpg`, `admin-outlet-settlements.jpg`. Owner all displays all four bookings; A displays one; A employee has no all-outlet selector; admin shows X/Y bank snapshots and an outlet-specific negative adjustment preview.

The unit fixtures for pre-existing catalogue business rules deliberately assume an authorized workspace. Security tests use the actual resolver, and local HTTP tests exercise guards and database ownership instead of bypassing them.

## Follow-up release-readiness review

A fresh regression sweep found and fixed an additional API/UI contract defect: `listTeam` omitted the `active` field of outlet grants while the owner checkbox UI depended on it. Existing grants could appear unchecked and prevent reliable revocation through the screen. The API now includes the flag. A frontend interaction test verifies a checked grant sends `active:false` when cleared, and the real HTTP integration test verifies checked-grant data plus owner-driven revoke/regrant and employee access enforcement. The complete backend and frontend suites and builds were repeated after this repair; all passed (675 backend, 241 frontend tests), as did 20 local integration scenarios. Latest raw logs replace the earlier copies in the evidence folder.

The subsequent authorized staging-copy rehearsal completed the actual target checks. The migration and repeatable backfill passed against the restored real history and data on both PostgreSQL 16 and matching PostgreSQL 15.20. All 121 original application tables retained business data; there are no unresolved attribution rows or unpaid canonical beneficiary blockers. All 150 HTTP checks passed against the 13 existing active accounts on each tested copy. Real data prompted fixes for three legacy report exports and two adjustment-only historical settlement batches; no historical financial values or beneficiary snapshots were invented. The implementation is ready for a controlled, approved deployment with migration/backfill, rather than a code-only restart. See `MULTI_OUTLET_STAGING_REHEARSAL.md` for inherited drift, bank readiness, exact evidence and cutover/rollback instructions. No live change or push was performed.

Manual acceptance steps and local account details: `MULTI_OUTLET_TEST_GUIDE.md`.

## Local demo and API contracts

The local app is left running at `http://127.0.0.1:3007/`, backed by the isolated API on port 4007. The final Codex browser tab remains open.

Disposable credentials (never use on a public environment): password `LocalOutlet@123`; owner `owner@abc.local`, A catalogue employee `a@abc.local`, A operations employee `operations-a@abc.local`, multi-outlet operations employee `ac@abc.local`, admin maker `maker@platform.local`, checker `checker@platform.local`. All banking information and documents are clearly marked illustrative demonstration material. No bank transfer is performed.

1. Owner: Home → All outlets, then A/B/C/D. Team & settings → outlet edit/bank/member management. Bank X belongs to A/C; Y belongs to B/D.
2. A employee: only A data; one scope label. Multi-outlet employee: choose A or C. Guessed B IDs are denied by APIs.
3. Admin: Finance → choose ABC and an outlet → Preview. D retains the cancellation deduction. Inspect four separate issued payout snapshots. Pending illustrative bank Z demonstrates proof/note review controls.
4. Inventory: choose an outlet, manage resources and preview/apply versioned capacity changes. New sales from inactive outlets are rejected; valid existing obligations remain actionable.

Key endpoints: `/vendor/outlets`, `/vendor/bank-accounts`, `/vendor/outlets/:id/bank-account`, `/vendor/outlets/:outletId/members/:memberId`, `/vendor/admin/vendors/:tenantId/outlets`, `/vendor/admin/bank-accounts/pending`, `/vendor/admin/bank-accounts/:id/review`, extended existing team, catalogue, booking, inventory, report, performance, settlement and payout endpoints. Owner aggregate reads omit `outletId`; selected operations use a query/DTO ID which is validated against current permissions. Banks never return ciphertext or full account numbers in list/create responses.

To restart the existing isolated local demo, run in the backend directory:

```powershell
$env:DATABASE_URL = 'postgresql://voya_local@127.0.0.1:55439/voya_outlet_baseline?schema=public'
npm run verify:multi-outlet:local -- --serve
```

Run frontend development with `VITE_API_BASE_URL=/api` so Vite proxies to that local API. The rehearsal command is `npm run rehearse:multi-outlet` with `DATABASE_URL` explicitly set to the disposable `voya_outlet_deploy` database on port 55439. It intentionally refuses to overwrite an existing rehearsal database. These commands require the isolated local PostgreSQL instance already described above; none use the workspace's configured database implicitly.

## Controlled rollout and rollback

1. Obtain approval before production migration or deployment. A read-only source snapshot and actual migration/drift checks were completed; take a fresh approved-window backup and repeat freshness checks before cutover.
2. Apply the additive migration while the previous app remains deployed, dry-run the backfill, review orphan/ambiguous counts and verified-bank provenance, then apply and repeat it to verify idempotency. Resolve reported rows before enabling affected operations.
3. Compare original booking/event/payout/invoice IDs, financial sums and snapshots. Confirm default-outlet and tenant constraints and independent shared-bank settlements. Run the supplied local/API negative cases against a staging copy.
4. Deploy compatible backend and frontend together only after approval; provision grants and verify owner vs employee views. No real payout release is part of this rollout.
5. Before multi-outlet use begins, an application rollback can retain expansion tables/columns and use a later attribution catch-up. Once multiple outlets/employees are in use, keep vendor access paused and fix forward or use an explicitly reviewed restricted rollback: the prior tenant-wide app cannot enforce outlet permissions. Never drop outlet data or rewrite issued finance records as an automatic down migration.

Residual limits: inherited migration checksum/schema drift and one unselected historical missing document described in the staging report; genuine bank review still required for ten outlets; old fresh-install migration ordering described above; existing Vite bundle-size warning; no exhaustive guarantee about every possible concurrency interleaving. The verified local scenarios and complete available test suites define the evidence for regression assessment. There is no outstanding failure intentionally concealed as a passing check.

## File inventory

See `MULTI_OUTLET_CHANGED_FILES.txt` for the complete source/migration/test inventory. Unrelated archives, documents and existing untracked artifacts were not staged or removed. Changes remain in the working tree; no production deployment or DB change was made.
