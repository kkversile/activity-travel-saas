/* Restores and rehearses a supplied read-only snapshot. Never connects to live.
 * Requires the dedicated loopback PG instance, exact staging name and explicit
 * --apply. --reset-staging only drops that disposable staging database. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
const targets = {
  '55439/voya_outlet_staging_20261117': { database: 'voya_outlet_staging_20261117', user: 'voya_local', evidence: 'staging-copy-rehearsal.json' },
  // This tunnel terminates at the separate scratch PG15 cluster, never 5432.
  '55445/voya_outlet_staging_pg15_20261117': { database: 'voya_outlet_staging_pg15_20261117', user: 'voya_staging', evidence: 'staging-copy-pg15-rehearsal.json' },
};
const target = targets[url.port + url.pathname];
assert(url.hostname === '127.0.0.1' && target && url.username === target.user, 'Only the dedicated staging database/role pairs are allowed');
const database = target.database;
assert(process.argv.includes('--apply'), 'Explicit --apply is required to restore and migrate staging');
const snapshot = path.resolve(process.env.STAGING_SNAPSHOT_FILE || 'missing');
assert(fs.statSync(snapshot).isFile(), 'Supply STAGING_SNAPSHOT_FILE');
const work = path.join(os.tmpdir(), 'voya-multi-outlet-staging-20261117');
fs.mkdirSync(work, { recursive: true });
const pg = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/16/bin';
const pgArgs = ['-h', '127.0.0.1', '-p', url.port, '-U', target.user];
const pgRun = (name, args) => execFileSync(path.join(pg, name + (process.platform === 'win32' ? '.exe' : '')), [...pgArgs, ...args], { encoding: 'utf8' });
const cli = (...args) => execFileSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { encoding: 'utf8', env: process.env });
const backfill = (apply) => execFileSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/backfill-multi-outlet.ts', ...(apply ? ['--apply'] : [])], { encoding: 'utf8', env: process.env });
const ignoredUpdates = new Set(['Product', 'Resource', 'Payout', 'ReportSchedule', 'VendorReportExport']);
const migration = '20261117100000_multi_outlet_core';
let prisma;
async function fingerprints(tables) {
  const result = {};
  for (const table of tables) {
    assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(table));
    const omitted = ['outletId', 'bankAccountId', 'beneficiarySnapshot', ...(ignoredUpdates.has(table) ? ['updatedAt'] : [])];
    const expr = `to_jsonb(t)-ARRAY[${omitted.map((key) => `'${key}'`).join(',')}]::text[]`;
    const [row] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS rows, md5(coalesce(string_agg((${expr})::text,E'\n' ORDER BY (${expr})::text),'')) AS fingerprint FROM "${table}" t`);
    result[table] = row;
  }
  return result;
}
async function counts() {
  return (await prisma.$queryRawUnsafe(`SELECT
    (SELECT count(*) FROM "VendorOutlet")::int AS outlets,
    (SELECT count(*) FROM "VendorBankAccount")::int AS banks,
    (SELECT count(*) FROM "UserOutletAccess")::int AS grants,
    (SELECT count(*) FROM "VendorTeamInvitationOutlet")::int AS invitation_grants`))[0];
}
async function main() {
  if (process.argv.includes('--reset-staging')) pgRun('dropdb', ['--if-exists', database]);
  pgRun('createdb', [database]); // Refuses an accidental overwrite without reset.
  pgRun('pg_restore', ['-d', database, '--exit-on-error', '--no-owner', '--no-acl', snapshot]);
  prisma = new PrismaClient();
  const originalTables = (await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`)).map((row) => row.tablename);
  const before = await fingerprints(originalTables);
  const history = await prisma.$queryRawUnsafe(`SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at`);
  assert.equal(history.filter((row) => !row.finished && !row.rolled_back).length, 0, 'Unfinished source migration');
  const successful = history.filter((row) => row.finished && !row.rolled_back);
  const lineEndings = [], historicalChecksumDifferences = [];
  for (const row of successful) {
    const file = path.join('prisma/migrations', row.migration_name, 'migration.sql');
    assert(fs.existsSync(file), `Unknown source migration: ${row.migration_name}`);
    const bytes = fs.readFileSync(file), hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
    if (hash(bytes) === row.checksum) continue;
    if (hash(bytes.toString().replace(/\r\n/g, '\n')) === row.checksum) lineEndings.push(row.migration_name);
    else historicalChecksumDifferences.push(row.migration_name);
  }
  // Record inherited drift; never rewrite applied checksums or execute diff SQL.
  fs.writeFileSync(path.join(work, 'before.prisma'), execFileSync('git', ['show', 'HEAD:activity-saas-backend/prisma/schema.prisma']));
  const inheritedDrift = cli('migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', path.join(work, 'before.prisma'), '--script');
  const preflight = (await prisma.$queryRawUnsafe(`SELECT
    (SELECT count(*) FROM "Booking" b LEFT JOIN "Product" p ON p.id=b."productId" WHERE p.id IS NULL OR b."vendorTenantId"<>p."tenantId")::int AS booking_product_mismatch,
    (SELECT count(*) FROM "FinancialEvent" e JOIN "Booking" b ON b.id=e."bookingId" WHERE e."vendorTenantId" IS DISTINCT FROM b."vendorTenantId")::int AS event_booking_mismatch,
    (SELECT count(*) FROM (SELECT "tenantId",date_trunc('week',"createdAt") FROM "Payout" WHERE "recordType"='CANONICAL' GROUP BY 1,2 HAVING count(*)>1) d)::int AS duplicate_canonical_weeks`))[0];
  assert(Object.values(preflight).every((value) => value === 0), 'Source attribution/concurrency preflight requires review');
  const deployed = cli('migrate', 'deploy');
  const dryRun = backfill(false), first = backfill(true);
  const firstCounts = await counts(), firstHashes = await fingerprints(originalTables);
  const second = backfill(true), secondCounts = await counts(), secondHashes = await fingerprints(originalTables);
  assert.deepEqual(firstCounts, secondCounts, 'Backfill changed counts on repeat');
  assert.deepEqual(firstHashes, secondHashes, 'Backfill changed original business data on repeat');
  assert.deepEqual(before, secondHashes, 'Original IDs, amounts, snapshots or statuses changed');
  const remaining = (await prisma.$queryRawUnsafe(`SELECT
    (SELECT count(*) FROM "Product" p JOIN "Tenant" t ON t.id=p."tenantId" WHERE t.kind='VENDOR' AND p."outletId" IS NULL)::int AS products,
    (SELECT count(*) FROM "Booking" b JOIN "Tenant" t ON t.id=b."vendorTenantId" WHERE t.kind='VENDOR' AND b."outletId" IS NULL)::int AS bookings,
    (SELECT count(*) FROM "Resource" WHERE "outletId" IS NULL)::int AS resources,
    (SELECT count(*) FROM "SettlementBatch" WHERE "outletId" IS NULL)::int AS batches,
    (SELECT count(*) FROM "Payout" WHERE "outletId" IS NULL)::int AS payouts,
    (SELECT count(*) FROM "VendorReportExport" WHERE "outletId" IS NULL)::int AS exports,
    (SELECT count(*) FROM "FinancialEvent" WHERE "bookingId" IS NOT NULL AND "outletId" IS NULL)::int AS booking_events,
    (SELECT count(*) FROM "Tenant" t WHERE t.kind='VENDOR' AND (SELECT count(*) FROM "VendorOutlet" o WHERE o."tenantId"=t.id AND o."isDefault")<>1)::int AS invalid_defaults`))[0];
  assert(Object.values(remaining).every((value) => value === 0), 'Unresolved target attribution; inspect before release');
  const financial = (await prisma.$queryRawUnsafe(`SELECT
    (SELECT sum(amount)::text FROM "Booking") AS booking_amount,
    (SELECT sum(amount)::text FROM "Payout") AS payout_amount,
    (SELECT sum("vendorAmount")::text FROM "FinancialEvent") AS event_vendor_amount,
    (SELECT count(*) FROM "Payout" WHERE "recordType"='CANONICAL' AND status NOT IN ('RECONCILED','RELEASED') AND ("bankAccountId" IS NULL OR "beneficiarySnapshot" IS NULL))::int AS unpaid_canonical_without_beneficiary,
    (SELECT count(*) FROM "VendorOutlet" WHERE "bankAccountId" IS NOT NULL)::int AS assigned_beneficiaries,
    (SELECT count(*) FROM "FinancialEvent" WHERE "outletId" IS NULL AND type='VENDOR_ADJUSTMENT' AND "bookingId" IS NULL)::int AS explicit_vendor_wide_adjustments`))[0];
  assert.equal(financial.unpaid_canonical_without_beneficiary, 0, 'Existing canonical payouts need beneficiary reconciliation');
  const afterDrift = cli('migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script');
  const report = { checkedAt: new Date(), snapshotSha256: crypto.createHash('sha256').update(fs.readFileSync(snapshot)).digest('hex'), sourcePostgres: '15.20', stagingPostgres: (await prisma.$queryRawUnsafe(`SELECT current_setting('server_version') AS version`))[0].version, stagingDatabase: `127.0.0.1:${url.port}/${database}`, sourceWrites: false, successfulHistoricalMigrations: successful.length, rolledBackHistoricalAttempts: history.filter((row) => row.rolled_back).length, unresolvedMigrations: 0, lineEndingOnlyChecksums: lineEndings.length, historicalChecksumDifferences, preflight, originalTablesVerified: originalTables.length, originalDataUnchanged: true, immutableFingerprints: before, migration, deployed, dryRun, firstBackfill: first, secondBackfill: second, repeatCounts: secondCounts, remaining, financial, inheritedSchemaDrift: inheritedDrift, postMigrationSchemaDrift: afterDrift, externalMailAndPaymentActions: false };
  const evidenceDirectory = process.env.VOYA_REHEARSAL_EVIDENCE_DIR || '../docs/multi-outlet-evidence';
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, target.evidence), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ originalTablesVerified: originalTables.length, originalDataUnchanged: true, remaining, repeatCounts: secondCounts, financial, historicalChecksumDifferences }, null, 2));
}
main().catch((error) => { fs.writeFileSync(path.join(work, 'rehearsal-failure.log'), String(error.stack || error)); console.error(`Staging snapshot rehearsal failed. No live connection was used. Diagnostics: ${path.join(work, 'rehearsal-failure.log')}`); process.exitCode = 1; }).finally(() => prisma?.$disconnect());
