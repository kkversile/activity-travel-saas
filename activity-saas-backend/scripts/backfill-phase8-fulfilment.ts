import { PrismaClient, FulfilmentMode } from '@prisma/client';

const prisma = new PrismaClient();
const LEGACY_FIELDS = ['generatePnr', 'label', 'ticketOnly', 'vendorVoucherFlag', 'offlineVoucher', 'autoRedeem', 'qrType'] as const;
const DEFAULTS: Record<string, unknown> = { generatePnr: null, label: null, ticketOnly: false, vendorVoucherFlag: null, offlineVoucher: false, autoRedeem: false, qrType: null };

function jsonValue(value: unknown) {
  return value === undefined ? null : value;
}

function explicitMode(row: any): FulfilmentMode | null {
  const payload = row.sourcePayload && typeof row.sourcePayload === 'object' ? row.sourcePayload : {};
  const value = String(payload.fulfilmentMode ?? payload.fulfillmentMode ?? payload.voucherMode ?? '').trim().toUpperCase();
  return Object.values(FulfilmentMode).includes(value as FulfilmentMode) ? value as FulfilmentMode : null;
}

async function main() {
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT pr."id" AS "revisionId", pr."productId", p."productCode", pv."id" AS "variantId", rp."id" AS "ratePlanId", rp."generatePnr", rp."label", rp."ticketOnly", rp."vendorVoucherFlag", rp."offlineVoucher", rp."autoRedeem", rp."qrType", rp."sourcePayload" FROM "ProductRevision" pr JOIN "Product" p ON p."id" = pr."productId" JOIN "ProductVariant" pv ON pv."productId" = pr."productId" JOIN "RatePlan" rp ON rp."variantId" = pv."id" WHERE pr."status" = 'PUBLISHED' ORDER BY pr."id", rp."id"`);
  const revisions = new Map<string, any[]>();
  for (const row of rows) revisions.set(row.revisionId, [...(revisions.get(row.revisionId) ?? []), row]);
  const existing: any[] = await prisma.productFulfilmentPolicy.findMany({ select: { productRevisionId: true } });
  const existingIds = new Set(existing.map((row) => row.productRevisionId));
  const report: any[] = [];
  let created = 0;
  for (const [revisionId, plans] of revisions) {
    const fields = Object.fromEntries(LEGACY_FIELDS.map((field) => { const values = plans.map((row) => jsonValue(row[field])); const nonDefault = values.filter((value) => JSON.stringify(value) !== JSON.stringify(DEFAULTS[field])); return [field, { nonDefaultCount: nonDefault.length, distinctValues: [...new Set(values.map((value) => JSON.stringify(value)))].map((value) => JSON.parse(value)), ratePlansAffected: plans.filter((row) => JSON.stringify(row[field]) !== JSON.stringify(DEFAULTS[field])).map((row) => row.ratePlanId) }]; }));
    const explicitModes = [...new Set(plans.map(explicitMode).filter(Boolean))] as FulfilmentMode[];
    const conflicting = explicitModes.length > 1;
    const mappedMode = explicitModes.length === 1 && !conflicting ? explicitModes[0] : null;
    const reviewRequired = !mappedMode || conflicting;
    const metadata = { source: 'phase8 legacy backfill', productCode: plans[0]?.productCode ?? null, ratePlans: plans.map((row) => ({ id: row.ratePlanId, variantId: row.variantId, legacy: Object.fromEntries(LEGACY_FIELDS.map((field) => [field, jsonValue(row[field])])), explicitMode: explicitMode(row) })), mapping: mappedMode ? { mode: mappedMode, basis: 'explicit fulfilmentMode/voucherMode in legacy sourcePayload' } : null, reviewReason: conflicting ? 'Conflicting explicit fulfilment modes across connected RatePlans' : !mappedMode ? 'Legacy fields do not prove a traveller fulfilment mode' : null };
    if (!existingIds.has(revisionId)) { await prisma.productFulfilmentPolicy.create({ data: { productRevisionId: revisionId, mode: mappedMode, reviewRequired, migrationMetadata: metadata } }); created += 1; }
    report.push({ revisionId, productCode: plans[0]?.productCode ?? null, ratePlans: plans.length, conflicting, mappedMode, reviewRequired, fields });
  }
  const published: any[] = await prisma.$queryRawUnsafe(`SELECT pr."id" AS "revisionId", p."productCode" FROM "ProductRevision" pr JOIN "Product" p ON p."id" = pr."productId" WHERE pr."status" = 'PUBLISHED'`);
  for (const revision of published.filter((row) => !revisions.has(row.revisionId))) {
    if (!existingIds.has(revision.revisionId)) { await prisma.productFulfilmentPolicy.create({ data: { productRevisionId: revision.revisionId, mode: null, reviewRequired: true, migrationMetadata: { source: 'phase8 legacy backfill', productCode: revision.productCode, ratePlans: [], reviewReason: 'Published revision has no connected RatePlan evidence' } } }); created += 1; }
    report.push({ revisionId: revision.revisionId, productCode: revision.productCode, ratePlans: 0, conflicting: false, mappedMode: null, reviewRequired: true, fields: {} });
  }
  console.log(JSON.stringify({ passing: true, publishedRevisions: published.length, connectedRatePlans: rows.length, policiesCreated: created, report }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
