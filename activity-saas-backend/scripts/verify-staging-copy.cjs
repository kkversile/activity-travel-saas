// HTTP smoke tests on the restored staging copy. No login/password resets,
// fixture insertion, external mail, bank transfers or live connections.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { NestFactory } = require('@nestjs/core');
const { SchedulerRegistry } = require('@nestjs/schedule');
const { JwtService } = require('@nestjs/jwt');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
const allowStagingWrites = process.argv.includes('--allow-staging-writes');
const pg15 = url.port === '55445' && url.pathname === '/voya_outlet_staging_pg15_20261117';
assert(url.hostname === '127.0.0.1' && ((pg15 && allowStagingWrites && url.username === 'voya_staging') || (url.port === '55439' && url.pathname === '/voya_outlet_staging_20261117' && url.username === (allowStagingWrites ? 'voya_local' : 'voya_outlet_staging_ro'))), 'Requires the dedicated staging database and explicit role/mode');
process.env.JWT_SECRET = randomBytes(48).toString('hex');
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_OTP_WEBHOOK_URL']) process.env[key] = '';
process.env.AI_ACTIVITY_ENABLED = 'false';
const { AppModule } = require('../dist/app.module');
const { RequestContextService } = require('../dist/common/request-context.service');
const { CorrelationIdMiddleware } = require('../dist/common/correlation-id.middleware');
const prisma = new PrismaClient();
let app;
async function main() {
  const [{ read_only }] = await prisma.$queryRawUnsafe(`SELECT current_setting('transaction_read_only') AS read_only`);
  assert.equal(read_only, allowStagingWrites ? 'off' : 'on');
  async function immutableFinance() {
    const tables = ['Booking', 'BookingEconomicsSnapshot', 'FinancialEvent', 'Payout', 'SettlementBatch', 'SettlementLine', 'SettlementEventAllocation', 'SettlementHold', 'PayoutAttempt', 'PayoutReleaseApprovalRequest', 'CommissionInvoice'];
    const hashes = {};
    for (const table of tables) hashes[table] = (await prisma.$queryRawUnsafe(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0].hash;
    return hashes;
  }
  const financeBefore = await immutableFinance();
  app = await NestFactory.create(AppModule, { logger: false });
  const middleware = new CorrelationIdMiddleware(app.get(RequestContextService));
  app.use((req, res, next) => middleware.use(req, res, next));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  for (const name of app.get(SchedulerRegistry).getCronJobs().keys()) app.get(SchedulerRegistry).deleteCronJob(name);
  const users = await prisma.user.findMany({ where: { active: true } });
  const jwt = app.get(JwtService);
  const failures = [], checks = [];
  async function read(user, route) {
    const token = jwt.sign({ sub: user.id, tenantId: user.tenantId, role: user.role, organizationRole: user.organizationRole });
    const response = await request(app.getHttpServer()).get('/api' + route).set('Authorization', 'Bearer ' + token);
    if (response.status !== 200) failures.push({ role: user.role, route: route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id'), status: response.status });
    else checks.push({ role: user.role, route: route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id') });
    return response;
  }
  let vendors = 0, readyReportsDownloaded = 0;
  for (const user of users) {
    await read(user, '/auth/me');
    if (user.role === 'VENDOR') {
      vendors++;
      for (const route of ['/vendor/outlets', '/vendor/profile', '/vendor/onboarding', '/dashboard/summary', '/products', '/vendor/bookings', '/inventory', '/resources', '/settlements', '/vendor/reports']) await read(user, route);
      const outlets = await prisma.vendorOutlet.findMany({ where: { tenantId: user.tenantId } });
      assert.equal(outlets.length, 1, 'Source single-location vendor changed unexpectedly');
      await read(user, '/vendor/bookings?outletId=' + outlets[0].id);
      await read(user, '/settlements?outletId=' + outlets[0].id);
      const reports = await prisma.vendorReportExport.findMany({ where: { tenantId: user.tenantId, status: 'READY' } });
      for (const report of reports) {
        const response = await read(user, `/vendor/reports/${report.id}/download?outletId=${outlets[0].id}`);
        if (response.status === 200) readyReportsDownloaded++;
      }
    } else if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      for (const route of ['/admin/dashboard', '/admin/vendors', '/admin/bookings', '/admin/settlements', '/admin/payouts', '/vendor/admin/bank-accounts/pending']) await read(user, route);
    } else if (user.role === 'TRAVEL_AGENT') {
      for (const route of ['/agent/dashboard', '/agent/bookings']) await read(user, route);
    }
  }
  assert.deepEqual(await immutableFinance(), financeBefore, 'HTTP reads changed financial records');
  const report = { checkedAt: new Date(), stagingPostgres: (await prisma.$queryRawUnsafe(`SELECT current_setting('server_version') AS version`))[0].version, databaseRole: allowStagingWrites ? 'Explicit isolated staging writer: existing onboarding GET may normalize supplemental data' : 'SELECT-only, default_transaction_read_only=on', immutableFinanceUnchanged: true, externalJobsDisabled: true, liveWrites: false, existingActiveUsersChecked: users.length, existingVendorsChecked: vendors, successfulHttpChecks: checks.length, readyReportsDownloaded, failures, checks };
  const evidenceDirectory = process.env.VOYA_REHEARSAL_EVIDENCE_DIR || '../docs/multi-outlet-evidence';
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, pg15 ? 'staging-http-pg15-smoke.json' : 'staging-http-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, checks: undefined }, null, 2));
  assert.equal(failures.length, 0, 'Staging HTTP compatibility failures');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await app?.close(); await prisma.$disconnect(); });
