// Real dependency failures are exercised only against disposable loopback copies.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { performance } = require('node:perf_hooks');
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppController } = require('../dist/app.controller');
const { HealthService } = require('../dist/health/health.service');
const { StorageService } = require('../dist/storage/storage.service');
const target = new URL(process.env.DATABASE_URL || 'invalid:');
assert(target.hostname === '127.0.0.1' && target.port === '55445' && target.username === 'voya_staging' && /^\/voya_readiness_/.test(target.pathname), 'Dedicated PostgreSQL 15 rehearsal copy required');
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'voya-health-rehearsal-'));
  const original = { ...process.env }, checks = [];
  try {
    const badPath = path.join(root, 'blocked'); await fs.writeFile(badPath, 'not a directory');
    const disconnected = new URL(target); disconnected.port = '1'; disconnected.searchParams.set('connect_timeout', '1');
    const noSchema = new URL(target); noSchema.pathname = '/postgres';
    const cases = [
      { name: 'healthy', url: target, storage: path.join(root, 'storage'), code: 200 },
      { name: 'database-unavailable', url: disconnected, storage: path.join(root, 'storage'), code: 503 },
      { name: 'database-schema-missing', url: noSchema, storage: path.join(root, 'storage'), code: 503 },
      { name: 'storage-unwritable', url: target, storage: badPath, code: 503 },
    ];
    for (const scenario of cases) {
      Object.assign(process.env, { STORAGE_DRIVER: 'local', STORAGE_ROOT: scenario.storage });
      const prisma = new PrismaClient({ datasources: { db: { url: scenario.url.toString() } } });
      const storage = new StorageService(), service = new HealthService(prisma, storage);
      const module = await Test.createTestingModule({ controllers: [AppController], providers: [{ provide: HealthService, useValue: service }] }).compile();
      const app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
      try {
        const start = performance.now(); const response = await request(app.getHttpServer()).get('/api/health/ready').expect(scenario.code);
        const milliseconds = Math.round(performance.now() - start);
        assert(milliseconds < 4000, 'Dependency failure did not return in bounded time');
        assert(!JSON.stringify(response.body).includes(root) && !JSON.stringify(response.body).includes('postgresql://'), 'Public response leaked infrastructure details');
        await request(app.getHttpServer()).get('/api/health/live').expect(200);
        checks.push({ scenario: scenario.name, httpStatus: response.status, checks: response.body.checks, milliseconds, livenessHttpStatus: 200 });
      } finally { await app.close(); await prisma.$disconnect(); storage.onModuleDestroy(); }
    }
    assert.deepEqual(await fs.readdir(path.join(root, 'storage/private/health')), [], 'Readiness probes retained temporary files');
    const output = path.resolve('../outputs/health-notifications-20261119'); await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'readiness-failure-rehearsal.json'), JSON.stringify({ checkedAt: new Date(), liveConnections: false, pass: true, checks }, null, 2));
    console.log(JSON.stringify(checks, null, 2));
  } finally { process.env = original; await fs.rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
