const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.BULK_IMPORT_STAGING_DATABASE_URL);
assert(url.hostname === '127.0.0.1' && url.port === '55445' && url.username === 'voya_staging' && /^\/voya_import_fixes_\d+$/.test(url.pathname));
const evidence = path.resolve(process.env.BULK_IMPORT_EVIDENCE_DIR), fixtures = JSON.parse(fs.readFileSync(path.join(evidence, 'editor-browser-session-fixtures.json')));
const four = JSON.parse(fs.readFileSync(path.join(evidence, 'four-browser-fixtures.json'))); fixtures.editor = four;
assert(/^[A-Z0-9-]+$/.test(four.prefix));
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
  ]) catalogue[table] = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t ${join} WHERE ${product}.id<>'${fixtures.editor.productId}' AND COALESCE(${product}."sourceImportKey",'') NOT LIKE '${fixtures.prefix}%' AND COALESCE(${product}."sourceImportKey",'') NOT LIKE '${four.prefix}%'`))[0];
  const active = await tx.ratePlanCommercialVersion.findMany({ where: { ratePlan: { variantId: { in: [fixtures.editor.personVariantId, fixtures.editor.groupVariantId] } }, status: 'ACTIVE' }, include: { travellerPrices: { orderBy: { travellerType: 'asc' } } }, orderBy: { id: 'asc' } });
  return JSON.parse(JSON.stringify({ finance, catalogue, active }));
}

(async () => {
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const current = await hashes(tx), baseline = path.join(evidence, 'four-browser-baseline.json');
    if (process.argv.includes('--baseline')) { assert(!fs.existsSync(baseline)); fs.writeFileSync(baseline, JSON.stringify(current, null, 2)); return { pass: true, baselineRecorded: true }; }
    assert.deepEqual(current, JSON.parse(fs.readFileSync(baseline)), 'Existing catalogue, approved prices or finance changed');
    const product = await tx.product.findUniqueOrThrow({ where: { id: four.productId } });
    assert.equal(product.status, 'DRAFT'); assert.equal(product.outletId, four.outletId);
    const readVersion = (variantId, day) => tx.ratePlanCommercialVersion.findFirstOrThrow({ where: { ratePlan: { variantId }, status: 'DRAFT', effectiveFrom: { lte: new Date(day) }, effectiveTo: { gt: new Date(day) } }, include: { travellerPrices: true }, orderBy: { versionNumber: 'desc' } });
    const verified = [];
    for (const [day, adult, child, late] of [['2026-12-05','1850.4321','0',false],['2026-12-12','1950','0',false],['2026-12-17','2000','0',false],['2027-01-10','2000','950',true],['2027-01-20','2050','950',true],['2027-02-05','2050','950',true]]) {
      const version = await readVersion(four.personVariantId, day), amounts = Object.fromEntries(version.travellerPrices.map(price => [price.travellerType, String(price.amount)]));
      assert.deepEqual(amounts, { ...four.amounts[late ? 'january' : 'december'], ADULT: adult, CHILD: child }, day);
      const visitors = version.sourcePayload.visitorPrices; assert.equal(visitors.length, 6);
      for (const [type, amount] of Object.entries(amounts)) assert.equal(visitors.find(price => price.travellerType === type).indian, amount, day + ' ' + type);
      assert.equal(version.sourcePayload.visitorEligibilityBasis, 'NATIONALITY'); assert.equal(version.sourcePayload.visitorVerificationMode, 'DOCUMENT_AT_BOOKING');
      const group = await readVersion(four.groupVariantId, day); assert.equal(String(group.supplierBaseAmount), '7300');
      for (const [key, value] of Object.entries(four.groupRules)) assert.deepEqual(group.sourcePayload[key], value, day + ' ' + key);
      verified.push({ day, amounts, groupAmount: String(group.supplierBaseAmount), groupRulesPreserved: true });
    }
    const keys = [...fixtures.importKeys, four.prefix + '-XLS'];
    const drafts = await tx.product.findMany({ where: { sourceImportKey: { in: keys }, deletedAt: null }, include: { revisions: true, variants: { include: { ratePlans: { include: { commercialVersions: true } }, schedules: { include: { sessions: true } } } } } });
    assert.equal(drafts.length, 5);
    for (const draft of drafts) {
      assert.equal(draft.status, 'DRAFT'); assert.equal(draft.outletId, four.outletId); assert.equal(draft.variants.length, 2);
      assert.equal(draft.variants.flatMap(variant => variant.ratePlans).length, 2);
      assert.equal(draft.variants.flatMap(variant => variant.schedules).length, 2);
      assert.equal(draft.variants.flatMap(variant => variant.schedules).flatMap(schedule => schedule.sessions).length, 28);
      if (draft.sourceImportKey.endsWith('-XLS')) {
        assert.equal(draft.revisions[0].durationUnit, 'HOURS');
        for (const version of draft.variants.flatMap(variant => variant.ratePlans).flatMap(plan => plan.commercialVersions)) assert.equal(version.effectiveFrom.toISOString().slice(0, 10), '2026-12-01');
      }
    }
    for (const [filename, strings] of [['four-outlet-errors.csv',['A4','authorized']],['four-duplicate-errors.csv',['product_key','already']]]) {
      const text = fs.readFileSync(path.join(evidence, filename), 'utf8'); for (const word of strings) assert(text.toLowerCase().includes(word.toLowerCase()), filename + ' missing ' + word);
    }
    return { pass: true, readOnly: true, protectedFinanceTables: 12, protectedCatalogueTables: 12, approvedPricesUnchanged: true, verifiedDates: verified, importedDrafts: drafts.map(draft => ({ id: draft.id, key: draft.sourceImportKey })), errorDownloadsVerified: true };
  }, { timeout: 30000 });
  fs.writeFileSync(path.join(evidence, process.argv.includes('--baseline') ? 'four-browser-baseline-report.json' : 'four-browser-verification.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
