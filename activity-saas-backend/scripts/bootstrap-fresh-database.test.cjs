const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { targetFromEnvironment } = require('./bootstrap-fresh-database.cjs');
const root = path.resolve(__dirname, '..');
const hash = (s) => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
test('baseline target guards reject implicit, mismatched and non-rehearsal databases', () => {
  assert.throws(() => targetFromEnvironment({}, []));
  const env = { DATABASE_URL: 'postgresql://voya_local@127.0.0.1:55439/voya_readiness_fresh_20261119?schema=public' };
  assert.throws(() => targetFromEnvironment(env, ['--expect-database=other']));
  assert.equal(targetFromEnvironment(env, ['--expect-database=voya_readiness_fresh_20261119']).name, 'voya_readiness_fresh_20261119');
  for (const url of ['postgresql://root@139.59.73.162/live', 'postgresql://local@localhost:5432/live', 'postgresql://voya_local@127.0.0.1:55439/voya_readiness_fresh_20261119?schema=private']) {
    const name = new URL(url).pathname.slice(1);
    assert.throws(() => targetFromEnvironment({ DATABASE_URL: url }, ['--expect-database=' + name]));
  }
});
test('frozen baseline and every covered migration match their immutable manifest', () => {
  const dir = path.join(root, 'prisma/baseline/20261119');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  assert.equal(m.migrations.length, 98);
  assert.equal(hash(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8')), m.baselineSha256LF);
  assert.equal(hash(fs.readFileSync(path.join(dir, 'reference-data.sql'), 'utf8')), m.referenceDataSha256LF);
  for (const item of m.migrations) assert.equal(hash(fs.readFileSync(path.join(root, 'prisma/migrations', item.name, 'migration.sql'), 'utf8')), item.sha256LF, item.name);
});
