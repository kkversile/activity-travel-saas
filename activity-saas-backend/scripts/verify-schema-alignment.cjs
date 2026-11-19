// Real database regression checks, restricted to dedicated disposable copies.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
assert(url.hostname === '127.0.0.1'
  && ((url.port === '55445' && url.username === 'voya_staging') || (url.port === '55439' && url.username === 'voya_local'))
  && /^\/voya_readiness_(recovery|alignment)_/.test(url.pathname), 'Dedicated restored/fresh staging database required');
const prisma = new PrismaClient();
async function fingerprints() {
  const result = {};
  for (const { tablename } of await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")) {
    result[tablename] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS rows, md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${tablename.replaceAll('"', '""')}" t`))[0];
  }
  return result;
}
async function main() {
  const before = await fingerprints();
  const [foreignKey] = await prisma.$queryRawUnsafe(`SELECT confdeltype::text AS "deleteAction", convalidated AS validated FROM pg_constraint WHERE conrelid='"Payout"'::regclass AND conname='Payout_tenantId_fkey'`);
  assert.deepEqual(foreignKey, { deleteAction: 'r', validated: true });
  await assert.rejects(prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: 'Schema alignment rollback fixture', slug: 'alignment-' + crypto.randomUUID(), kind: 'VENDOR' } });
    await tx.payout.create({ data: { tenantId: tenant.id, amount: '1', status: 'SCHEDULED', dueDate: new Date(), currency: 'INR', recordType: 'LEGACY' } });
    await tx.tenant.delete({ where: { id: tenant.id } });
  }), (error) => error.code === 'P2003', 'Tenant deletion must not cascade into payout history');
  const version = (await prisma.supplierQualityPolicy.aggregate({ _max: { versionNumber: true } }))._max.versionNumber || 0;
  await assert.rejects(prisma.$transaction(async (tx) => {
    const maker = await tx.user.create({ data: { email: 'alignment-' + crypto.randomUUID() + '@invalid.invalid', fullName: 'Rolled-back migration fixture', passwordHash: 'disabled-fixture-no-login', role: 'SUPER_ADMIN', active: false } });
    const data = { id: crypto.randomUUID(), createdById: maker.id, versionNumber: version + 1000, name: 'Schema alignment rollback fixture', status: 'DRAFT', measurementWindowDays: 30, shortNoticeDays: 3, lastMinuteStopSellDays: 1 };
    await tx.supplierQualityPolicy.create({ data });
    await tx.supplierQualityPolicy.create({ data: { ...data, id: crypto.randomUUID() } });
  }), (error) => error.code === 'P2002', 'Policy versions must be unique');
  const dates = await prisma.$queryRawUnsafe(`SELECT column_name, data_type, datetime_precision FROM information_schema.columns WHERE table_schema='public' AND table_name='VendorReview' AND column_name IN ('reviewedAt','repliedAt','createdAt','updatedAt')`);
  assert.equal(dates.length, 4);
  for (const column of dates) { assert.equal(column.data_type, 'timestamp with time zone'); assert.equal(column.datetime_precision, 6); }
  const indexes = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE schemaname='public'");
  for (const name of ['SupplierQualityPolicy_versionNumber_key','ExperienceOfferPlacement_experienceMasterId_priority_idx','ExperienceOfferPlacement_experienceMasterId_pinnedUntil_idx','BookingFulfilment_status_generationStatus_updatedAt_idx','FinancialEvent_vendorTenantId_currency_status_idx']) assert(indexes.some((index) => index.indexname === name), 'Missing preserved/new index ' + name);
  assert.deepEqual(await fingerprints(), before, 'Regression fixtures must roll back completely');
  const report = { checkedAt: new Date().toISOString(), passed: true, database: url.pathname.slice(1), payoutHistoryDeleteRestricted: true, policyVersionUnique: true, reviewTimezonePrecisionPreserved: true, legacyReadIndexesPreserved: true, fixtureTransactionsRolledBack: true, tablesUnchanged: Object.keys(before).length };
  const evidence = process.env.VOYA_REHEARSAL_EVIDENCE_DIR || '../outputs/final-recovery-20261119'; fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'schema-alignment-' + url.port + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
