// Local-only Prisma deployment rehearsal against the pre-change schema.
// Existing migration history contains out-of-order historical migrations. This
// uses an explicit pre-change baseline; it never changes historical checksums.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
assert(url.hostname === '127.0.0.1' && url.port === '55439' && url.pathname === '/voya_outlet_deploy', 'Requires 127.0.0.1:55439/voya_outlet_deploy; this script refuses all other databases');
const pg = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/16/bin';
const pgArgs = ['-h', '127.0.0.1', '-p', '55439', '-U', 'voya_local'];
const dbArgs = [...pgArgs, '-d', 'voya_outlet_deploy', '-v', 'ON_ERROR_STOP=1'];
const runPg = (exe, args) => execFileSync(path.join(pg, exe + (process.platform === 'win32' ? '.exe' : '')), args, { encoding: 'utf8' });
const prismaCli = path.join(process.cwd(), 'node_modules/prisma/build/index.js');
const runPrisma = (args) => execFileSync(process.execPath, [prismaCli, ...args], { env: process.env, encoding: 'utf8' });
const work = path.resolve('tmp/outlet-deploy-rehearsal'); fs.mkdirSync(work, { recursive: true });
const baseRevision = 'a599c635b6cb940713cd5b274fd52a51c3179bc6';
const migration = '20261117100000_multi_outlet_core';
runPg('createdb', [...pgArgs, 'voya_outlet_deploy']); // Intentionally refuses to overwrite an existing rehearsal.
fs.writeFileSync(path.join(work, 'before.prisma'), execFileSync('git', ['show', `${baseRevision}:activity-saas-backend/prisma/schema.prisma`]));
fs.writeFileSync(path.join(work, 'baseline.sql'), runPrisma(['migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(work, 'before.prisma'), '--script']));
runPg('psql', [...dbArgs, '-q', '-1', '-f', path.join(work, 'baseline.sql')]);
runPg('psql', [...dbArgs, '-q', '-1', '-f', 'scripts/multi-outlet-legacy-fixture.sql']);
const previous = fs.readdirSync('prisma/migrations').filter((name) => name < migration && fs.existsSync(`prisma/migrations/${name}/migration.sql`)).sort();
runPrisma(['migrate', 'resolve', '--applied', previous[0]]);
const rows = previous.slice(1).map((name) => {
  assert(/^[a-zA-Z0-9_]+$/.test(name));
  const checksum = createHash('sha256').update(fs.readFileSync(`prisma/migrations/${name}/migration.sql`)).digest('hex');
  return `('${randomUUID()}','${checksum}',now(),'${name}',now(),0)`;
});
fs.writeFileSync(path.join(work, 'baseline-history.sql'), `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES ${rows.join(',')};`);
runPg('psql', [...dbArgs, '-q', '-1', '-f', path.join(work, 'baseline-history.sql')]);
const deployed = runPrisma(['migrate', 'deploy']); console.log(deployed);
const runBackfill = () => execFileSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/backfill-multi-outlet.ts', '--apply'], { env: process.env, encoding: 'utf8' });
const first = runBackfill(), second = runBackfill(); console.log(first, second);
const verified = runPg('psql', [...dbArgs, '-tAc', `SELECT count(*) FROM "Booking" b JOIN "FinancialEvent" e ON e."bookingId"=b."id" JOIN "Payout" p ON p."tenantId"=b."vendorTenantId" WHERE b."bookingCode"='LEGACY-PRESERVE' AND b."amount"=1234.56 AND e."vendorAmount"=1000.01 AND e."components"='{"immutableEconomics":true}'::jsonb AND e."outletId"=b."outletId" AND b."outletId" IS NOT NULL AND p."amount"=1000.01 AND p."status"='PAID'`]).trim();
assert.equal(verified, '1');
const evidenceDirectory = process.env.VOYA_REHEARSAL_EVIDENCE_DIR || '../docs/multi-outlet-evidence';
fs.mkdirSync(evidenceDirectory, { recursive: true });
fs.writeFileSync(path.join(evidenceDirectory, 'migration-rehearsal.json'), JSON.stringify({ checkedAt: new Date(), baseRevision, previousMigrationsBaselined: previous.length, migration, prismaDeploy: deployed, firstBackfill: first, secondBackfill: second, legacyEconomicRowsPreserved: Number(verified), database: '127.0.0.1:55439/voya_outlet_deploy', freshInstallPath: 'scripts/bootstrap-fresh-database.cjs and prisma/baseline/20261119; historical migrations remain unchanged.' }, null, 2));
console.log('PASS Prisma deployment, repeated backfill, and pre-existing economics preservation');
