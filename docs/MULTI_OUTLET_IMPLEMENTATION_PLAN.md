# Multi-outlet implementation plan

## Current architecture observed

- A vendor business is already represented by one `Tenant`; `VendorProfile`, onboarding/KYC, legal identity, and settlement policy are tenant-scoped. `User` has a unique email, tenant, and existing `OrganizationRole` permissions. `VendorTeamInvitation` currently carries a tenant and role but no outlet scope.
- `Product` and `Booking` already carry tenant ownership, but neither has outlet attribution. Inventory, availability, fulfilment, product media/revisions, and channel mappings hang off products or bookings, so they can inherit product/booking outlet scope once the owning product and immutable booking attribution exist.
- `FinancialEvent`, `SettlementBatch`, `Payout`, and holds are vendor-scoped. Finance enforces one vendor payout in an ISO week in `FinanceService.assertNoWeeklyVendorPayout`; payout codes and existing beneficiary/economic snapshots must remain stable for historical rows.
- Vendor authorization is primarily `JwtAuthGuard` (reloads current user/role/tenant), `PermissionsGuard`, and tenant predicates in each module. Team routes currently use product permissions. `VendorShell` has no outlet selector; dashboard, product, booking, payout, and report APIs are tenant-wide.

## Data and migration design

1. Add `VendorOutlet` with tenant-scoped unique `outletCode`, status, default marker, contact/location fields, timestamps, audit linkage, and composite tenant/id key. Add `UserOutletAccess` with unique user/outlet, active state, indexes, and constrained tenant relationships. `OWNER` is resolved as access to all active outlets; outlet employee access comes only from active assignments.
2. Add tenant-owned `VendorBankAccount` containing ciphertext and masked account number, bank/IFSC/holder/type/currency, proof and verification state, and active timestamps. Outlet-to-bank is optional and many outlets may reference the same account. API projections never return ciphertext or full account number. Existing masked `VendorProfile` payout data is not promoted to a verified, usable bank account because it lacks a recoverable account number and verification provenance.
3. Add nullable `Product.outletId`, `Booking.outletId`, `FinancialEvent.outletId`, and `SettlementBatch.outletId` with indexes and tenant-safe constraints. A booking receives its product outlet in the same transaction at creation; its outlet remains immutable. A product cannot move after a booking or attributed finance event exists. Settlement lines inherit through booking; vendor-wide finance adjustments/holds remain tenant-wide and are allocated only under existing finance rules. Payouts snapshot the chosen outlet bank beneficiary so later changes cannot rewrite history.
4. Expand migration: create tables/nullable columns/indexes/FKs; create one deterministic default outlet per vendor tenant; backfill existing products, bookings, and booking-linked events/batches through tenant/product/booking ownership; leave tenant-wide rows unscoped; report ambiguous/orphan rows and fail verification rather than guess. Keep all existing payout/invoice identifiers and snapshots. Supply an idempotent audit/backfill script, verification queries/counts, and a rollback note. Do not connect migration scripts to production or run `db push`.

## Implementation phases

1. **Schema and safe backfill:** Prisma models/relations/enums, additive migration, idempotent script, verification and rollback documentation.
2. **Authorization, outlets, banks, invitations:** central `VendorOutletAccessService`; strict scope resolution for aggregate reads, defaults, selected outlet, and all mutations; owner-only outlet/bank/member management; invitation outlet assignments committed atomically with registration; current-user authorization remains server-reloaded; impersonation stays read-only.
3. **Products and bookings:** create products in selected outlet; tenant+outlet checks for direct identifiers, nested IDs, imports, lifecycle actions, and exports; derive immutable booking outlet from product server-side; preserve marketplace visibility for agents and validate failover keeps product/outlet consistent.
4. **Secondary operational paths:** inventory, resources, schedules/rates, promotions, fulfilment/vouchers, quality/demand/distribution and report jobs inherit product/booking scope; audit vendor direct-ID and bulk routes/workers for tenant and outlet checks.
5. **Finance:** attribute booking events immutably, add outlet settlement/batch/payout scopes, preserve tenant-wide tax/legal invoicing, apply separate weekly payout uniqueness/locking per outlet, outlet-specific payout codes, bank verification holds and beneficiary snapshots; keep maker-checker, adjustments, holds, refunds, reconciliation, commission invoices, and legacy payout economics intact.
6. **Frontend:** add outlet list/switcher and owner management to existing partner shell; propagate explicit outlet query/DTO scope and clear/refetch scoped data on switch/logout; update team invitations/members, bank account workflows, dashboards, products, bookings, inventory, fulfilment, settlements, and reports without changing established theme tokens or layout language.
7. **Regression, rollout, demo:** add backend isolation/API, invitation, migration, bank and finance concurrency/regression tests plus frontend tests; run Prisma generate, both builds and test suites; document output, blockers, verification SQL, and controlled rollout. Prepare an illustrative ABC Adventures demo only in a disposable local environment; do not insert fake bank verification or use production data.

## Compatibility and finance invariants

- One legal entity/PAN/GST remains one vendor `Tenant`; distinct legal entities must use separate onboarding and are not merged. The outlet model can later support a separate legal-entity grouping layer.
- Existing one-outlet tenants get one default outlet and should continue without an outlet-selection prompt. Missing scope resolves to that outlet only when the caller has exactly one authorized outlet; owners may omit scope only on explicitly approved aggregate reads.
- A non-owner never receives implicit all-outlet access. Every vendor list, direct-ID read/write, export, report, background job, and nested foreign key must be tenant- and outlet-constrained. Admin/agent/public marketplace behavior is not restricted by vendor employee assignments.
- Payout uniqueness is `(vendor, outlet, ISO week)`, not bank-account identity. Shared banks therefore still produce independent outlet settlements. Vendor-wide adjustments remain explicitly tenant-wide, and historical payout beneficiary snapshots/economics are immutable.

## Modules requiring implementation/audit

`auth`, `common` (permissions/guards), `vendor`/`onboarding`, `vendor-tools` (team, reports, promotions), new `vendor-outlets`, `catalogue`, `bookings`, `dashboard`, `inventory`, `resources`, `rate-plans`, `schedules`, `fulfilment`, `files`, `marketplace`, `distribution`, `demand`, `quality`, `finance`, `payouts`, admin settlement/reconciliation, report workers, and frontend `api`, `VendorShell`, `App`, `PartnerHubPages`, `Dashboard`, `Products`, `ProductBuilder`, `Bookings`, `Inventory`, `FulfilmentCentre`, `Payouts`, `Performance`, and their tests.

## Repair completion and validation

The eleven review findings were repaired, along with the additional nested catalogue, fulfilment evidence, request-selection and backfill permission gaps found during implementation. The current implementation/report and local PostgreSQL evidence supersede the initial completion summary. See `MULTI_OUTLET_IMPLEMENTATION_REPORT.md` and its file inventory for phase 1–7 results. Production migration/deployment remains explicitly unperformed pending approval.
