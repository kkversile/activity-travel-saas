const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const manifest = require('../prisma/baseline/20261119/manifest.json');
const targets = process.env.VOYA_FRESH_BASELINE_URLS ? JSON.parse(process.env.VOYA_FRESH_BASELINE_URLS) : [
  'postgresql://voya_local@127.0.0.1:55439/voya_readiness_clean_20261119?schema=public',
  'postgresql://voya_staging@127.0.0.1:55445/voya_readiness_pg15_20261119?schema=public',
];
assert(Array.isArray(targets) && targets.length > 0 && targets.length <= 4);
for (const raw of targets) {
  const url = new URL(raw);
  assert(url.hostname === '127.0.0.1' && /^\/voya_readiness_/.test(url.pathname)
    && (url.searchParams.get('schema') || 'public') === 'public'
    && ((url.port === '55439' && url.username === 'voya_local') || (url.port === '55445' && url.username === 'voya_staging')), 'Dedicated baseline rehearsal target required');
}
const expectedMigrations = fs.readdirSync(path.join(__dirname, '../prisma/migrations'))
  .filter((name) => fs.existsSync(path.join(__dirname, '../prisma/migrations', name, 'migration.sql'))).sort();
async function main() {
  const results = [];
  for (const url of targets) {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      const rows = await prisma.$queryRawUnsafe("SELECT conname AS name FROM pg_constraint WHERE connamespace='public'::regnamespace UNION SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'");
      for (const item of manifest.databaseOnlyObjects) assert(rows.some((row) => row.name === item.name), item.name);
      const history = await prisma.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
      assert.deepEqual(history.map((row) => row.migration_name).sort(), expectedMigrations);
      assert.equal((await prisma.financeConfiguration.findUniqueOrThrow({ where: { id: 'default' } })).paymentCollectionMode, 'UNCONFIGURED');
      async function denied(action, code) {
        let caught;
        try { await prisma.$transaction(async (tx) => { await action(tx); throw new Error('Constraint was not enforced'); }); }
        catch (error) { caught = error; }
        assert.equal(caught?.meta?.code || caught?.code, code, String(caught));
      }
      await denied((tx) => tx.$executeRawUnsafe('UPDATE "FinanceConfiguration" SET id=\'invalid-singleton\' WHERE id=\'default\''), '23514');
      await denied(async (tx) => {
        const tenant = await tx.tenant.create({ data: { slug: 'baseline-' + randomUUID(), name: 'Rolled-back invariant fixture', kind: 'VENDOR' } });
        await tx.vendorOutlet.create({ data: { tenantId: tenant.id, outletCode: 'ONE', name: 'First', isDefault: true } });
        await tx.vendorOutlet.create({ data: { tenantId: tenant.id, outletCode: 'TWO', name: 'Second', isDefault: true } });
      }, 'P2002');
      const diff = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
      assert.equal(diff.status, 0, diff.stdout + diff.stderr);
      results.push({ database: new URL(url).pathname.slice(1), postgres: (await prisma.$queryRawUnsafe("SELECT current_setting('server_version') AS version"))[0].version, pass: true, appliedMigrations: history.length, customInvariants: manifest.databaseOnlyObjects.length, invalidSingletonRejected: true, duplicateDefaultOutletRejected: true, schemaDrift: false, paymentCollectionMode: 'UNCONFIGURED' });
    } finally { await prisma.$disconnect(); }
  }
  const evidence = process.env.VOYA_REHEARSAL_EVIDENCE_DIR || '../outputs/release-readiness-20261119';
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.resolve(evidence, 'fresh-baselines.json'), JSON.stringify({ checkedAt: new Date(), liveConnections: false, results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
