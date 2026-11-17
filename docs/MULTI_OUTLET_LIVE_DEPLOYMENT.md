# Live multi-outlet deployment

Deployed **17 November 2026 at 09:14 IST** to https://demo.dhisoft.in/voya/.

Application commit: `be71cc32a6974df884b93a557373fbfd20daad6a` (pushed to origin/main). Release directory: `/var/www/voya-vendor-platform-release-be71cc3`; service: `voya-api-demo-be71cc3.service`. The server's existing dirty checkout was preserved; the release was extracted from the pushed commit instead of overwriting local server edits. Backend and frontend dependencies are isolated from the previous release. The frontend was explicitly built with NODE_ENV=production.

## Backup and migration

A fresh database/upload/configuration backup was made after pausing the old backend, before migration:

`/root/voya-backups/multi-outlet-be71cc3-20261117T034217Z`

- `activity_saas.dump`: 2,571,383 bytes, custom-format PostgreSQL 15 backup; archive contents validated.
- DB backup SHA-256: `f37eee7233dbcf61398c3e73c38bbeab270a1457c7499791f982a950a87b109d`.
- `uploads.tar.gz`: 32,844,505 bytes; archive validated.
- Original Apache/service configuration, application environment/encryption key and runtime settings retained in the protected backup directory. Secrets and backup contents were not committed.

Migration `20261117100000_multi_outlet_core` applied. Backfill ran in dry-run mode, then applied twice. Original IDs, amounts, statuses, legal/KYC records, report payloads, ledger/allocations/invoice/economics snapshots were checked using fingerprints across all 121 original application tables. New attribution columns and expected updatedAt bookkeeping were excluded. No unexpected business-data changes were found before traffic reopened.

The initial migration invocation used the restricted runtime app role and failed on existing table ownership. PostgreSQL rolled back the attempt: neither the outlet tables nor enums remained. The attempt was explicitly marked rolled back, and Prisma deploy was rerun as the postgres database owner over its Unix socket. The runtime role received CRUD on only the four new tables and usage of their enums. Existing table ownership and the runtime role's DDL restrictions were retained. There are now 98 successful migrations, 18 historical rolled-back attempts and **zero unfinished migrations**. This owner/runtime split must be used for future deployments; a restore with --no-owner cannot by itself validate production DDL ownership permissions.

Voya alone returned a maintenance response during the controlled cutover, approximately 139 seconds. Other hosted applications/proxies were not changed. Both the frontend and backend were switched, old hashed assets were retained for already-open pages, and existing JWT/encryption keys and shared uploads were preserved. The old service is stopped/disabled. Public health is 200; the new service is running with zero automatic restarts.

## Post-deployment verification

**151 successful live HTTP checks** across the 13 pre-existing active users covered authenticated identity, vendor profiles/onboarding, outlet defaults, dashboard, catalogue, bookings, inventory/resources, settlements, existing report downloads, admin dashboard/vendors/bookings/finance/bank queue, and agent dashboard/bookings/currencies. These used the existing live-user guard and did not reset customer passwords. Actual new-vendor/password and invited-employee login flows were also exercised.

A separate illustrative **Harbour Trails** vendor was created for live verification, leaving existing vendors' products and permissions intact:

- Four outlets: Fort Kochi, Munnar, Alleppey, Wayanad.
- Owner consolidated/single-outlet views verified, with four private draft products.
- Two invited operations users: one sees Fort Kochi; the other Fort Kochi/Alleppey. Acceptance preserved the requested role and grants.
- Explicit selection required for the multi-assignment employee; guessed product/resource IDs and mismatched scope denied.
- Resource creation saved the selected outlet; another outlet employee's mutation denied.
- Active grants appeared checked. Owner API revocation immediately denied the employee's existing signed session; regrant restored access.
- Deactivation retained readable history and rejected new mutations; the location was reactivated.
- Demonstration bank proof is explicitly labelled NOT A REAL BANK ACCOUNT. The new encrypted/masked account remains PENDING, cannot be assigned as a verified beneficiary, and appears in admin review. Outlet-specific finance preview works.

The verification did not create bookings, settlements, payout releases, bank transfers or emails. Financial fingerprints remained unchanged throughout. Counts remain **17 bookings, 61 events, 7 payouts and 4 settlement batches**. The new demonstration products remain DRAFT and onboarding was not falsely approved. Genuine shared-bank verification/settlement and release safety were exercised on isolated staging fixtures; a demonstration proof was not falsely approved on live.

Codex browser verification confirmed the configured warm theme, owner All outlets vs Fort Kochi product filtering, correct employee grant checkboxes, employee-only Fort Kochi label without an All-outlets selector, and logout clearing outlet scope. The final live owner All-outlets products tab is left open. Screenshots are in `multi-outlet-evidence/live/`.

## Current limits and operations

Ten original vendor outlets still need genuine beneficiary verification before new payouts, as documented before deployment. The missing old, unselected proof version and inherited schema/checksum differences are retained as known pre-existing conditions; no historical migration was rewritten and no bank verification invented.

The new demo's credentials are held privately at `/root/voya-harbour-trails-demo-credentials.json`, outside the repository. Do not publish them or use the demonstration documents for real verification. The owner demonstration session is open in the Codex browser.

There are 12 vendor tenants / 15 outlets after adding the separate four-location demo. No products or bookings lack outlet attribution. New outlet payout/default indexes are valid. Backend pre-release validation passed 675 tests; unchanged frontend validation passed 241 tests; both production builds passed. The staged isolation/concurrency/finance suite passed 20 scenarios.

For rollback after multi-outlet employees exist, keep vendor access paused and fix forward or use an explicitly reviewed restricted rollback. Serving the prior tenant-wide backend would lose outlet isolation. Do not automatically drop expansion data or rewrite issued finance records.

Evidence: `multi-outlet-evidence/live/deployment-manifest.json`, `api-verification.json`, `final-health.json` and screenshots. The protected server deployment log records the initial ownership failure, resolution, successful migration, grants and backfill output.
