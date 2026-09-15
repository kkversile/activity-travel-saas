import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

type Row = Record<string, unknown>;

const json = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? Number(item) : item, 2);

async function main() {
  const prisma = new PrismaClient();
  const output = join(process.cwd(), '..', 'docs', 'VOYA_PHASE12_EXISTING_CHANNEL_MAPPING_AUDIT.md');
  await mkdir(join(process.cwd(), '..', 'docs'), { recursive: true });
  try {
    const liveTables = await prisma.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    console.log(json({ liveTables }));
    const channels = await prisma.$queryRawUnsafe<Row[]>(`SELECT "id", "code", "name", "active", "createdAt", "updatedAt" FROM "public"."DistributionChannel" ORDER BY "code"`);
    const mappingCounts = await prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(*)::int AS "total", COUNT(*) FILTER (WHERE "enabled")::int AS "enabled", COUNT(*) FILTER (WHERE NOT "enabled")::int AS "disabled" FROM "public"."RatePlanChannelMapping"`);
    const mappingsByChannel = await prisma.$queryRawUnsafe<Row[]>(`SELECT dc."code", COUNT(rpcm.*)::int AS "mappingCount", COUNT(rpcm.*) FILTER (WHERE rpcm."enabled")::int AS "enabled", COUNT(rpcm.*) FILTER (WHERE NOT rpcm."enabled")::int AS "disabled" FROM "public"."DistributionChannel" dc LEFT JOIN "public"."RatePlanChannelMapping" rpcm ON rpcm."channelId" = dc."id" GROUP BY dc."id", dc."code" ORDER BY dc."code"`);
    const voyaAgent = channels.find((row) => row.code === 'VOYA_AGENT');
    const ratePlansWithoutAgent = voyaAgent ? await prisma.$queryRawUnsafe<Row[]>(`SELECT rp."id", rp."ratePlanCode", rp."status", pv."variantCode", p."productCode" FROM "public"."RatePlan" rp JOIN "public"."ProductVariant" pv ON pv."id" = rp."variantId" JOIN "public"."Product" p ON p."id" = pv."productId" LEFT JOIN "public"."RatePlanChannelMapping" rpcm ON rpcm."ratePlanId" = rp."id" AND rpcm."channelId" = $1 WHERE rpcm."id" IS NULL ORDER BY p."productCode", pv."variantCode", rp."ratePlanCode"`, voyaAgent.id) : [];
    const represented = voyaAgent ? await prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(DISTINCT p."id")::int AS "products", COUNT(DISTINCT pv."id")::int AS "variants", COUNT(DISTINCT rp."id")::int AS "ratePlans" FROM "public"."RatePlanChannelMapping" rpcm JOIN "public"."RatePlan" rp ON rp."id" = rpcm."ratePlanId" JOIN "public"."ProductVariant" pv ON pv."id" = rp."variantId" JOIN "public"."Product" p ON p."id" = pv."productId" WHERE rpcm."channelId" = $1`, voyaAgent.id) : [];
    const bookingCounts = await prisma.$queryRawUnsafe<Row[]>(`SELECT COALESCE(dc."code", '(no DistributionChannel)') AS "channel", b."distributionChannelId", b."channel" AS "legacyChannel", COUNT(*)::int AS "bookings" FROM "public"."Booking" b LEFT JOIN "public"."DistributionChannel" dc ON dc."id" = b."distributionChannelId" GROUP BY dc."code", b."distributionChannelId", b."channel" ORDER BY "channel", "legacyChannel"`);
    const legacyValues = await prisma.$queryRawUnsafe<Row[]>(`SELECT value AS "legacyValue", COUNT(*)::int AS "revisions" FROM "public"."ProductRevision" pr CROSS JOIN LATERAL unnest(pr."channels") AS value GROUP BY value ORDER BY value`);
    const legacyNonEmpty = await prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(*)::int AS "nonEmptyRevisions", COUNT(*) FILTER (WHERE cardinality("channels") > 0)::int AS "arrayNonEmptyRevisions", COUNT(*)::int AS "totalRevisions" FROM "public"."ProductRevision"`);
    const duplicateProductCodes = await prisma.$queryRawUnsafe<Row[]>(`SELECT "productCode", COUNT(*)::int AS "count" FROM "public"."Product" GROUP BY "productCode" HAVING COUNT(*) > 1 ORDER BY "productCode"`);
    const duplicateVariantCodes = await prisma.$queryRawUnsafe<Row[]>(`SELECT "productId", "variantCode", COUNT(*)::int AS "count" FROM "public"."ProductVariant" GROUP BY "productId", "variantCode" HAVING COUNT(*) > 1 ORDER BY "productId", "variantCode"`);
    const duplicateRatePlanCodes = await prisma.$queryRawUnsafe<Row[]>(`SELECT "variantId", "ratePlanCode", COUNT(*)::int AS "count" FROM "public"."RatePlan" GROUP BY "variantId", "ratePlanCode" HAVING COUNT(*) > 1 ORDER BY "variantId", "ratePlanCode"`);
    const hierarchyIssues = voyaAgent ? await prisma.$queryRawUnsafe<Row[]>(`SELECT rpcm."id", rpcm."ratePlanId", rp."ratePlanCode", pv."variantCode", p."productCode" FROM "public"."RatePlanChannelMapping" rpcm JOIN "public"."RatePlan" rp ON rp."id" = rpcm."ratePlanId" JOIN "public"."ProductVariant" pv ON pv."id" = rp."variantId" JOIN "public"."Product" p ON p."id" = pv."productId" WHERE rpcm."channelId" = $1 AND (rp."variantId" <> pv."id" OR pv."productId" <> p."id")`, voyaAgent.id) : [];
    const report = [
      '# VOYA Phase 12 Existing Channel Mapping Audit',
      '',
      `Generated at: ${new Date().toISOString()}`,
      '',
      'This is a read-only audit of the live PostgreSQL database before Phase 12 schema or backfill mutation. Existing channel data remains authoritative; no B2B/B2C legacy values are converted into channels by this audit.',
      '',
      '## Existing distribution channels',
      '',
      `DistributionChannel count: **${channels.length}**`,
      '',
      '| ID | Code | Name | Active |',
      '|---|---|---|---|',
      ...channels.map((row) => `| ${row.id} | ${row.code} | ${row.name} | ${row.active} |`),
      '',
      '## Rate-plan channel mappings',
      '',
      `Total mappings: **${mappingCounts[0]?.total ?? 0}**; enabled: **${mappingCounts[0]?.enabled ?? 0}**; disabled: **${mappingCounts[0]?.disabled ?? 0}**.`,
      '',
      '| Channel | Mappings | Enabled | Disabled |',
      '|---|---:|---:|---:|',
      ...mappingsByChannel.map((row) => `| ${row.code} | ${row.mappingCount} | ${row.enabled} | ${row.disabled} |`),
      '',
      `VOYA_AGENT identity found: **${voyaAgent ? `yes (${voyaAgent.id})` : 'no'}**.`,
      `Rate Plans without a VOYA_AGENT mapping: **${ratePlansWithoutAgent.length}**.`,
      '',
      '## Products and variants represented by mappings',
      '',
      `VOYA_AGENT mapped products: **${represented[0]?.products ?? 0}**; variants: **${represented[0]?.variants ?? 0}**; rate plans: **${represented[0]?.ratePlans ?? 0}**.`,
      '',
      '## Booking distribution state',
      '',
      '| Channel code | Distribution channel ID | Legacy channel value | Bookings |',
      '|---|---|---|---:|',
      ...bookingCounts.map((row) => `| ${row.channel} | ${row.distributionChannelId ?? ''} | ${row.legacyChannel ?? ''} | ${row.bookings} |`),
      '',
      '## Legacy ProductRevision.channels',
      '',
      `ProductRevision rows: **${legacyNonEmpty[0]?.totalRevisions ?? 0}**; rows with non-empty channels: **${legacyNonEmpty[0]?.nonEmptyRevisions ?? 0}**.`,
      '',
      'Distinct historical values (metadata only; not canonical distribution mappings):',
      '',
      '| Historical value | Revisions |',
      '|---|---:|',
      ...(legacyValues.length ? legacyValues.map((row) => `| ${row.legacyValue} | ${row.revisions} |`) : ['| *(none)* | 0 |']),
      '',
      'Decision: `ProductRevision.channels` remains legacy metadata and is not used as the Phase 12 eligibility source of truth. Values such as B2B/B2C, if present, are not automatically materialized as DistributionChannel rows.',
      '',
      '## Duplicate and consistency checks',
      '',
      `Duplicate Product.productCode values: **${duplicateProductCodes.length}**.`,
      `Duplicate ProductVariant.variantCode values within a product: **${duplicateVariantCodes.length}**.`,
      `Duplicate RatePlan.ratePlanCode values within a variant: **${duplicateRatePlanCodes.length}**.`,
      `VOYA_AGENT hierarchy inconsistencies: **${hierarchyIssues.length}**.`,
      '',
      '### Raw exception details',
      '',
      '```json',
      json({ ratePlansWithoutAgent, duplicateProductCodes, duplicateVariantCodes, duplicateRatePlanCodes, hierarchyIssues }),
      '```',
      '',
      '## Phase 12 migration consequence',
      '',
      'The existing VOYA_AGENT channel must retain its ID and code. Phase 12 backfill may classify and enrich that channel, create only the required internal contract and canonical mappings, and must not fabricate external channels or rewrite bookings/snapshots.',
      '',
    ].join('\n');
    await writeFile(output, report, 'utf8');
    console.log(json({ output, channels, mappingCounts, mappingsByChannel, ratePlansWithoutAgent: ratePlansWithoutAgent.length, represented, bookingCounts, legacyValues, legacyNonEmpty, duplicateProductCodes, duplicateVariantCodes, duplicateRatePlanCodes, hierarchyIssues }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
