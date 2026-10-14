import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelInventoryExposureMode, ChannelMappingStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryRuleDto, MappingDto, RateMappingDto, VariantMappingDto } from './distribution.dto';

const normalized = (value: string, label: string) => { const result = value.trim(); if (!result) throw new ConflictException(`${label} must be non-empty`); return result; };
const enabled = (status: ChannelMappingStatus) => status === ChannelMappingStatus.ACTIVE;
function assertTransition(current: ChannelMappingStatus | null, next: ChannelMappingStatus) {
  if (current === ChannelMappingStatus.RETIRED) throw new ConflictException({ code: 'CHANNEL_MAPPING_RETIRED', message: 'Retired mappings are terminal' });
  if (current === ChannelMappingStatus.DRAFT && !new Set<ChannelMappingStatus>([ChannelMappingStatus.DRAFT, ChannelMappingStatus.ACTIVE, ChannelMappingStatus.RETIRED]).has(next)) throw new ConflictException('Invalid mapping state transition');
  if (current === ChannelMappingStatus.ACTIVE && !new Set<ChannelMappingStatus>([ChannelMappingStatus.ACTIVE, ChannelMappingStatus.DISABLED, ChannelMappingStatus.RETIRED]).has(next)) throw new ConflictException('Invalid mapping state transition');
  if (current === ChannelMappingStatus.DISABLED && !new Set<ChannelMappingStatus>([ChannelMappingStatus.DISABLED, ChannelMappingStatus.ACTIVE, ChannelMappingStatus.RETIRED]).has(next)) throw new ConflictException('Invalid mapping state transition');
}
function optimisticRequired(current: unknown, expectedVersion: number | undefined, label: string) { if (current && expectedVersion == null) throw new ConflictException({ code: 'CHANNEL_MAPPING_VERSION_REQUIRED', message: `${label} expectedVersion is required for updates` }); }

