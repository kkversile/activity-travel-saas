import { Injectable } from '@nestjs/common';
import { ChannelContractStatus, ChannelMappingStatus, ProductRevisionStatus, ProductStatus, RatePlanStatus, TenantKind, VariantStatus, VendorVerificationStatus } from '@prisma/client';
import { validateFulfilmentPolicy } from '../fulfilment/fulfilment.types';
import { messageFor } from '../eligibility/eligibility.types';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionEligibilityResult } from './distribution.types';

@Injectable()
export class ChannelEligibilityService {
  constructor(private readonly prisma: PrismaService) {}
  async evaluate(input: { channelId?: string; channelCode?: string; productId: string; variantId: string; ratePlanId: string; currency?: string; units?: number }): Promise<DistributionEligibilityResult> {
    const gates: any[] = []; const reasons: string[] = [];
    const add = (gate: string, status: 'PASS' | 'FAIL' | 'NOT_EVALUATED', code?: string, details?: Record<string, unknown>) => { gates.push({ gate, status, code, message: code ? messageFor(code) : 'Gate passed.', details }); if (code) reasons.push(code); };
    const channel = input.channelId ? await this.prisma.distributionChannel.findUnique({ where: { id: input.channelId } }) : await this.prisma.distributionChannel.findUnique({ where: { code: input.channelCode! } });
    if (!channel) { add('CHANNEL', 'FAIL', 'CHANNEL_NOT_FOUND'); return { eligible: false, gates, reasonCodes: reasons }; }
    if (!channel.active) add('CHANNEL', 'FAIL', 'CHANNEL_INACTIVE', { channelId: channel.id }); else add('CHANNEL', 'PASS', undefined, { channelId: channel.id, code: channel.code });
    const now = new Date(); const contract = await this.prisma.channelContract.findFirst({ where: { channelId: channel.id, status: ChannelContractStatus.ACTIVE }, orderBy: { versionNumber: 'desc' } });
    if (!contract) add('CONTRACT', 'FAIL', 'CHANNEL_CONTRACT_MISSING'); else if (contract.effectiveFrom > now || (contract.effectiveTo && contract.effectiveTo <= now)) add('CONTRACT', 'FAIL', 'CHANNEL_CONTRACT_NOT_ACTIVE', { contractId: contract.id }); else add('CONTRACT', 'PASS', undefined, { contractId: contract.id, version: contract.versionNumber });
    const [productMapping, variantMapping, rateMapping, plan] = await Promise.all([
      this.prisma.productChannelMapping.findUnique({ where: { channelId_productId: { channelId: channel.id, productId: input.productId } } }),
      this.prisma.variantChannelMapping.findUnique({ where: { channelId_variantId: { channelId: channel.id, variantId: input.variantId } } }),
      this.prisma.ratePlanChannelMapping.findUnique({ where: { ratePlanId_channelId: { ratePlanId: input.ratePlanId, channelId: channel.id } }, include: { inventoryRule: true } }),
      this.prisma.ratePlan.findUnique({ where: { id: input.ratePlanId }, include: { variant: { include: { product: { include: { tenant: { include: { vendorProfile: true } }, currentRevision: { include: { fulfilmentPolicy: true } } } } } } } }),
    ]);
    if (!productMapping) add('PRODUCT_MAPPING', 'FAIL', 'CHANNEL_PRODUCT_NOT_MAPPED'); else if (productMapping.status !== ChannelMappingStatus.ACTIVE) add('PRODUCT_MAPPING', 'FAIL', 'CHANNEL_PRODUCT_MAPPING_DISABLED', { status: productMapping.status }); else add('PRODUCT_MAPPING', 'PASS', undefined, { externalProductCode: productMapping.externalProductCode });
    if (!variantMapping) add('VARIANT_MAPPING', 'FAIL', 'CHANNEL_VARIANT_NOT_MAPPED'); else if (variantMapping.status !== ChannelMappingStatus.ACTIVE) add('VARIANT_MAPPING', 'FAIL', 'CHANNEL_VARIANT_MAPPING_DISABLED', { status: variantMapping.status }); else add('VARIANT_MAPPING', 'PASS', undefined, { externalVariantCode: variantMapping.externalVariantCode });
    if (!rateMapping) add('RATE_PLAN_MAPPING', 'FAIL', 'CHANNEL_RATE_PLAN_NOT_MAPPED'); else if (rateMapping.status !== ChannelMappingStatus.ACTIVE || !rateMapping.externalRatePlanCode) add('RATE_PLAN_MAPPING', 'FAIL', 'CHANNEL_RATE_PLAN_MAPPING_DISABLED', { status: rateMapping.status }); else add('RATE_PLAN_MAPPING', 'PASS', undefined, { externalRatePlanCode: rateMapping.externalRatePlanCode });
    if (!plan) { add('HIERARCHY', 'FAIL', 'CHANNEL_MAPPING_HIERARCHY_MISMATCH'); return { eligible: false, gates, reasonCodes: [...new Set(reasons)] }; }
    const hierarchyValid = plan.variantId === input.variantId && plan.variant.productId === input.productId && !!productMapping && productMapping.productId === plan.variant.productId && !!variantMapping && variantMapping.variantId === plan.variantId && !!rateMapping && rateMapping.ratePlanId === plan.id;
    if (!hierarchyValid) add('HIERARCHY', 'FAIL', 'CHANNEL_MAPPING_HIERARCHY_MISMATCH', { productId: input.productId, variantId: input.variantId, ratePlanId: input.ratePlanId }); else add('HIERARCHY', 'PASS');
    const vendor = plan.variant.product.tenant;
    if (!vendor?.vendorProfile || vendor.kind !== TenantKind.VENDOR || vendor.vendorProfile.verificationStatus !== VendorVerificationStatus.VERIFIED) add('VENDOR', 'FAIL', vendor?.vendorProfile?.verificationStatus === VendorVerificationStatus.SUSPENDED ? 'VENDOR_SUSPENDED' : 'VENDOR_NOT_VERIFIED'); else add('VENDOR', 'PASS', undefined, { tenantId: vendor.id });
    const product = plan.variant.product; const revision = product.currentRevision;
    if (product.status !== ProductStatus.LIVE || !revision || revision.status !== ProductRevisionStatus.PUBLISHED) add('PRODUCT_STATE', 'FAIL', 'CHANNEL_PRODUCT_STATE_NOT_DISTRIBUTABLE', { status: product.status, revisionStatus: revision?.status ?? null }); else add('PRODUCT_STATE', 'PASS');
    if (plan.variant.status !== VariantStatus.ACTIVE || plan.variant.archivedAt) add('VARIANT_STATE', 'FAIL', 'CHANNEL_VARIANT_STATE_NOT_DISTRIBUTABLE'); else add('VARIANT_STATE', 'PASS');
    if (plan.status !== RatePlanStatus.ACTIVE) add('RATE_PLAN_STATE', 'FAIL', 'CHANNEL_RATE_PLAN_STATE_NOT_DISTRIBUTABLE', { status: plan.status }); else if (plan.validFrom > now || plan.validTo <= now) add('RATE_PLAN_STATE', 'FAIL', 'CHANNEL_RATE_PLAN_OUTSIDE_EFFECTIVE_RANGE'); else add('RATE_PLAN_STATE', 'PASS');
    if (!revision?.fulfilmentPolicy) add('FULFILMENT_POLICY', 'FAIL', 'FULFILMENT_POLICY_MISSING'); else { const result = validateFulfilmentPolicy(revision.fulfilmentPolicy); if (revision.fulfilmentPolicy.reviewRequired) add('FULFILMENT_POLICY', 'FAIL', 'FULFILMENT_POLICY_REVIEW_REQUIRED'); else if (!result.valid) add('FULFILMENT_POLICY', 'FAIL', result.reason || 'FULFILMENT_POLICY_INVALID'); else add('FULFILMENT_POLICY', 'PASS'); }
    if (contract && input.currency && !contract.allowedCurrencies.includes(input.currency.trim().toUpperCase())) add('COMMERCIAL', 'FAIL', 'CHANNEL_CURRENCY_NOT_ALLOWED', { currency: input.currency, allowedCurrencies: contract.allowedCurrencies }); else add('COMMERCIAL', 'PASS', undefined, { allowedCurrencies: contract?.allowedCurrencies ?? [] });
    if (!rateMapping?.inventoryRule) add('INVENTORY_RULE', 'FAIL', 'CHANNEL_INVENTORY_NOT_EXPOSED'); else if (input.units != null && rateMapping.inventoryRule.maxUnitsPerQuote != null && input.units > rateMapping.inventoryRule.maxUnitsPerQuote) add('INVENTORY_RULE', 'FAIL', 'CHANNEL_MAX_UNITS_EXCEEDED', { maxUnitsPerQuote: rateMapping.inventoryRule.maxUnitsPerQuote }); else add('INVENTORY_RULE', 'PASS', undefined, { exposureMode: rateMapping.inventoryRule.exposureMode });
    return { eligible: reasons.length === 0, gates, reasonCodes: [...new Set(reasons)] };
  }
}
