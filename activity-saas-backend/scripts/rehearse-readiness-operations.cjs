// No client credentials, tunnels or production hosts are accepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const target = new URL(process.env.DATABASE_URL || 'invalid:');
assert(target.hostname === '127.0.0.1' && target.port === '55439' && ['/voya_readiness_fresh_20261119','/voya_readiness_clean_20261119'].includes(target.pathname) && target.username === 'voya_local');
const root = path.resolve(__dirname, '..'), evidence = path.resolve(root, '../outputs/release-readiness-20261119');
const pg = process.env.VOYA_PG_BIN || 'C:/Program Files/PostgreSQL/16/bin';
const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55439', PGUSER: 'voya_local', PGPASSWORD: '' };
const source = new PrismaClient(); let restored;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
async function fingerprint(client) {
  const tables = await client.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const result = {};
  for (const { tablename } of tables) {
    const quoted = tablename.replaceAll('"', '""');
    result[tablename] = (await client.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${quoted}" t`))[0];
  }
  return result;
}
function files(directory, prefix = '') {
  if (!fs.existsSync(directory)) return {};
  return Object.assign({}, ...fs.readdirSync(directory, { withFileTypes: true }).map((item) => item.isDirectory() ? files(path.join(directory, item.name), prefix + item.name + '/') : { [prefix + item.name]: hash(fs.readFileSync(path.join(directory, item.name))) }));
}
async function main() {
  const manifest = require('../prisma/baseline/20261119/manifest.json');
  const objects = await source.$queryRawUnsafe("SELECT conname AS name FROM pg_constraint WHERE connamespace='public'::regnamespace UNION SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'");
  const names = new Set(objects.map((row) => row.name));
  const extras = manifest.databaseOnlyObjects;
  extras.forEach((item) => assert(names.has(item.name), 'Missing database invariant ' + item.name));
  const guard = spawnSync(process.execPath, ['scripts/bootstrap-fresh-database.cjs', '--expect-database=' + target.pathname.slice(1), '--apply'], { env, cwd: root, encoding: 'utf8' });
  assert.notEqual(guard.status, 0); assert(guard.stderr.includes('Refusing non-empty database'));
  const diff = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-url', target.toString(), '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(diff.status, 0, diff.stderr + diff.stdout);
  const before = await fingerprint(source);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voya-readiness-backup-'));
  const dump = path.join(directory, 'synthetic.dump');
  execFileSync(path.join(pg, 'pg_dump.exe'), ['-Fc', '--no-owner', '--no-acl', '-f', dump, target.pathname.slice(1)], { env, windowsHide: true });
  const name = 'voya_readiness_restore_' + Date.now();
  execFileSync(path.join(pg, 'createdb.exe'), [name], { env, windowsHide: true });
  execFileSync(path.join(pg, 'pg_restore.exe'), ['--no-owner', '--no-acl', '--exit-on-error', '-d', name, dump], { env, windowsHide: true });
  const restoreUrl = new URL(target); restoreUrl.pathname = '/' + name;
  restored = new PrismaClient({ datasources: { db: { url: restoreUrl.toString() } } });
  assert.deepEqual(await fingerprint(restored), before, 'Restored table contents differ');
  assert.deepEqual(await fingerprint(source), before, 'Backup rehearsal changed source data');
  const storage = path.join(os.tmpdir(), 'voya-readiness-storage-20261119');
  const storageHashes = files(storage); assert(Object.keys(storageHashes).length > 0, 'No uploaded files exercised');
  const storageCopy = path.join(directory, 'storage'); fs.cpSync(storage, storageCopy, { recursive: true });
  assert.deepEqual(files(storageCopy), storageHashes);
  const report = { checkedAt: new Date(), pass: true, liveConnections: false, database: target.pathname.slice(1), restoredDatabase: name, immutableTablesMatched: Object.keys(before).length, databaseOnlyInvariants: extras.length, nonemptyBaselineRefused: true, prismaSchemaDrift: false, dumpSha256: hash(fs.readFileSync(dump)), backupDirectory: directory, storageFilesRestored: Object.keys(storageHashes).length, sourceUnchanged: true, fingerprints: before };
  fs.writeFileSync(path.join(evidence, 'backup-restore.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, fingerprints: undefined }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await restored?.$disconnect(); await source.$disconnect(); });