@Injectable()
export class ChannelMappingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  /**
   * Activate the complete VOYA_AGENT hierarchy for a published product.
   * This is intentionally idempotent and atomic so an Admin cannot leave a
   * product half-visible after activating only some of its mappings.
   */
  async activateAgentHierarchy(user: AuthUser, productId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const channel = await tx.distributionChannel.findUnique({ where: { code: 'VOYA_AGENT' } });
      if (!channel) throw new NotFoundException('VOYA_AGENT channel not found');
      if (!channel.active) throw new ConflictException({ code: 'CHANNEL_INACTIVE', message: 'VOYA_AGENT channel is inactive' });

      const product = await tx.product.findUnique({
        where: { id: productId },
        include: {
          currentRevision: { select: { status: true } },
          variants: {
            where: { status: 'ACTIVE', archivedAt: null },
            include: { ratePlans: { where: { status: 'ACTIVE' } } },
          },
        },
      });
      if (!product) throw new NotFoundException('Product not found');
      if (product.status !== 'LIVE' || product.currentRevision?.status !== 'PUBLISHED') {
        throw new ConflictException({ code: 'PRODUCT_NOT_PUBLISHED', message: 'Publish the product before enabling it for Agents' });
      }
      if (!product.variants.length) throw new ConflictException({ code: 'CHANNEL_VARIANT_NOT_MAPPED', message: 'Product has no active variants to distribute' });
      if (!product.variants.some((variant: any) => variant.ratePlans.length)) throw new ConflictException({ code: 'CHANNEL_RATE_PLAN_NOT_MAPPED', message: 'Product has no active rate plans to distribute' });

      const now = new Date();
      const activated = { product: null as any, variants: [] as any[], ratePlans: [] as any[], inventoryRules: [] as any[] };
      const ensureActive = async (current: any, create: () => Promise<any>, update: () => Promise<any>, label: string) => {
        if (!current) return create();
        if (current.status === ChannelMappingStatus.RETIRED) throw new ConflictException({ code: 'CHANNEL_MAPPING_RETIRED', message: `${label} mapping is retired and cannot be reactivated` });
        if (current.status !== ChannelMappingStatus.ACTIVE) return update();
        return current;
      };

      const currentProductMapping = await tx.productChannelMapping.findUnique({ where: { channelId_productId: { channelId: channel.id, productId } } });
      if (currentProductMapping?.activatedAt && currentProductMapping.externalProductCode !== product.productCode) throw new ConflictException({ code: 'CHANNEL_EXTERNAL_IDENTIFIER_IMMUTABLE', message: 'External product identifier is permanently immutable after activation' });
      activated.product = await ensureActive(
        currentProductMapping,
        () => tx.productChannelMapping.create({ data: { channelId: channel.id, productId, externalProductCode: product.productCode, status: ChannelMappingStatus.ACTIVE, activatedAt: now, createdById: user.sub } }),
        () => tx.productChannelMapping.update({ where: { id: currentProductMapping.id }, data: { status: ChannelMappingStatus.ACTIVE, activatedAt: currentProductMapping.activatedAt ?? now } }),
        'Product',
      );

      for (const variant of product.variants) {
        const currentVariantMapping = await tx.variantChannelMapping.findUnique({ where: { channelId_variantId: { channelId: channel.id, variantId: variant.id } } });
        if (currentVariantMapping?.activatedAt && currentVariantMapping.externalVariantCode !== variant.variantCode) throw new ConflictException({ code: 'CHANNEL_EXTERNAL_IDENTIFIER_IMMUTABLE', message: 'External variant identifier is permanently immutable after activation' });
        const mapping = await ensureActive(
          currentVariantMapping,
          () => tx.variantChannelMapping.create({ data: { channelId: channel.id, variantId: variant.id, externalVariantCode: variant.variantCode, status: ChannelMappingStatus.ACTIVE, activatedAt: now, createdById: user.sub } }),
          () => tx.variantChannelMapping.update({ where: { id: currentVariantMapping.id }, data: { status: ChannelMappingStatus.ACTIVE, activatedAt: currentVariantMapping.activatedAt ?? now } }),
          'Variant',
        );
        activated.variants.push(mapping);

        for (const plan of variant.ratePlans) {
          const currentRateMapping = await tx.ratePlanChannelMapping.findUnique({ where: { ratePlanId_channelId: { ratePlanId: plan.id, channelId: channel.id } } });
          if (currentRateMapping?.activatedAt && currentRateMapping.externalRatePlanCode !== plan.ratePlanCode) throw new ConflictException({ code: 'CHANNEL_EXTERNAL_IDENTIFIER_IMMUTABLE', message: 'External rate-plan identifier is permanently immutable after activation' });
          const rateMapping = await ensureActive(
            currentRateMapping,
            () => tx.ratePlanChannelMapping.create({ data: { channelId: channel.id, ratePlanId: plan.id, externalRatePlanCode: plan.ratePlanCode, status: ChannelMappingStatus.ACTIVE, enabled: true, activatedAt: now, createdById: user.sub } }),
            () => tx.ratePlanChannelMapping.update({ where: { id: currentRateMapping.id }, data: { status: ChannelMappingStatus.ACTIVE, enabled: true, activatedAt: currentRateMapping.activatedAt ?? now, disabledAt: null } }),
            'Rate plan',
          );
          activated.ratePlans.push(rateMapping);
          const currentRule = await tx.channelInventoryRule.findUnique({ where: { ratePlanChannelMappingId: rateMapping.id } });
          const rule = currentRule ?? await tx.channelInventoryRule.create({ data: { ratePlanChannelMappingId: rateMapping.id, exposureMode: ChannelInventoryExposureMode.AVAILABLE_ONLY, capacityBuffer: 0 } });
          activated.inventoryRules.push(rule);
        }
      }

      await this.audit.write(tx, { actor: user, tenantId: product.tenantId, action: 'AGENT_DISTRIBUTION_HIERARCHY_ACTIVATED', entityType: 'Product', entityId: product.id, afterState: { channelCode: channel.code, productMappingId: activated.product.id, variantMappingCount: activated.variants.length, ratePlanMappingCount: activated.ratePlans.length, inventoryRuleCount: activated.inventoryRules.length } });
      await this.outbox.enqueue(tx, { tenantId: product.tenantId, eventType: 'DISTRIBUTION_MAPPING_CHANGED', aggregateType: 'Product', aggregateId: product.id, payload: { channelCode: channel.code, action: 'ACTIVATE_HIERARCHY', variantMappingCount: activated.variants.length, ratePlanMappingCount: activated.ratePlans.length } });
      return { channel: { id: channel.id, code: channel.code }, productId: product.id, mappings: activated };
    });
  }

  list(channelId?: string) { return this.prisma.productChannelMapping.findMany({ where: channelId ? { channelId } : undefined, include: { product: { select: { id: true, productCode: true, status: true } }, channel: true }, orderBy: { updatedAt: 'desc' } }); }
  inventoryList(channelId?: string) { return this.prisma.channelInventoryRule.findMany({ where: channelId ? { ratePlanChannelMapping: { channelId } } : undefined, include: { ratePlanChannelMapping: { include: { channel: true, ratePlan: { include: { variant: { include: { product: { select: { id: true, productCode: true } } } } } } } } }, orderBy: { updatedAt: 'desc' } }); }
  async product(user: AuthUser, dto: MappingDto) {
    const externalProductCode = normalized(dto.externalProductCode, 'externalProductCode');
    return this.prisma.$transaction(async (tx) => {
      const [channel, product] = await Promise.all([tx.distributionChannel.findUnique({ where: { id: dto.channelId } }), tx.product.findUnique({ where: { id: dto.productId } })]);
      if (!channel || !product) throw new NotFoundException('Channel or product not found');
      const current = await tx.productChannelMapping.findUnique({ where: { channelId_productId: { channelId: dto.channelId, productId: dto.productId } } });
      optimisticRequired(current, dto.expectedVersion, 'Product mapping');
      if (current && current.activatedAt && current.externalProductCode !== externalProductCode) throw new ConflictException({ code: 'CHANNEL_EXTERNAL_IDENTIFIER_IMMUTABLE', message: 'External product identifier is permanently immutable after activation' });
      const status = dto.status ?? current?.status ?? ChannelMappingStatus.DRAFT; assertTransition(current?.status ?? null, status); if (status === ChannelMappingStatus.ACTIVE && !channel.active) throw new ConflictException({ code: 'CHANNEL_INACTIVE', message: 'Inactive channel cannot activate a mapping' });
      const now = new Date();
      let mapping: any;
      if (!current) mapping = await tx.productChannelMapping.create({ data: { channelId: dto.channelId, productId: dto.productId, externalProductCode, status, activatedAt: status === ChannelMappingStatus.ACTIVE ? now : null, createdById: user.sub } });
      else { const changed = await tx.productChannelMapping.updateMany({ where: { id: current.id, version: dto.expectedVersion }, data: { externalProductCode, status, version: { increment: 1 }, activatedAt: current.activatedAt ?? (status === ChannelMappingStatus.ACTIVE ? now : null) } }); if (changed.count !== 1) throw new ConflictException({ code: 'CHANNEL_MAPPING_VERSION_MISMATCH', message: 'Product mapping changed; reload and retry' }); mapping = await tx.productChannelMapping.findUniqueOrThrow({ where: { id: current.id } }); }
      await this.audit.write(tx, { actor: user, tenantId: product.tenantId, action: 'PRODUCT_CHANNEL_MAPPING_CHANGED', entityType: 'ProductChannelMapping', entityId: mapping.id, afterState: { channelId: dto.channelId, productId: dto.productId, externalProductCode, status } });
      await this.outbox.enqueue(tx, { tenantId: product.tenantId, eventType: 'DISTRIBUTION_MAPPING_CHANGED', aggregateType: 'ProductChannelMapping', aggregateId: mapping.id, payload: { channelId: dto.channelId, productId: dto.productId, externalProductCode, status } });
      return mapping;
    }).catch((error: any) => { if (error?.code === 'P2002') throw new ConflictException({ code: 'CHANNEL_MAPPING_CONFLICT', message: 'Channel mapping identity already exists' }); throw error; });
  }
  async variant(user: AuthUser, dto: VariantMappingDto) {
    const externalVariantCode = normalized(dto.externalVariantCode, 'externalVariantCode');
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({ where: { id: dto.variantId } }); const channel = await tx.distributionChannel.findUnique({ where: { id: dto.channelId } }); if (!variant || !channel) throw new NotFoundException('Channel or variant not found');
      const productMapping = await tx.productChannelMapping.findUnique({ where: { channelId_productId: { channelId: dto.channelId, productId: variant.productId } } }); const current = await tx.variantChannelMapping.findUnique({ where: { channelId_variantId: { channelId: dto.channelId, variantId: dto.variantId } } }); optimisticRequired(current, dto.expectedVersion, 'Variant mapping');
      if (current && current.activatedAt && current.externalVariantCode !== externalVariantCode) throw new ConflictException({ code: 'CHANNEL_EXTERNAL_IDENTIFIER_IMMUTABLE', message: 'External variant identifier is permanently immutable after activation' });
      const status = dto.status ?? current?.status ?? ChannelMappingStatus.DRAFT; assertTransition(current?.status ?? null, status); if (status === ChannelMappingStatus.ACTIVE && (!productMapping || productMapping.status !== ChannelMappingStatus.ACTIVE)) throw new ConflictException({ code: 'CHANNEL_PRODUCT_NOT_MAPPED', message: 'Activate the Product mapping before the Variant mapping' }); if (status === ChannelMappingStatus.ACTIVE && !channel.active) throw new ConflictException({ code: 'CHANNEL_INACTIVE', message: 'Inactive channel cannot activate a mapping' });
      const now = new Date(); let mapping: any; if (!current) mapping = await tx.variantChannelMapping.create({ data: { channelId: dto.channelId, variantId: dto.variantId, externalVariantCode, status, activatedAt: status === ChannelMappingStatus.ACTIVE ? now : null, createdById: user.sub } }); else { const changed = await tx.variantChannelMapping.updateMany({ where: { id: current.id, version: dto.expectedVersion }, data: { externalVariantCode, status, version: { increment: 1 }, activatedAt: current.activatedAt ?? (status === ChannelMappingStatus.ACTIVE ? now : null) } }); if (changed.count !== 1) throw new ConflictException({ code: 'CHANNEL_MAPPING_VERSION_MISMATCH', message: 'Variant mapping changed; reload and retry' }); mapping = await tx.variantChannelMapping.findUniqueOrThrow({ where: { id: current.id } }); }
      await this.audit.write(tx, { actor: user, action: 'VARIANT_CHANNEL_MAPPING_CHANGED', entityType: 'VariantChannelMapping', entityId: mapping.id, afterState: { channelId: dto.channelId, variantId: dto.variantId, externalVariantCode, status } }); await this.outbox.enqueue(tx, { tenantId: (await tx.productVariant.findUniqueOrThrow({ where: { id: dto.variantId }, select: { product: { select: { tenantId: true } } } })).product.tenantId, eventType: 'DISTRIBUTION_MAPPING_CHANGED', aggregateType: 'VariantChannelMapping', aggregateId: mapping.id, payload: { channelId: dto.channelId, variantId: dto.variantId, externalVariantCode, status } }); return mapping;
    }).catch((error: any) => { if (error?.code === 'P2002') throw new ConflictException({ code: 'CHANNEL_MAPPING_CONFLICT', message: 'Channel mapping identity already exists' }); throw error; });
  }
  async rate(user: AuthUser, dto: RateMappingDto) {
    const externalRatePlanCode = normalized(dto.externalRatePlanCode, 'externalRatePlanCode');
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.ratePlan.findUnique({ where: { id: dto.ratePlanId }, include: { variant: { select: { id: true, productId: true, product: { select: { tenantId: true } } } } } }); const channel = await tx.distributionChannel.findUnique({ where: { id: dto.channelId } }); if (!plan || !channel) throw new NotFoundException('Channel or rate plan not found');
      const productMapping = await tx.productChannelMapping.findUnique({ where: { channelId_productId: { channelId: dto.channelId, productId: plan.variant.productId } } }); const variantMapping = await tx.variantChannelMapping.findUnique({ where: { channelId_variantId: { channelId: dto.channelId, variantId: plan.variant.id } } }); const current = await tx.ratePlanChannelMapping.findUnique({ where: { ratePlanId_channelId: { ratePlanId: dto.ratePlanId, channelId: dto.channelId } } }); optimisticRequired(current, dto.expectedVersion, 'Rate plan mapping');
      if (current?.activatedAt && current.externalRatePlanCode !== externalRatePlanCode) throw new ConflictException({ code: 'CHANNEL_EXTERNAL_IDENTIFIER_IMMUTABLE', message: 'External rate-plan identifier is permanently immutable after activation' });
      const status = dto.status ?? current?.status ?? ChannelMappingStatus.DRAFT; assertTransition(current?.status ?? null, status); if (status === ChannelMappingStatus.ACTIVE && (!productMapping || productMapping.status !== ChannelMappingStatus.ACTIVE)) throw new ConflictException({ code: 'CHANNEL_PRODUCT_NOT_MAPPED', message: 'Activate the Product mapping before the Rate Plan mapping' }); if (status === ChannelMappingStatus.ACTIVE && (!variantMapping || variantMapping.status !== ChannelMappingStatus.ACTIVE)) throw new ConflictException({ code: 'CHANNEL_VARIANT_NOT_MAPPED', message: 'Activate the Variant mapping before the Rate Plan mapping' }); if (status === ChannelMappingStatus.ACTIVE && !channel.active) throw new ConflictException({ code: 'CHANNEL_INACTIVE', message: 'Inactive channel cannot activate a mapping' });
      const now = new Date(); let mapping: any; if (!current) mapping = await tx.ratePlanChannelMapping.create({ data: { ratePlanId: dto.ratePlanId, channelId: dto.channelId, externalRatePlanCode, status, enabled: enabled(status), createdById: user.sub, activatedAt: status === ChannelMappingStatus.ACTIVE ? now : null, disabledAt: status === ChannelMappingStatus.DISABLED ? now : null } }); else { const changed = await tx.ratePlanChannelMapping.updateMany({ where: { id: current.id, version: dto.expectedVersion }, data: { externalRatePlanCode, status, enabled: enabled(status), version: { increment: 1 }, activatedAt: current.activatedAt ?? (status === ChannelMappingStatus.ACTIVE ? now : null), disabledAt: status === ChannelMappingStatus.DISABLED ? now : null } }); if (changed.count !== 1) throw new ConflictException({ code: 'CHANNEL_MAPPING_VERSION_MISMATCH', message: 'Rate plan mapping changed; reload and retry' }); mapping = await tx.ratePlanChannelMapping.findUniqueOrThrow({ where: { id: current.id } }); }
      await this.audit.write(tx, { actor: user, tenantId: plan.variant.product.tenantId, action: 'RATE_PLAN_CHANNEL_MAPPING_CHANGED', entityType: 'RatePlanChannelMapping', entityId: mapping.id, afterState: { channelId: dto.channelId, ratePlanId: dto.ratePlanId, externalRatePlanCode, status } }); await this.outbox.enqueue(tx, { tenantId: plan.variant.product.tenantId, eventType: 'DISTRIBUTION_MAPPING_CHANGED', aggregateType: 'RatePlanChannelMapping', aggregateId: mapping.id, payload: { channelId: dto.channelId, ratePlanId: dto.ratePlanId, externalRatePlanCode, status } }); return mapping;
    }).catch((error: any) => { if (error?.code === 'P2002') throw new ConflictException({ code: 'CHANNEL_MAPPING_CONFLICT', message: 'Channel mapping identity already exists' }); throw error; });
  }
  async inventory(user: AuthUser, dto: InventoryRuleDto) {
    if (dto.capacityBuffer < 0 || (dto.maxPublishedCapacity != null && dto.maxPublishedCapacity <= 0) || (dto.maxUnitsPerQuote != null && dto.maxUnitsPerQuote <= 0)) throw new ConflictException('Invalid channel inventory limits');
    return this.prisma.$transaction(async (tx) => {
      const mapping = await tx.ratePlanChannelMapping.findUnique({ where: { id: dto.ratePlanChannelMappingId } }); if (!mapping) throw new NotFoundException('Rate plan channel mapping not found'); const current = await tx.channelInventoryRule.findUnique({ where: { ratePlanChannelMappingId: dto.ratePlanChannelMappingId } }); optimisticRequired(current, dto.expectedVersion, 'Inventory rule');
      let rule: any; if (!current) rule = await tx.channelInventoryRule.create({ data: { ratePlanChannelMappingId: dto.ratePlanChannelMappingId, exposureMode: dto.exposureMode, capacityBuffer: dto.capacityBuffer, maxPublishedCapacity: dto.maxPublishedCapacity ?? null, maxUnitsPerQuote: dto.maxUnitsPerQuote ?? null } }); else { const changed = await tx.channelInventoryRule.updateMany({ where: { id: current.id, version: dto.expectedVersion }, data: { exposureMode: dto.exposureMode, capacityBuffer: dto.capacityBuffer, maxPublishedCapacity: dto.maxPublishedCapacity ?? null, maxUnitsPerQuote: dto.maxUnitsPerQuote ?? null, version: { increment: 1 } } }); if (changed.count !== 1) throw new ConflictException({ code: 'CHANNEL_MAPPING_VERSION_MISMATCH', message: 'Inventory rule changed; reload and retry' }); rule = await tx.channelInventoryRule.findUniqueOrThrow({ where: { id: current.id } }); }
      await this.audit.write(tx, { actor: user, action: 'CHANNEL_INVENTORY_RULE_CHANGED', entityType: 'ChannelInventoryRule', entityId: rule.id, afterState: { mappingId: mapping.id, exposureMode: rule.exposureMode, capacityBuffer: rule.capacityBuffer } }); await this.outbox.enqueue(tx, { eventType: 'DISTRIBUTION_MAPPING_CHANGED', aggregateType: 'ChannelInventoryRule', aggregateId: rule.id, payload: { mappingId: mapping.id, ruleId: rule.id } }); return rule;
    });
  }
}
