// Generates an additive fresh-install artifact; never connects to a database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'prisma/baseline/20261119');
const normalize = (s) => s.replace(/\r\n/g, '\n');
const digest = (s) => crypto.createHash('sha256').update(normalize(s)).digest('hex');
const migrations = fs.readdirSync(path.join(root, 'prisma/migrations')).filter((name) => fs.existsSync(path.join(root, 'prisma/migrations', name, 'migration.sql'))).sort();
// Split SQL outside quoted strings, identifiers and dollar-quoted blocks.
function statements(sql) {
  const out = []; let start = 0, quote = null, dollar = null, comment = false;
  for (let i = 0; i < sql.length; i++) {
    if (comment) { if (sql[i] === '\n') comment = false; continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    if (quote) { if (sql[i] === quote) { if (sql[i + 1] === quote) i++; else quote = null; } continue; }
    if (sql[i] === '-' && sql[i + 1] === '-') { comment = true; i++; continue; }
    if (sql[i] === "'" || sql[i] === '"') { quote = sql[i]; continue; }
    if (sql[i] === '$') { const m = sql.slice(i).match(/^\$[a-zA-Z_0-9]*\$/); if (m) { dollar = m[0]; i += dollar.length - 1; continue; } }
    if (sql[i] === ';') { out.push(sql.slice(start, i + 1).replace(/--[^\n]*/g, '').trim()); start = i + 1; }
  }
  return out.filter(Boolean);
}
const constraints = new Map(), indexes = new Map();
const history = migrations.map((name) => {
  const sql = normalize(fs.readFileSync(path.join(root, 'prisma/migrations', name, 'migration.sql'), 'utf8'));
  for (const statement of statements(sql)) {
    const table = statement.match(/^ALTER TABLE\s+(?:"public"\.)?"([^"]+)"\s+([\s\S]*)/i);
    if (table) {
      for (const drop of table[2].matchAll(/DROP CONSTRAINT(?: IF EXISTS)?\s+"([^"]+)"/gi)) constraints.delete(table[1] + ':' + drop[1]);
      const additions = [...table[2].matchAll(/ADD CONSTRAINT\s+"([^"]+)"\s+(CHECK|EXCLUDE)\b/gi)];
      for (const add of additions) {
        const body = table[2].slice(add.index).split(/,\s*ADD CONSTRAINT\s+/i)[0].replace(/;\s*$/, '');
        constraints.set(table[1] + ':' + add[1], { name: add[1], table: table[1], source: name, sql: `ALTER TABLE "${table[1]}" ${body};` });
      }
    }
    const dropIndex = statement.match(/^DROP INDEX(?: IF EXISTS)?\s+(?:"public"\.)?"([^"]+)"/i);
    if (dropIndex) indexes.delete(dropIndex[1]);
    const index = statement.match(/^CREATE UNIQUE INDEX(?: IF NOT EXISTS)?\s+"([^"]+)"/i);
    if (index && /\bWHERE\b/i.test(statement)) indexes.set(index[1], { name: index[1], source: name, sql: statement });
  }
  return { name, sha256LF: digest(sql) };
});
fs.mkdirSync(directory, { recursive: true });
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const generated = normalize(execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script'], { cwd: root, encoding: 'utf8' }));
const objects = [...constraints.values(), ...indexes.values()];
const extra = '-- Database-only constraints retained from immutable migration history.\nCREATE EXTENSION IF NOT EXISTS btree_gist;\n\n' + objects.map((o) => `-- ${o.source}\n${o.sql}`).join('\n\n') + '\n';
const sql = '-- VOYA fresh-install baseline, 19 November 2026. Never apply to an existing database.\n' + generated + '\n' + extra;
fs.writeFileSync(path.join(directory, 'schema.sql'), sql);
fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, generatedAt: '2026-11-19', lastCoveredMigration: migrations.at(-1), schemaSha256LF: digest(schema), baselineSha256LF: digest(sql), referenceDataSha256LF: digest(fs.readFileSync(path.join(directory,'reference-data.sql'),'utf8')), migrations: history, databaseOnlyObjects: objects.map(({ sql, ...o }) => o) }, null, 2) + '\n');
console.log(JSON.stringify({ migrations: migrations.length, checksAndExclusions: constraints.size, partialUniqueIndexes: indexes.size, bytes: Buffer.byteLength(sql) }));
module.exports = { statements };
