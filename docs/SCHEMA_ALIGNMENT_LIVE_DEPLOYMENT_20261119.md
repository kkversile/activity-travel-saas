# Approved schema alignment on the live demo

Completed **19 November 2026 at 17:02:08 UTC / 22:32:08 IST**, following explicit user approval of migration revision `6379585`.

## Live result

`20261119160000_reconcile_legacy_schema_metadata` is applied. The database has **99 successful migrations, zero pending/unfinished migrations and zero Prisma drift** against schema source `bed9777`. The approved migration SQL SHA-256 is `4aff29f3b36b8fe6f7e89df51c2dbc80d783667af776f1628750ca00127f9f8e`.

All **125 data-table row counts/hashes** matched across the successful guarded migration window. The original 98 successful migration records and 18 historical rollback records were preserved. All 42 database-only invariants remain present. The payout/tenant foreign key now has validated **ON DELETE RESTRICT** behavior, matching the model. Collection policy, payment evidence, balances, beneficiary approvals, outlet permissions and theme were not changed. No live backfill, baseline or seed was run.

The application remains the compatible `c1afde3` release and `voya-api-demo-c1afde3.service`; this was a schema-only deployment. The canonical approved schema and all 99 migrations are retained at `/var/lib/postgresql/voya-schema-alignment-bed9777/prisma`, with locked CLI dependencies in its owner-private workspace. Future application releases from main include these migration artifacts. Do not treat the older runtime release's 98-file Prisma directory as the latest migration source.

## Migration permissions and recovery

The first attempt used the restricted application database role and was refused by PostgreSQL because tables are owned by `postgres`. Its SQL transaction rolled back; schema-only output was compared with the pre-attempt backup and matched. The API was restarted and verified healthy. Prisma's supported `migrate resolve --rolled-back` command marked only that failed attempt, retaining its audit record. It was not removed or marked successful.

The successful attempt used the existing PostgreSQL owner through **local Unix-socket peer authentication** and an isolated CLI workspace. No privileged database password was introduced and no application grants, ownership or role privileges were broadened. The migration's explicit transaction, five-second lock timeout and 30-second statement timeout were retained. The successful API maintenance window, including both consistent backups and startup health verification, was **14.21 seconds**; an earlier brief maintenance attempt ended safely on the permission refusal.

The resulting migration history includes one additional rolled-back permission attempt alongside the 99 successful migrations and the original 18 rollbacks. There are no unfinished attempts.

## Fresh recovery points

Both backups contain the database, private uploads and both recovery environment files. SHA-256 values of all four artifacts were checked before acceptance.

| Recovery point | Protected server directory | Database SHA-256 |
| --- | --- | --- |
| Immediately before the successful migration | `/root/voya-backups/scheduled/voya-daily-20261119T170154Z-114e23e1` | `dea332158b673d241270882212500e7f1abd86173c92dae514cccce2e264f132` |
| Immediately after the migration | `/root/voya-backups/scheduled/voya-daily-20261119T170201Z-d6c20a5f` | `db31093a3e02f2f34cd4f56c5fa57b85e8fcdd6e1cbc66554df8eccb4818cccf` |

The post-migration archive was downloaded privately and restored to isolated PostgreSQL 15.20. All **125 data-table fingerprints** match the live migration snapshot, with 99 successful migrations and all 42 invariants. All **73 restored upload files** match their hashes, including the Harbour demonstration documents and vouchers. There are 83 FileAsset references and the same **10 inherited missing originals**, with zero newly missing files. These originals still require authentic source recovery; backup verification does not reconstruct absent bytes.

## Post-deployment regression evidence

- **173 live HTTP checks pass**, covering original accounts/reports, Harbour owner and scoped employees, all four voucher PDFs, approved onboarding, outlet switching, denied cross-outlet records/private files, protected settlement statements and denied employee finance access. Twelve financial tables plus FileAsset remained unchanged during the read checks.
- **173 restored-staging HTTP checks pass** with external delivery/jobs disabled. Two encrypted bank records decrypt with the recovered keys; no plaintext is logged.
- Staging searches return all four normal Harbour offers for 20 November and 20 December without an eligibility override. A bounded **200-request/concurrency-eight** staging read test has zero failures: p50 27.46 ms, p95 58.80 ms, maximum 106.31 ms. Financial/file hashes are unchanged. These are local Windows/Docker observations, not a production SLA claim.
- Actual database guard tests on the post-migration restore reject payout-bearing tenant deletion and duplicate quality-policy versions, preserve timestamp precision and historical indexes, and roll back all fixtures with all 126 table fingerprints unchanged.
- Same approved-source engineering evidence remains **712 backend tests, 255 frontend tests, 15 operations tests**, builds and fresh/restored PG15/PG16 migration rehearsals passing. No new application code change was needed for this deployment.
- Live readiness confirms database and storage up. Backup freshness/integrity monitoring passes, with a warning limited to the inherited missing originals. Harbour's four products remain LIVE; the existing demonstration bookings remain completed and settlements remain PAYOUT_BLOCKED. No money was transferred.

Evidence is in `outputs/live-schema-alignment-20261119/`. Protected server migration logs, before/after fingerprints, original history and deployment metadata are retained at `/root/voya-schema-alignment-bed9777-owner-run`. The source/configuration recovery artifacts remain private and excluded from Git.

OpenAI/DLT/provider activation, authentic documents, approved production financial settings/report recipients, offsite recovery/alert destinations and formal client acceptance remain external inputs. The live verification browser tab is left open.
