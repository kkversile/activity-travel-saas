import { Injectable } from '@nestjs/common';
import { CapacityUnit, Prisma, ProductRevisionStatus, ProductStatus, RatePlanStatus, SessionStatus, TenantKind, VariantStatus, VendorVerificationStatus } from '@prisma/client';
import { CommercialService } from '../commercial/commercial.service';
import { capacityQuantity, calculatedAvailable } from '../inventory/inventory.types';
import { ResourcesService } from '../resources/resources.service';
import { PrismaService } from '../prisma/prisma.service';
import { CutoffService } from './cutoff.service';
import { normalizeTravellers } from './traveller-normalization';
import { EligibilityInput, EligibilityGate, EligibilityResult, messageFor } from './eligibility.types';
import { validateFulfilmentPolicy } from '../fulfilment/fulfilment.types';

export type EligibilityDbClient = PrismaService | Prisma.TransactionClient;

const productInclude = {
  tenant: { include: { vendorProfile: true } },
  currentRevision: { include: { fulfilmentPolicy: true, media: { where: { archivedAt: null }, include: { fileAsset: { select: { id: true, visibility: true, purpose: true } } }, orderBy: { rank: 'asc' as const } } } },
} as const;

@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService, private readonly commercial: CommercialService, private readonly resources: ResourcesService, private readonly cutoff: CutoffService) {}

  async evaluate(input: EligibilityInput, options: { client?: EligibilityDbClient } = {}): Promise<EligibilityResult> {
    const db = options.client ?? this.prisma;
    const now = input.now ?? new Date();
    const travellers = normalizeTravellers(input.travellers);
    const gates: EligibilityGate[] = [];
    const add = (gate: string, status: EligibilityGate['status'], code?: string, details?: Record<string, unknown>) => gates.push({ gate, status, code, message: code ? messageFor(code) : 'Gate passed.', details });
    const notEvaluated = (gate: string) => add(gate, 'NOT_EVALUATED');

    const plan: any = await db.ratePlan.findUnique({ where: { id: input.ratePlanId }, include: { travellerRules: true, scheduleMappings: { where: { active: true } }, channelMappings: { include: { channel: true } }, variant: { include: { product: { include: productInclude } } } } } as any);
    const session: any = await db.serviceSession.findUnique({ where: { id: input.sessionId }, include: { inventoryState: true, scheduleTemplate: { include: { variant: { include: { product: { include: productInclude } } } } } } } as any);
    const agent: any = input.skipAgentGovernance || !input.agentTenantId ? null : await db.tenant.findUnique({ where: { id: input.agentTenantId }, include: { agentProfile: true } });

    if (input.skipAgentGovernance) notEvaluated('AGENT_GOVERNANCE');
    else if (!agent) add('AGENT_GOVERNANCE', 'FAIL', 'AGENT_PROFILE_MISSING');
    else if (agent.kind !== TenantKind.TRAVEL_AGENT) add('AGENT_GOVERNANCE', 'FAIL', 'AGENT_NOT_APPROVED', { tenantKind: agent.kind });
    else if (!agent.agentProfile) add('AGENT_GOVERNANCE', 'FAIL', 'AGENT_PROFILE_MISSING');
    else if (agent.agentProfile.verificationStatus === 'SUSPENDED') add('AGENT_GOVERNANCE', 'FAIL', 'AGENT_SUSPENDED');
    else if (agent.agentProfile.verificationStatus !== 'APPROVED') add('AGENT_GOVERNANCE', 'FAIL', 'AGENT_NOT_APPROVED');
    else add('AGENT_GOVERNANCE', 'PASS', undefined, { tenantId: agent.id });

    if (!plan) {
      notEvaluated('VENDOR'); notEvaluated('PRODUCT'); notEvaluated('VARIANT'); add('RATE_PLAN', 'FAIL', 'RATEPLAN_NOT_ACTIVE'); notEvaluated('CHANNEL'); notEvaluated('SCHEDULE'); notEvaluated('SESSION'); notEvaluated('CUTOFF'); notEvaluated('TRAVELLER'); notEvaluated('CAPACITY'); notEvaluated('COMMERCIAL'); notEvaluated('INVENTORY'); notEvaluated('RESOURCES');
      return { eligible: false, evaluatedAt: now.toISOString(), gates, ratePlanId: input.ratePlanId, sessionId: input.sessionId };
    }

    const product = plan.variant.product; const vendor = product.tenant; const revision = product.currentRevision; const date = session?.serviceDate ? new Date(session.serviceDate) : now;
    if (!vendor?.vendorProfile) add('VENDOR', 'FAIL', 'VENDOR_NOT_VERIFIED'); else if (vendor.kind !== TenantKind.VENDOR || vendor.vendorProfile.verificationStatus === VendorVerificationStatus.SUSPENDED) add('VENDOR', 'FAIL', 'VENDOR_SUSPENDED'); else if (vendor.vendorProfile.verificationStatus !== VendorVerificationStatus.VERIFIED) add('VENDOR', 'FAIL', 'VENDOR_NOT_VERIFIED'); else add('VENDOR', 'PASS', undefined, { tenantId: vendor.id });
    if (product.status !== ProductStatus.LIVE) add('PRODUCT', 'FAIL', 'PRODUCT_NOT_LIVE'); else if (!revision || product.currentRevisionId !== revision.id || revision.status !== ProductRevisionStatus.PUBLISHED) add('PRODUCT', 'FAIL', 'PRODUCT_PUBLISHED_REVISION_MISSING'); else add('PRODUCT', 'PASS', undefined, { revisionId: revision.id });
    if (!revision || product.currentRevisionId !== revision.id || revision.status !== ProductRevisionStatus.PUBLISHED || !revision.fulfilmentPolicy) add('FULFILMENT_POLICY', 'FAIL', 'FULFILMENT_POLICY_MISSING'); else { const policy = validateFulfilmentPolicy(revision.fulfilmentPolicy); add('FULFILMENT_POLICY', policy.valid ? 'PASS' : 'FAIL', policy.valid ? undefined : policy.reason, { policyId: revision.fulfilmentPolicy.id, mode: revision.fulfilmentPolicy.mode }); }
    if (plan.variant.status !== VariantStatus.ACTIVE || plan.variant.archivedAt) add('VARIANT', 'FAIL', 'VARIANT_NOT_ACTIVE'); else add('VARIANT', 'PASS', undefined, { variantId: plan.variantId });
    if (plan.status !== RatePlanStatus.ACTIVE) add('RATE_PLAN', 'FAIL', 'RATEPLAN_NOT_ACTIVE'); else if (date < new Date(plan.validFrom) || date >= new Date(plan.validTo)) add('RATE_PLAN', 'FAIL', 'RATEPLAN_OUTSIDE_EFFECTIVE_RANGE'); else add('RATE_PLAN', 'PASS', undefined);
    if (input.skipChannelGovernance) notEvaluated('CHANNEL');
    else { const channelMapping = plan.channelMappings.find((item: any) => item.channel.code === (input.channelCode ?? 'VOYA_AGENT')); if (!channelMapping) add('CHANNEL', 'FAIL', 'MARKETPLACE_CHANNEL_NOT_CONFIGURED'); else if ((channelMapping.status && channelMapping.status !== 'ACTIVE') || !channelMapping.enabled || !channelMapping.channel.active) add('CHANNEL', 'FAIL', 'MARKETPLACE_CHANNEL_DISABLED'); else add('CHANNEL', 'PASS', undefined, { channelCode: channelMapping.channel.code }); }
    const mapped = session && plan.scheduleMappings?.some((item: any) => item.scheduleTemplateId === session.scheduleTemplateId && item.active);
    if (!session || !mapped || session.scheduleTemplate.variantId !== plan.variantId) add('SCHEDULE', 'FAIL', 'RATEPLAN_SCHEDULE_NOT_ELIGIBLE'); else if (session.scheduleTemplate.status !== 'ACTIVE' || session.scheduleTemplate.archivedAt) add('SCHEDULE', 'FAIL', 'SCHEDULE_NOT_ACTIVE'); else if (date < new Date(session.scheduleTemplate.effectiveFrom) || (session.scheduleTemplate.effectiveTo && date >= new Date(session.scheduleTemplate.effectiveTo))) add('SCHEDULE', 'FAIL', 'SCHEDULE_OUTSIDE_EFFECTIVE_RANGE'); else if (session.scheduleTemplate.capacityUnitReviewRequired) add('SCHEDULE', 'FAIL', 'CAPACITY_UNIT_REVIEW_REQUIRED'); else add('SCHEDULE', 'PASS', undefined, { scheduleId: session.scheduleTemplateId });
    if (!session) add('SESSION', 'FAIL', 'SESSION_NOT_FOUND'); else if (session.archivedAt || session.status === SessionStatus.ARCHIVED) add('SESSION', 'FAIL', 'SESSION_ARCHIVED'); else if (session.status === SessionStatus.BLACKOUT) add('SESSION', 'FAIL', 'SESSION_BLACKOUT'); else if (session.status !== SessionStatus.OPEN) add('SESSION', 'FAIL', 'SESSION_CLOSED'); else add('SESSION', 'PASS', undefined, { sessionId: session.id });

    let bookingMode: any; let capacityConsumption: number | undefined; let travellerPass = false;
    if (session) {
      const cut = this.cutoff.evaluate(session, plan.cutOffMinutes, plan.dateLevelCutoffTime, now);
      add('CUTOFF', cut.eligible ? 'PASS' : 'FAIL', cut.code, { cutoffAt: cut.cutoffAt?.toISOString() ?? null });
      const ruleMap = new Map<string, any>(plan.travellerRules.map((rule: any) => [rule.type, rule]));
      let travellerCode: string | undefined;
      if (travellers.totalPax < plan.minPax) travellerCode = 'PAX_BELOW_MINIMUM'; else if (travellers.totalPax > plan.maxPax) travellerCode = 'PAX_ABOVE_MAXIMUM'; else if (plan.adultRequired && travellers.adultCount < 1) travellerCode = 'ADULT_REQUIRED'; else if (travellers.adultCount < plan.minAdultRequired) travellerCode = 'MINIMUM_ADULTS_NOT_MET';
      for (const rule of plan.travellerRules) { const quantity = (travellers.quantitiesByType as any)[rule.type] ?? 0; if (quantity < rule.minCount || quantity > rule.maxCount) travellerCode ??= 'TRAVELLER_COUNT_INVALID'; }
      for (const item of travellers.normalizedTravellers) if (!ruleMap.has(item.travellerType)) travellerCode ??= 'TRAVELLER_COUNT_INVALID';
      travellerPass = !travellerCode;
      add('TRAVELLER', travellerPass ? 'PASS' : 'FAIL', travellerCode, { pax: travellers.totalPax, adultCount: travellers.adultCount, quantitiesByType: travellers.quantitiesByType, normalizedTravellers: travellers.normalizedTravellers });
      try {
        const requested = session.scheduleTemplate.capacityUnit === CapacityUnit.PERSON ? travellers.totalPax : session.scheduleTemplate.capacityUnit === CapacityUnit.BOOKING ? 1 : input.units;
        if (session.scheduleTemplate.capacityUnit === CapacityUnit.UNIT && input.units == null) add('CAPACITY', 'FAIL', 'UNIT_QUANTITY_REQUIRED'); else if (requested == null || requested < 1) add('CAPACITY', 'FAIL', 'CAPACITY_CONSUMPTION_INVALID'); else { capacityConsumption = capacityQuantity(session.scheduleTemplate.capacityUnit, requested); add('CAPACITY', 'PASS', undefined, { requiredCapacity: capacityConsumption, capacityUnit: session.scheduleTemplate.capacityUnit }); }
      } catch { add('CAPACITY', 'FAIL', 'CAPACITY_CONSUMPTION_INVALID'); }
    } else { notEvaluated('CUTOFF'); notEvaluated('TRAVELLER'); notEvaluated('CAPACITY'); notEvaluated('INVENTORY'); }

    let commercial: any = null;
    if (session && capacityConsumption != null && travellerPass) {
      try {
        commercial = await this.commercial.evaluateInternal({ ratePlanId: plan.id, serviceDate: date, units: input.units ?? 1, travellers: travellers.normalizedTravellers, agentTenantId: input.agentTenantId, channel: input.channelCode ?? 'VOYA_AGENT', agentFacingRequired: !input.skipAgentGovernance }, db);
        bookingMode = commercial.bookingMode;
        const amount = Number(commercial.finalAmount); let code: string | undefined;
        if (!Number.isFinite(amount)) code = 'PRICE_NOT_CALCULABLE'; else if (!commercial.ready || (commercial.commercialEligibility !== 'ALLOWED' && !(input.skipAgentGovernance && commercial.commercialEligibility === 'NOT_APPLICABLE'))) code = commercial.reasonCodes?.find((item: string) => ['AGENT_COMMERCIAL_DENIED', 'AGENT_ELIGIBILITY_UNCONFIGURED', 'AGENT_COMMERCIAL_UNCONFIGURED', 'VOYA_REVENUE_RULE_MISSING', 'TAX_CONFIGURATION_MISSING'].includes(item)) ?? 'COMMERCIAL_NOT_READY';
        add('COMMERCIAL', code ? 'FAIL' : 'PASS', code, { reasonCodes: commercial.reasonCodes, commercialVersionId: commercial.ratePlanCommercialVersionId });
      } catch (error: any) { add('COMMERCIAL', 'FAIL', error?.response?.code ?? 'COMMERCIAL_NOT_READY'); }
    } else notEvaluated('COMMERCIAL');
    if (session && capacityConsumption != null && travellerPass) {
      const state = session.inventoryState; const available = calculatedAvailable(state?.totalCapacity ?? 0, state?.blockedCapacity ?? 0, state?.heldCapacity ?? 0, state?.confirmedCapacity ?? 0, session.status);
      if (!state) add('INVENTORY', 'FAIL', 'INVENTORY_STATE_MISSING'); else if (available < capacityConsumption) add('INVENTORY', 'FAIL', 'INSUFFICIENT_INVENTORY', { availableCapacity: available, requiredCapacity: capacityConsumption }); else add('INVENTORY', 'PASS', undefined, { availableCapacity: available, requiredCapacity: capacityConsumption, capacityUnit: session.scheduleTemplate.capacityUnit, inventoryVersion: state.version, sessionVersion: session.version });
    } else if (session) notEvaluated('INVENTORY');
    if (session) { const readiness = await this.resources.resourceReadiness(session.id, db); add('RESOURCES', readiness.ready ? 'PASS' : 'FAIL', readiness.ready ? undefined : 'RESOURCE_NOT_READY', { reasonCodes: readiness.reasonCodes }); } else notEvaluated('RESOURCES');
    const failed = gates.filter((gate) => gate.status === 'FAIL');
    return { eligible: failed.length === 0, bookingMode, evaluatedAt: now.toISOString(), capacityConsumption, gates, commercial: commercial ? this.commercial.projectForAgent(commercial) : undefined, inventory: gates.find((g) => g.gate === 'INVENTORY')?.details, resource: gates.find((g) => g.gate === 'RESOURCES')?.details, productId: product.id, variantId: plan.variantId, ratePlanId: plan.id, sessionId: input.sessionId };
  }
}
