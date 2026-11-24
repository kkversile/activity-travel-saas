const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
assert(url.hostname === '127.0.0.1' && url.port === '55445' && url.username === 'voya_staging' && /^\/voya_import_fixes_\d+$/.test(url.pathname));
const evidence = path.resolve(process.env.BULK_IMPORT_EVIDENCE_DIR), fixtures = JSON.parse(fs.readFileSync(path.join(evidence, 'editor-browser-session-fixtures.json')));
assert(/^[A-Z0-9-]+$/.test(fixtures.prefix) && /^[0-9a-f-]{36}$/.test(fixtures.editor.productId));
const db = new PrismaClient({ datasourceUrl: url.href });
const financeTables = ['Booking', 'BookingEconomicsSnapshot', 'FinancialEvent', 'Payout', 'SettlementBatch', 'SettlementLine', 'SettlementEventAllocation', 'SettlementHold', 'PayoutAttempt', 'PayoutReleaseApprovalRequest', 'CommissionInvoice', 'FinanceConfiguration'];
async function hashes(tx) {
  const finance = {}, catalogue = {};
  for (const table of financeTables) finance[table] = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`))[0];
  const variant = 'JOIN "ProductVariant" v ON v.id=t."variantId" JOIN "Product" p ON p.id=v."productId"';
  const plan = 'JOIN "RatePlan" r ON r.id=t."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"';
  const schedule = 'JOIN "ScheduleTemplate" s ON s.id=t."scheduleTemplateId" JOIN "ProductVariant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId"';
  for (const [table, join, product] of [
    ['Product', '', 't'], ['ProductRevision', 'JOIN "Product" p ON p.id=t."productId"', 'p'], ['ProductVariant', 'JOIN "Product" p ON p.id=t."productId"', 'p'],
    ['RatePlan', variant, 'p'], ['RatePlanCommercialVersion', plan, 'p'], ['TravellerRule', plan, 'p'], ['CancellationRule', plan, 'p'],
    ['RatePlanTravellerPrice', 'JOIN "RatePlanCommercialVersion" c ON c.id=t."commercialVersionId" JOIN "RatePlan" r ON r.id=c."ratePlanId" JOIN "ProductVariant" v ON v.id=r."variantId" JOIN "Product" p ON p.id=v."productId"', 'p'],
    ['ScheduleTemplate', variant, 'p'], ['ScheduleSlotTemplate', schedule, 'p'], ['ServiceSession', schedule, 'p'],
    ['InventoryState', 'JOIN "ServiceSession" ss ON ss.id=t."sessionId" JOIN "ScheduleTemplate" s ON s.id=ss."scheduleTemplateId" JOIN "ProductVariant" v ON v.id=s."variantId" JOIN "Product" p ON p.id=v."productId"', 'p'],
  ]) catalogue[table] = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t ${join} WHERE ${product}.id<>'${fixtures.editor.productId}' AND COALESCE(${product}."sourceImportKey",'') NOT LIKE '${fixtures.prefix}%'`))[0];
  const active = await tx.ratePlanCommercialVersion.findMany({ where: { ratePlan: { variantId: { in: [fixtures.editor.personVariantId, fixtures.editor.groupVariantId] } }, status: 'ACTIVE' }, include: { travellerPrices: { orderBy: { travellerType: 'asc' } } }, orderBy: { id: 'asc' } });
  return JSON.parse(JSON.stringify({ finance, catalogue, active }));
}
(async () => {
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const current = await hashes(tx), baselinePath = path.join(evidence, 'editor-browser-baseline.json');
    if (process.argv.includes('--baseline')) { fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2)); return { baselineRecorded: true, protectedFinanceTables: 12, protectedCatalogueTables: 12 }; }
    assert.deepEqual(current, JSON.parse(fs.readFileSync(baselinePath)), 'Existing catalogue, approved prices or finance changed');
    const product = await tx.product.findUniqueOrThrow({ where: { id: fixtures.editor.productId } }); assert.equal(product.status, 'DRAFT'); assert.equal(product.outletId, fixtures.editor.outletId);
    const version = await tx.ratePlanCommercialVersion.findFirstOrThrow({ where: { ratePlan: { variantId: fixtures.editor.personVariantId }, status: 'DRAFT', effectiveFrom: { lte: new Date('2026-12-15') }, effectiveTo: { gt: new Date('2026-12-15') } }, include: { travellerPrices: true }, orderBy: { versionNumber: 'desc' } });
    const prices = Object.fromEntries(version.travellerPrices.map(price => [price.travellerType, String(price.amount)]));
    assert.deepEqual(prices, { ADULT: '2050', CHILD: '0', SENIOR: '1400', INFANT: '0', YOUTH: '1200.1234', GROUP: '2000' });
    const visitors = version.sourcePayload.visitorPrices; assert.equal(visitors.length, 6);
    assert.deepEqual(visitors.find(price => price.travellerType === 'ADULT'), { travellerType: 'ADULT', indian: '2050', foreign: '2600' });
    assert.deepEqual(visitors.find(price => price.travellerType === 'CHILD'), { travellerType: 'CHILD', indian: '0', foreign: '1500' });
    assert.deepEqual(visitors.find(price => price.travellerType === 'INFANT'), { travellerType: 'INFANT', indian: '0', foreign: '0' });
    assert.equal(visitors.find(price => price.travellerType === 'YOUTH').indian, '1200.1234');
    assert.equal(version.sourcePayload.visitorEligibilityBasis, 'NATIONALITY'); assert.equal(version.sourcePayload.visitorVerificationMode, 'DOCUMENT_AT_BOOKING'); assert.equal(version.sourcePayload.mrpAmount, '3000');
    const group = await tx.ratePlanCommercialVersion.findFirstOrThrow({ where: { ratePlan: { variantId: fixtures.editor.groupVariantId }, status: 'DRAFT' }, orderBy: { versionNumber: 'desc' } });
    assert.equal(String(group.supplierBaseAmount), '7300'); assert.equal(group.pricingUnit, 'GROUP');
    const drafts = await tx.product.findMany({ where: { sourceImportKey: { in: fixtures.importKeys }, deletedAt: null }, include: { variants: { include: { ratePlans: true, schedules: { include: { sessions: true } } } } } });
    assert.equal(drafts.length, fixtures.importKeys.length);
    for (const draft of drafts) { assert.equal(draft.status, 'DRAFT'); assert.equal(draft.outletId, fixtures.editor.outletId); assert.equal(draft.variants.length, 2); assert.equal(draft.variants.reduce((sum, variant) => sum + variant.ratePlans.length, 0), 2); assert.equal(draft.variants.reduce((sum, variant) => sum + variant.schedules.length, 0), 2); assert.equal(draft.variants.flatMap(variant => variant.schedules).reduce((sum, schedule) => sum + schedule.sessions.length, 0), 28); }
    const errors = fs.readFileSync(path.join(evidence, 'editor-wrong-outlet-errors.csv'), 'utf8'); assert(errors.includes('A4') && errors.includes('authorized'));
    const duplicate = fs.readFileSync(path.join(evidence, 'editor-duplicate-errors.csv'), 'utf8'); assert(duplicate.includes('products[0].Basic_Info[0].product_key') && duplicate.includes('products[1].Basic_Info[0].product_key'));
    return { pass: true, readOnly: true, protectedFinanceTablesUnchanged: 12, existingCatalogueTablesUnchanged: 12, approvedPricesUnchanged: true, importedDrafts: drafts.map(item => ({ id: item.id, key: item.sourceImportKey })), person: { prices, visitors }, groupAmount: String(group.supplierBaseAmount), errorDownloadsVerified: true };
  }, { timeout: 30000 });
  fs.writeFileSync(path.join(evidence, process.argv.includes('--baseline') ? 'editor-browser-baseline-report.json' : 'editor-browser-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
