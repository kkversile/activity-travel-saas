import { Injectable } from '@nestjs/common';
import { ChannelMappingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ProductDistributionReadiness = {
  channelCode: 'VOYA_AGENT';
  ready: boolean;
  status: 'READY' | 'PENDING';
  reasonCodes: string[];
  details: {
    channelId: string | null;
    productMapping: 'ACTIVE' | 'DRAFT' | 'DISABLED' | 'MISSING';
    activeVariantCount: number;
    mappedVariantCount: number;
    activeRatePlanCount: number;
    mappedRatePlanCount: number;
    inventoryRuleCount: number;
  };
};

/**
 * Product-level visibility gates for the VOYA_AGENT channel.
 *
 * This deliberately does not participate in product publication readiness.
 * Publication and distribution are separate governed transitions; this service
 * only answers whether a published product may be exposed to Agents.
 */
@Injectable()
export class ChannelDistributionReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(productId: string, client: any = this.prisma): Promise<ProductDistributionReadiness> {
    const channel = await client.distributionChannel.findUnique({ where: { code: 'VOYA_AGENT' } });
    const reasons = new Set<string>();
    const missingDetails = {
      channelId: channel?.id ?? null,
      productMapping: 'MISSING' as const,
      activeVariantCount: 0,
      mappedVariantCount: 0,
      activeRatePlanCount: 0,
      mappedRatePlanCount: 0,
      inventoryRuleCount: 0,
    };

    if (!channel) {
      reasons.add('CHANNEL_NOT_FOUND');
      return this.result(missingDetails, reasons);
    }
    if (!channel.active) reasons.add('CHANNEL_INACTIVE');

    const product = await client.product.findUnique({
      where: { id: productId },
      include: {
        channelMappings: { where: { channelId: channel.id } },
        variants: {
          where: { status: 'ACTIVE', archivedAt: null },
          include: {
            channelMappings: { where: { channelId: channel.id } },
            ratePlans: {
              where: { status: 'ACTIVE' },
              include: {
                channelMappings: {
                  where: { channelId: channel.id },
                  include: { inventoryRule: true },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      reasons.add('CHANNEL_PRODUCT_NOT_MAPPED');
      return this.result(missingDetails, reasons);
    }

    const productMapping = product.channelMappings[0];
    const details = {
      channelId: channel.id,
      productMapping: (productMapping?.status ?? 'MISSING') as ProductDistributionReadiness['details']['productMapping'],
      activeVariantCount: product.variants.length,
      mappedVariantCount: 0,
      activeRatePlanCount: product.variants.reduce((sum: number, variant: any) => sum + variant.ratePlans.length, 0),
      mappedRatePlanCount: 0,
      inventoryRuleCount: 0,
    };

    if (!productMapping) reasons.add('CHANNEL_PRODUCT_NOT_MAPPED');
    else if (productMapping.status !== ChannelMappingStatus.ACTIVE) reasons.add('CHANNEL_PRODUCT_MAPPING_DISABLED');

    for (const variant of product.variants) {
      const mapping = variant.channelMappings[0];
      if (!mapping) reasons.add('CHANNEL_VARIANT_NOT_MAPPED');
      else if (mapping.status !== ChannelMappingStatus.ACTIVE) reasons.add('CHANNEL_VARIANT_MAPPING_DISABLED');
      else details.mappedVariantCount += 1;

      for (const plan of variant.ratePlans) {
        const rateMapping = plan.channelMappings[0];
        if (!rateMapping) {
          reasons.add('CHANNEL_RATE_PLAN_NOT_MAPPED');
          continue;
        }
        if (rateMapping.status !== ChannelMappingStatus.ACTIVE || !rateMapping.enabled) {
          reasons.add('CHANNEL_RATE_PLAN_MAPPING_DISABLED');
          continue;
        }
        details.mappedRatePlanCount += 1;
        if (!rateMapping.inventoryRule) reasons.add('CHANNEL_INVENTORY_NOT_EXPOSED');
        else details.inventoryRuleCount += 1;
      }
    }

    return this.result(details, reasons);
  }

  private result(details: ProductDistributionReadiness['details'], reasons: Set<string>): ProductDistributionReadiness {
    const reasonCodes = [...reasons];
    return {
      channelCode: 'VOYA_AGENT',
      ready: reasonCodes.length === 0,
      status: reasonCodes.length === 0 ? 'READY' : 'PENDING',
      reasonCodes,
      details,
    };
  }
}
