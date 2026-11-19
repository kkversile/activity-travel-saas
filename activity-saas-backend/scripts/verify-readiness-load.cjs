const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
// The companion serve-readiness.cjs is bound exclusively to this local database.
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://voya_local@127.0.0.1:55439/voya_outlet_baseline?schema=public' } } });
async function money() {
  const values = {};
  for (const table of ['BookingEconomicsSnapshot', 'FinancialEvent', 'Payout', 'SettlementBatch', 'SettlementLine', 'SettlementEventAllocation']) values[table] = (await prisma.$queryRawUnsafe(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0].hash;
  return values;
}
async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@abc.local' } });
  const jwt = new JwtService({ secret: 'local-outlet-isolation-verification-secret-20261117' });
  const token = jwt.sign({ sub: user.id, tenantId: user.tenantId, role: user.role, organizationRole: user.organizationRole });
  const routes = ['/auth/me', '/vendor/outlets', '/vendor/bookings', '/products', '/settlements', '/vendor/reports'];
  const before = await money(), samples = [], failures = [];
  let cursor = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (cursor < 300) {
      const index = cursor++, route = routes[index % routes.length], start = performance.now();
      try {
        const response = await fetch('http://127.0.0.1:4007/api' + route, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) });
        await response.arrayBuffer(); samples.push(performance.now() - start);
        if (response.status !== 200) failures.push({ route, status: response.status });
      } catch (error) { failures.push({ route, error: error.message }); }
    }
  }));
  const elapsed = performance.now() - started;
  assert.deepEqual(await money(), before, 'Read load changed financial history');
  samples.sort((a, b) => a - b);
  const percentile = (p) => Number(samples[Math.ceil(samples.length * p) - 1].toFixed(2));
  const report = { checkedAt: new Date(), pass: failures.length === 0, requests: 300, concurrency: 12, failures, milliseconds: Number(elapsed.toFixed(2)), p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: percentile(1), requestsPerSecond: Number((300000 / elapsed).toFixed(2)), immutableFinanceUnchanged: true, environment: 'Windows loopback API + Docker PostgreSQL16, synthetic multi-outlet fixture; not a production capacity benchmark' };
  fs.writeFileSync(path.resolve('../outputs/release-readiness-20261119/read-load.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); assert.equal(failures.length, 0);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
