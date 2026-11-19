// Empty databases only. Existing deployments continue to use migrate deploy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'prisma/baseline/20261119');
const digest = (value) => crypto.createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');

function targetFromEnvironment(env, args) {
  assert(env.DATABASE_URL, 'Set DATABASE_URL explicitly; no .env fallback is allowed');
  const target = new URL(env.DATABASE_URL);
  assert(['postgres:', 'postgresql:'].includes(target.protocol), 'PostgreSQL required');
  const name = decodeURIComponent(target.pathname.slice(1));
  assert(/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(name), 'Invalid database name');
  assert(args.includes('--expect-database=' + name), 'Supply --expect-database=<exact database name>');
  assert(!target.searchParams.has('schema') || target.searchParams.get('schema') === 'public', 'The baseline is for the public schema');
  const local = target.hostname === '127.0.0.1' && (
    (target.port === '55439' && target.username === 'voya_local') ||
    (target.port === '55445' && target.username === 'voya_staging')
  ) && /^voya_(readiness|outlet)_/.test(name);
  assert(local || args.includes('--allow-remote-empty-database'), 'Non-rehearsal targets require explicit --allow-remote-empty-database and a separately approved deployment');
  return { url: target.toString(), name };
}
async function main() {
  const args = process.argv.slice(2), target = targetFromEnvironment(process.env, args);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const sql = fs.readFileSync(path.join(directory, 'schema.sql'), 'utf8');
  assert.equal(digest(sql), manifest.baselineSha256LF, 'Baseline checksum mismatch');
  assert.equal(digest(fs.readFileSync(path.join(directory,'reference-data.sql'),'utf8')),manifest.referenceDataSha256LF,'Reference-data checksum mismatch');
  for (const migration of manifest.migrations) {
    assert.equal(digest(fs.readFileSync(path.join(root, 'prisma/migrations', migration.name, 'migration.sql'), 'utf8')), migration.sha256LF, 'Covered migration was modified: ' + migration.name);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  const marker = 'VOYA empty database baseline 20261119 ' + manifest.baselineSha256LF;
  try {
    const objects = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','S')`);
    const [{ description }] = await prisma.$queryRawUnsafe(`SELECT obj_description('public'::regnamespace, 'pg_namespace') AS description`);
    const resume = args.includes('--resume-baseline');
    if (objects[0].count) assert(resume && description === marker, 'Refusing non-empty database. Only an explicitly marked, interrupted baseline can be resumed.');
    else assert(!resume, 'No baseline exists to resume');
    if (!args.includes('--apply')) {
      console.log(JSON.stringify({ mode: 'preflight', database: target.name, empty: objects[0].count === 0, migrations: manifest.migrations.length, writes: false })); return;
    }
    const cli = (...cliArgs) => execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), ...cliArgs], { cwd: root, env: { ...process.env, DATABASE_URL: target.url }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (!resume) {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'voya-empty-baseline-'));
      const file = path.join(work, 'bootstrap.sql');
      // The empty check is repeated inside a serializing transaction, closing
      // the check/apply race without DROP, reset, or business-data rewrites.
      fs.writeFileSync(file, `BEGIN; SELECT pg_advisory_xact_lock(771190026);\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','S')) THEN RAISE EXCEPTION 'Database is not empty'; END IF; END $$;\n${sql}\nCOMMENT ON SCHEMA public IS '${marker}';\nCOMMIT;\n`);
      cli('db', 'execute', '--file', file, '--schema', 'prisma/schema.prisma');
    }
    const tables = await prisma.$queryRawUnsafe(`SELECT to_regclass('public._prisma_migrations')::text AS name`);
    const applied = tables[0].name ? await prisma.$queryRawUnsafe(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`) : [];
    const names = new Set(applied.map((row) => row.migration_name));
    for (const migration of manifest.migrations) if (!names.has(migration.name)) {
      // Supported Prisma baselining, not manual insertion/checksum rewriting.
      cli('migrate', 'resolve', '--applied', migration.name);
      console.log('BASELINED ' + migration.name);
    }
    console.log(cli('migrate', 'deploy'));
    cli('db','execute','--file',path.join(directory,'reference-data.sql'),'--schema','prisma/schema.prisma');
    console.log(JSON.stringify({ database: target.name, baseline: manifest.baselineSha256LF, historicalMigrationsBaselined: manifest.migrations.length, existingMigrationsChanged: false, completed: true }));
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { targetFromEnvironment };
