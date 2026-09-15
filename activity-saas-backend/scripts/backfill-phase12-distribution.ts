import { ChannelContractStatus, ChannelInventoryExposureMode, ChannelMappingStatus, DistributionCapability, DistributionChannelType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function audit(tx: any, actor: any, action: string, entityType: string, entityId: string, afterState: Record<string, unknown>) {
  await tx.auditLog.create({ data: { actorId: actor.id, actorRole: actor.role, action, entityType, entityId, afterState } });
}

async function outbox(tx: any, eventType: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>) {
  await tx.outboxEvent.create({ data: { eventType, aggregateType, aggregateId, payload } });
}

async function main() {
  const actor = await prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, select: { id: true, role: true } });
  if (!actor) throw new Error('An active ADMIN user is required for Phase 12 backfill');

  const result = await prisma.$transaction(async (tx) => {
    const channels = await tx.distributionChannel.findMany({ orderBy: { code: 'asc' } });
    const channelSummary: Array<Record<string, unknown>> = [];
    let contractsCreated = 0;
    let productMappingsCreated = 0;
    let variantMappingsCreated = 0;
    let rateMappingsEnriched = 0;
    let inventoryRulesCreated = 0;

    for (const channel of channels) {
      if (channel.code !== 'VOYA_AGENT') {
        channelSummary.push({ code: channel.code, type: channel.type, action: 'preserved; no external contract or credential fabricated' });
        continue;
      }

      const classified = await tx.distributionChannel.update({ where: { id: channel.id }, data: { type: DistributionChannelType.INTERNAL_MARKETPLACE } });
      const existingContract = await tx.channelContract.findFirst({ where: { channelId: channel.id, status: ChannelContractStatus.ACTIVE } });
      if (!existingContract) {
        const latest = await tx.channelContract.findFirst({ where: { channelId: channel.id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
        const contract = await tx.channelContract.create({ data: { channelId: channel.id, versionNumber: (latest?.versionNumber ?? 0) + 1, status: ChannelContractStatus.ACTIVE, name: 'VOYA_AGENT Internal Marketplace Contract', effectiveFrom: new Date('2020-01-01T00:00:00.000Z'), capabilities: [DistributionCapability.CATALOG_READ, DistributionCapability.AVAILABILITY_READ, DistributionCapability.PRICING_READ, DistributionCapability.EVENT_READ], allowedCurrencies: ['INR'], availabilityHorizonDays: 365, lockVersion: 1, createdById: actor.id, activatedById: actor.id, activatedAt: new Date(), metadata: { migration: 'phase12', internal: true } } });
        await audit(tx, actor, 'CHANNEL_CONTRACT_BACKFILLED', 'ChannelContract', contract.id, { channelCode: classified.code, versionNumber: contract.versionNumber, status: contract.status });
        await outbox(tx, 'CHANNEL_CONTRACT_ACTIVATED', 'ChannelContract', contract.id, { channelCode: classified.code, versionNumber: contract.versionNumber, internalMigration: true });
        contractsCreated += 1;
      }

      const mappings = await tx.ratePlanChannelMapping.findMany({ where: { channelId: channel.id }, include: { ratePlan: { include: { variant: { include: { product: true } } } } } });
      for (const mapping of mappings) {
        const product = mapping.ratePlan.variant.product;
        const variant = mapping.ratePlan.variant;
        const externalProductCode = product.productCode.trim();
        const externalVariantCode = variant.variantCode.trim();
        const externalRatePlanCode = mapping.ratePlan.ratePlanCode.trim();
        if (!externalProductCode || !externalVariantCode || !externalRatePlanCode) throw new Error(`Phase 12 backfill stopped: empty stable code in ${mapping.ratePlan.id}`);

        const productMapping = await tx.productChannelMapping.findUnique({ where: { channelId_productId: { channelId: channel.id, productId: product.id } } });
        if (productMapping && productMapping.externalProductCode !== externalProductCode) throw new Error(`Phase 12 backfill stopped: Product mapping code collision for ${product.id}`);
        if (!productMapping) {
          await tx.productChannelMapping.create({ data: { channelId: channel.id, productId: product.id, externalProductCode, status: mapping.status === ChannelMappingStatus.ACTIVE ? ChannelMappingStatus.ACTIVE : ChannelMappingStatus.DISABLED, createdById: actor.id } });
          productMappingsCreated += 1;
        }

        const variantMapping = await tx.variantChannelMapping.findUnique({ where: { channelId_variantId: { channelId: channel.id, variantId: variant.id } } });
        if (variantMapping && variantMapping.externalVariantCode !== externalVariantCode) throw new Error(`Phase 12 backfill stopped: Variant mapping code collision for ${variant.id}`);
        if (!variantMapping) {
          await tx.variantChannelMapping.create({ data: { channelId: channel.id, variantId: variant.id, externalVariantCode, status: mapping.status === ChannelMappingStatus.ACTIVE ? ChannelMappingStatus.ACTIVE : ChannelMappingStatus.DISABLED, createdById: actor.id } });
          variantMappingsCreated += 1;
        }

        const updated = await tx.ratePlanChannelMapping.update({ where: { id: mapping.id }, data: { externalRatePlanCode, status: mapping.enabled ? ChannelMappingStatus.ACTIVE : ChannelMappingStatus.DISABLED, createdById: mapping.createdById ?? actor.id, activatedAt: mapping.enabled ? (mapping.activatedAt ?? new Date()) : null, disabledAt: mapping.enabled ? null : (mapping.disabledAt ?? new Date()), migrationMetadata: { source: 'phase12-backfill', legacyEnabled: mapping.enabled } } });
        rateMappingsEnriched += updated.externalRatePlanCode === externalRatePlanCode ? 1 : 0;
        const rule = await tx.channelInventoryRule.findUnique({ where: { ratePlanChannelMappingId: mapping.id } });
        if (!rule) {
          await tx.channelInventoryRule.create({ data: { ratePlanChannelMappingId: mapping.id, exposureMode: ChannelInventoryExposureMode.EXACT_REMAINING, capacityBuffer: 0 } });
          inventoryRulesCreated += 1;
        }
      }
      channelSummary.push({ code: channel.code, id: channel.id, type: classified.type, activeContract: true, mappings: mappings.length });
    }

    const legacy = await tx.$queryRaw<Array<{ value: string; revisions: number }>>`SELECT value, COUNT(*)::int AS revisions FROM "public"."ProductRevision" CROSS JOIN LATERAL unnest("channels") AS value GROUP BY value ORDER BY value`;
    const latestOutbox = await tx.outboxEvent.findFirst({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, createdAt: true } });
    if (latestOutbox) await tx.distributionProjectionCursor.upsert({ where: { consumerKey: 'distribution-v1' }, update: { lastCreatedAt: latestOutbox.createdAt, lastEventId: latestOutbox.id }, create: { consumerKey: 'distribution-v1', lastCreatedAt: latestOutbox.createdAt, lastEventId: latestOutbox.id } });
    return { channelSummary, contractsCreated, productMappingsCreated, variantMappingsCreated, rateMappingsEnriched, inventoryRulesCreated, legacyChannelValues: legacy, projectionBoundary: latestOutbox };
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
