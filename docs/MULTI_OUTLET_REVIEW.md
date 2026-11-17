# Multi-outlet implementation review

Reviewed 17 November 2026 against the complete `VOYA_Multi_Outlet_Codex_Prompt.md` and the current working tree. Verdict: partially implemented; not ready for migration/deployment. The earlier completion wording overstated readiness. Passing backend unit tests do not establish outlet isolation or finance correctness end to end.

## Findings

### 1. P1 — Migration cannot replace the Resource unique index

`activity-saas-backend/prisma/migrations/20261117100000_multi_outlet_core/migration.sql:128` uses `ALTER TABLE "Resource" DROP CONSTRAINT "Resource_tenantId_resourceCode_key"`. The original migration (`20260914090000_phase4_inventory_core_prepare/migration.sql:272`) creates this object with `CREATE UNIQUE INDEX`, not a table constraint. A database built from the committed migration history will reject that statement. Use the correct index operation and rehearse the full migration chain in disposable PostgreSQL before rollout. No database was touched during this review.

### 2. P1 — Resource list accepts unauthorized outlet selection

`activity-saas-backend/src/resources/resources.service.ts:17` loads the caller's allowed outlets but discards that restriction whenever an `outletId` is supplied. An employee assigned only A can request `/resources?outletId=B` and query B's resources in the same tenant. Reproduced using the compiled service and an in-memory Prisma double: the resulting predicate was `{tenantId: 'vendor-1', outletId: {equals: 'outlet-b'}}` despite allowed outlets being only `outlet-a`. Use the central resolver for both explicit and omitted scope.

### 3. P1 — Commercial pricing endpoints bypass outlet permissions

`activity-saas-backend/src/commercial/commercial.service.ts:31` authorizes a rate plan by tenant only. The separate version lookups at lines 113 and 144 do the same. Vendor commercial GET/create/update/activate routes are exposed by `commercial.controller.ts` and are not routed through the newly secured RatePlansService. A catalogue employee from A with the appropriate functional permission can read or modify B's prices using a known rate plan/version ID. Add parent-product outlet authorization to every commercial direct-ID operation.

### 4. P1 — Private voucher, evidence and rate-proof downloads remain tenant-wide

`activity-saas-backend/src/files/files.service.ts:25` checks a rate-proof revision against tenant only; vendor voucher/evidence branches at lines 42 and 51 check only booking tenant plus functional permission. An A employee can download B's private documents using a file ID, even when the fulfilment page denies access. Resolve the owning product/booking outlet before reading storage. This is a gap against the prompt's private download isolation requirement.

### 5. P1 — Cancellation settlement adjustments disappear from outlet previews

`activity-saas-backend/src/finance/finance.service.ts:823` writes cancellation liability `VENDOR_ADJUSTMENT` events with booking/vendor but no `outletId`. `buildPreview` filters events to the chosen outlet at line 249, including automatic selection for single-outlet vendors. Therefore a later reduction in vendor entitlement can be omitted from settlement, risking overpayment. The one-time backfill cannot fix newly created rows continuously. Attribute the adjustment from the cancellation booking in the write transaction and test cancellation followed by outlet settlement.

### 6. P1 — Payout approval does not revalidate its bank beneficiary

`activity-saas-backend/src/finance/finance.service.ts:1124` approves a release after validating status, amount, holds and collection mode, but does not check the payout's snapshotted bank account remains active and VERIFIED. Bank verification is checked when creating/re-evaluating a payout, not when requesting/approving release. An admin can reject a previously verified account through the review endpoint while its payout is pending; approval can still mark that payout RELEASED. Validate the payout's own bank account under the release transaction, preserving its existing beneficiary snapshot rather than substituting a newly selected outlet bank.

### 7. P1 — Admin cannot create a multi-outlet settlement from the UI

`activity-saas-frontend/src/pages/AdminSettlements.tsx:105` sends only vendor and currency to preview; `createBatch` at line 106 also omits outlet. There is no outlet selection in this screen. The backend rejects omitted scope for vendors with more than one outlet (`finance.service.ts:237`). Thus the core settlement workflow stops working as soon as a second outlet is added. Add outlet selection and carry it through preview, creation, adjustments and bank review workflows. The frontend also has no consumer of the new bank-review APIs, leaving the promised admin verification flow incomplete.

### 8. P1 — Inventory mutations lose the selected outlet between frontend and backend

`activity-saas-frontend/src/api.ts:208` attaches outlet selection only as a query parameter. `activity-saas-backend/src/inventory/inventory.controller.ts:25` and `:26` accept only body DTOs for bulk preview/apply. The service reads `dto.outletId`, while the unchanged Inventory page bodies omit it. Owners and employees with several outlets receive a selection error even after selecting an outlet in the shell. Read/validate the query selection consistently or explicitly put the selected outlet into these DTOs. The resource create endpoint has the same query-versus-body mismatch for multi-outlet callers.

### 9. P1 — Deactivating an outlet prevents valid existing fulfilment

`activity-saas-backend/src/vendor-outlets/vendor-outlet-access.service.ts:31` filters inactive outlets from mutation authorization. Fulfilment voucher reads, check-in and completion all call this resolver with `mutation: true` (`fulfilment.service.ts:33`, `:88`, `:89`). The outlet update API permits deactivation without preserving an obligation-completion path. Existing confirmed bookings can no longer be redeemed/completed, contrary to prompt rule 9. Distinguish new sales/listings from operations needed to finish historical obligations; retain readable inactive-outlet selection in the shell.

### 10. P2 — Deactivating default marks every remaining outlet as default

`activity-saas-backend/src/vendor-outlets/vendor-outlets.service.ts:82` uses `updateMany` to set `isDefault: true` on all other active outlets. With A/B/C, deactivating default A makes both B and C default. Reproduced with an in-memory transaction double. Select one deterministic replacement and update atomically. There is no database invariant enforcing a single default, and the active-count check also runs outside the transaction, allowing concurrent deactivations to leave zero active outlets.

### 11. P1 — Reviews still expose and modify other outlets' records

`activity-saas-backend/src/vendor-reviews/vendor-reviews.service.ts:52` lists all published reviews in the tenant, and line 65 replies to any review ID in the tenant. Neither filters by product outlet or calls outlet authorization. Performance/review screens remain cross-outlet even though report exports gained some outlet predicates. Secure these service operations and complete the remaining secondary-route audit required by the prompt.

## Tests and evidence

- Fresh backend and frontend production builds: passed. Frontend retains the large-chunk warning.
- Fresh backend `npm test -- --runInBand`: **114 suites passed; 657 tests passed**. These tests miss the defects above; most legacy service tests instantiate optional outlet dependencies without an authorization service and therefore do not exercise production scope behavior.
- Fresh frontend `npm test`: **40 files passed, 2 failed; 233 tests passed, 2 failed**.
  - `PartnerHubPages.test.tsx:243`: invitation payload assertion now fails because the implementation adds `outletIds: []`. This is introduced test incompatibility; add meaningful single/multi-outlet invite coverage and update the contract expectation.
  - `Login.test.tsx:18`: expects the previous hero heading. Login and its test have no working-tree changes relative to HEAD, so this appears to be an existing copy/test mismatch; no clean-baseline test run was performed to prove its origin.
- Resource list bypass and multiple-default update reproduced using compiled services and mocked Prisma calls only. No DB access or production traffic.
- The previous implementation report incorrectly says no frontend test command was available. `package.json` supplies `npm test` and it was run in this review.
- No migration/backfill rehearsal or browser demo has been completed. Builds alone cannot verify the A/B/C/D demonstration or migration integrity.

## Prompt compliance

| Area | Assessment |
| --- | --- |
| Tenant/User/role reuse, one legal entity | Implemented foundation |
| Outlet schema, encrypted banks, grants, invitations | Implemented foundation; lifecycle/admin/UI gaps |
| Centralized authorization | Present; bypassed by multiple exposed services |
| Product and server-derived booking ownership | Present; full direct-ID scope coverage unproven |
| Availability, resources, pricing, private files, reviews | Incomplete; confirmed isolation and workflow defects |
| Owner aggregate/switch, employee assigned outlets | Basic UI present; scope propagation and inactive/history behavior incomplete |
| Outlet finance and verified beneficiary snapshots | Partial; cancellation attribution and release validation unsafe |
| Safe migrations/default outlets/backfill | Files supplied; SQL defect, no execution/count reconciliation/rollback rehearsal |
| Complete frontend/admin flows | Incomplete; settlement selection and bank review absent |
| Security/finance/migration/frontend regression tests | Existing backend suite green; required end-to-end scenarios missing, frontend red |
| ABC Adventures A/B/C/D functional demonstration | Not performed |

## Recommended repair order

1. Fix migration SQL and rehearse migrate/backfill/re-run/count reconciliation in an isolated disposable local PostgreSQL database.
2. Close resource, commercial, private file and review authorization gaps; add route-level negative tests with A and B users and guessed IDs.
3. Fix cancellation ledger attribution and release-time bank verification; add finance regression tests spanning these operations and actual concurrent outlet settlements.
4. Repair query/body scope propagation, admin outlet settlement and bank review screens, inactive-outlet obligations and single-default behavior.
5. Run both full test suites and builds; perform the required four-outlet browser demo. Deployment remains gated on these outcomes.
