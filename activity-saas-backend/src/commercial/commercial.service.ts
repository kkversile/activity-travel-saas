import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommercialRuleKind, CommercialRuleVersionStatus, CommercialScopeType, CommercialStackingMode, CommercialVersionStatus, Prisma, TenantKind } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGroupMemberDto, CreateAgentGroupDto, CreateCommercialRuleDto, CreateCommercialRuleVersionDto, CreateCommercialVersionDto, QuoteDto, UpdateCommercialVersionDto } from './commercial.dto';
import { CommercialCalculatorService } from './commercial-calculator.service';
import { validateRuleConfig } from './commercial-validation';
import { selectEffectiveVersion } from './commercial-resolution';
import { fingerprint } from '../bookings/booking-fingerprint';

const versionSelect = { travellerPrices: true } as const;
const dateWindow = (date: Date) => ({ effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] });

@Injectable()
export class CommercialService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly calculator: CommercialCalculatorService) {}

  private tenantId(user: AuthUser) { return requireTenant(user); }
  private async ownedRatePlan(user: AuthUser, id: string, client: any = this.prisma) {
    const tenantId = this.tenantId(user);
    const plan = await client.ratePlan.findFirst({ where: { id, variant: { product: { tenantId } } }, include: { variant: { include: { product: true } }, travellerRules: true } });
    if (!plan) throw new NotFoundException('Rate plan not found');
    return plan;
  }

  private structuralReadinessReasons(plan: any, version: any, rules: Array<{ rule: any; config: any }>) {
    const reasons: string[] = [];
    const add = (code: string) => { if (!reasons.includes(code)) reasons.push(code); };
    if (!version) return ['NO_ACTIVE_COMMERCIAL_VERSION', 'LEGACY_COMMERCIAL_REVIEW_REQUIRED'];
    if (!version.supplierModel) add('SUPPLIER_MODEL_MISSING');
    if (version.supplierModel && !['NET_RATE', 'COMMISSIONABLE'].includes(version.supplierModel)) add('SUPPLIER_MODEL_UNSUPPORTED');
    if (!version.pricingUnit) add('PRICING_UNIT_MISSING');
    if (!version.bookingMode) add('BOOKING_MODE_MISSING');
    if (version.bookingMode !== 'INSTANT' && (!Number.isInteger(version.confirmationSlaMinutes) || version.confirmationSlaMinutes <= 0)) add('CONFIRMATION_SLA_MISSING');
    if (version.supplierBaseAmount === null || version.supplierBaseAmount === undefined) add('SUPPLIER_BASE_AMOUNT_MISSING');
    if (version.supplierModel === 'COMMISSIONABLE' && (version.supplierCommissionPercent === null || version.supplierCommissionPercent === undefined)) add('INVALID_COMMERCIAL_VERSION');
    if (version.pricingUnit === 'PER_PERSON') {
      const configuredTypes = (plan.travellerRules || []).filter((rule: any) => rule.maxCount > 0).map((rule: any) => rule.type);
      const requiredTypes = configuredTypes.length ? configuredTypes : (version.travellerPrices || []).map((price: any) => price.travellerType);
      if (!requiredTypes.length) add('TRAVELLER_PRICE_MISSING');
      for (const type of requiredTypes) if (!(version.travellerPrices || []).some((price: any) => price.travellerType === type)) add('TRAVELLER_PRICE_MISSING');
    }
    if (!rules.some((item) => item.rule.kind === 'VOYA_REVENUE')) add('VOYA_REVENUE_RULE_MISSING');
    if (!rules.some((item) => item.rule.kind === 'TAX')) add('TAX_CONFIGURATION_MISSING');
    const source = plan.sourcePayload as Record<string, unknown> | null;
    if (source?.createdFromLegacyShell || source?.migrationReviewRequired) add('LEGACY_COMMERCIAL_REVIEW_REQUIRED');
    return reasons;
  }

  async readiness(user: AuthUser, id: string, serviceDate = new Date(), agentTenantId?: string, client: any = this.prisma) {
    const plan = await this.ownedRatePlan(user, id, client);
    const [activeVersions, draft] = await Promise.all([
      client.ratePlanCommercialVersion.findMany({ where: { ratePlanId: id, status: CommercialVersionStatus.ACTIVE, ...dateWindow(serviceDate) }, include: versionSelect, orderBy: { versionNumber: 'desc' } }),
      client.ratePlanCommercialVersion.findFirst({ where: { ratePlanId: id, status: CommercialVersionStatus.DRAFT }, include: versionSelect, orderBy: { versionNumber: 'desc' } }),
    ]);
    const reasonCodes: string[] = [];
    let active: any = null;
    try { active = selectEffectiveVersion(activeVersions as any, serviceDate); } catch { reasonCodes.push('AMBIGUOUS_RULE'); }
    let resolvedRules: Array<{ rule: any; config: any }> = [];
    if (active || !reasonCodes.includes('AMBIGUOUS_RULE')) {
        try { resolvedRules = await this.resolveRules({ ratePlanId: id, serviceDate: serviceDate.toISOString(), units: 1, travellers: [], agentTenantId } as any, client); }
      catch (error: any) { if (error?.response?.code === 'AMBIGUOUS_RULE' || error?.message?.includes('exclusive')) reasonCodes.push('AMBIGUOUS_RULE'); else throw error; }
    }
    for (const code of this.structuralReadinessReasons(plan, active, resolvedRules)) if (!reasonCodes.includes(code)) reasonCodes.push(code);
    if (active && agentTenantId && !reasonCodes.includes('AMBIGUOUS_RULE')) {
      const travellers = (plan.travellerRules || []).filter((rule: any) => rule.maxCount > 0).map((rule: any) => ({ travellerType: rule.type, quantity: 1 }));
      const result = this.calculator.calculate({ ratePlanId: id, serviceDate, units: 1, travellers, agentTenantId }, active, resolvedRules);
      for (const code of result.reasonCodes) if (!reasonCodes.includes(code)) reasonCodes.push(code);
    }
    return { ratePlanId: plan.id, ready: reasonCodes.length === 0, reasonCodes, activeVersion: active, draftVersion: draft, evaluatedAt: serviceDate, legacySource: { basePrice: plan.basePrice.toString(), unitType: plan.unitType, instantConfirmation: plan.instantConfirmation, freehold: plan.freehold, affiliates: plan.affiliates } };
  }

  async getRatePlanCommercial(user: AuthUser, id: string) {
    await this.ownedRatePlan(user, id);
    const [versions, readiness] = await Promise.all([this.prisma.ratePlanCommercialVersion.findMany({ where: { ratePlanId: id }, include: versionSelect, orderBy: { versionNumber: 'desc' } }), this.readiness(user, id)]);
    return { readiness, versions };
  }

  async createVersion(user: AuthUser, id: string, dto: CreateCommercialVersionDto) {
    const plan = await this.ownedRatePlan(user, id);
    const from = new Date(dto.effectiveFrom); const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (to && to <= from) throw new ConflictException('effectiveTo must be after effectiveFrom');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "RatePlan" WHERE "id" = ${id} FOR UPDATE`;
      const latest = await tx.ratePlanCommercialVersion.findFirst({ where: { ratePlanId: id }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
      const version = await tx.ratePlanCommercialVersion.create({ data: { ratePlanId: id, versionNumber: (latest?.versionNumber || 0) + 1, effectiveFrom: from, effectiveTo: to, supplierModel: dto.supplierModel, currency: dto.currency || plan.currency, pricingUnit: dto.pricingUnit, supplierBaseAmount: dto.supplierBaseAmount, supplierCommissionPercent: dto.supplierCommissionPercent, bookingMode: dto.bookingMode, confirmationSlaMinutes: dto.confirmationSlaMinutes, createdById: user.sub, travellerPrices: dto.travellerPrices?.length ? { create: dto.travellerPrices.map((p) => ({ travellerType: p.travellerType, amount: p.amount })) } : undefined }, include: versionSelect });
      await this.audit.write(tx, { actor: user, tenantId: this.tenantId(user), action: 'COMMERCIAL_VERSION_CREATED', entityType: 'RatePlanCommercialVersion', entityId: version.id, afterState: { ratePlanId: id, versionNumber: version.versionNumber, status: version.status } });
      await this.outbox.enqueue(tx, { tenantId: this.tenantId(user), eventType: 'COMMERCIAL_VERSION_CREATED', aggregateType: 'RatePlanCommercialVersion', aggregateId: version.id, payload: { ratePlanId: id, versionNumber: version.versionNumber } });
      return version;
    }).catch((error) => { if (error?.code === 'P2002') throw new ConflictException('Commercial version number was allocated concurrently; retry'); throw error; });
  }

  async updateVersion(user: AuthUser, id: string, dto: UpdateCommercialVersionDto) {
    const version = await this.prisma.ratePlanCommercialVersion.findFirst({ where: { id, ratePlan: { variant: { product: { tenantId: this.tenantId(user) } } } }, include: { ratePlan: true } });
    if (!version) throw new NotFoundException('Commercial version not found');
    const from = dto.effectiveFrom ? new Date(dto.effectiveFrom) : version.effectiveFrom; const to = dto.effectiveTo ? new Date(dto.effectiveTo) : version.effectiveTo;
    if (to && to <= from) throw new ConflictException('effectiveTo must be after effectiveFrom');
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status"::text AS status FROM "RatePlanCommercialVersion" WHERE "id" = ${id} FOR UPDATE`;
      if (locked[0]?.status !== CommercialVersionStatus.DRAFT) throw new ConflictException('Only draft commercial versions are editable');
      if (dto.travellerPrices) await tx.ratePlanTravellerPrice.deleteMany({ where: { commercialVersionId: id } });
      const updatedCount = await tx.ratePlanCommercialVersion.updateMany({ where: { id, status: CommercialVersionStatus.DRAFT }, data: { effectiveFrom: from, effectiveTo: to, supplierModel: dto.supplierModel, currency: dto.currency, pricingUnit: dto.pricingUnit, supplierBaseAmount: dto.supplierBaseAmount, supplierCommissionPercent: dto.supplierCommissionPercent, bookingMode: dto.bookingMode, confirmationSlaMinutes: dto.confirmationSlaMinutes } });
      if (updatedCount.count !== 1) throw new ConflictException('Commercial version was activated concurrently; reload and retry');
      if (dto.travellerPrices) await tx.ratePlanTravellerPrice.createMany({ data: dto.travellerPrices.map((p) => ({ commercialVersionId: id, travellerType: p.travellerType, amount: p.amount })) });
      const updated = await tx.ratePlanCommercialVersion.findUniqueOrThrow({ where: { id }, include: versionSelect });
      await this.audit.write(tx, { actor: user, tenantId: this.tenantId(user), action: 'COMMERCIAL_VERSION_UPDATED', entityType: 'RatePlanCommercialVersion', entityId: id });
      return updated;
    });
  }

  private validateActivation(version: any) {
    const reasons: string[] = [];
    if (!version.supplierModel) reasons.push('supplierModel');
    if (!version.pricingUnit) reasons.push('pricingUnit');
    if (!version.bookingMode) reasons.push('bookingMode');
    if (version.bookingMode !== 'INSTANT' && (!Number.isInteger(version.confirmationSlaMinutes) || version.confirmationSlaMinutes <= 0)) reasons.push('CONFIRMATION_SLA_MISSING');
    if (version.supplierBaseAmount === null || version.supplierBaseAmount === undefined) reasons.push('supplierBaseAmount');
    if (version.supplierModel && !['NET_RATE', 'COMMISSIONABLE'].includes(version.supplierModel)) reasons.push('SUPPLIER_MODEL_UNSUPPORTED');
    if (version.supplierModel === 'COMMISSIONABLE' && (version.supplierCommissionPercent === null || version.supplierCommissionPercent === undefined)) reasons.push('supplierCommissionPercent');
    if (version.pricingUnit === 'PER_PERSON' && !version.travellerPrices?.length) reasons.push('travellerPrices');
    if (reasons.length) throw new ConflictException({ code: reasons.includes('SUPPLIER_MODEL_UNSUPPORTED') ? 'SUPPLIER_MODEL_UNSUPPORTED' : 'INVALID_COMMERCIAL_VERSION', message: `Commercial version is incomplete: ${reasons.join(', ')}` });
  }

  async activateVersion(user: AuthUser, id: string) {
    const version = await this.prisma.ratePlanCommercialVersion.findFirst({ where: { id, ratePlan: { variant: { product: { tenantId: this.tenantId(user) } } } }, include: { travellerPrices: true } });
    if (!version) throw new NotFoundException('Commercial version not found');
    if (version.status !== CommercialVersionStatus.DRAFT) throw new ConflictException('Only draft commercial versions can be activated');
    this.validateActivation(version);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "RatePlanCommercialVersion" WHERE "id" = ${id} FOR UPDATE`;
      const candidate = await tx.ratePlanCommercialVersion.findUniqueOrThrow({ where: { id }, include: { travellerPrices: true } });
      if (candidate.status !== CommercialVersionStatus.DRAFT) throw new ConflictException('Only draft commercial versions can be activated');
      const overlapping = await tx.ratePlanCommercialVersion.findMany({ where: { ratePlanId: candidate.ratePlanId, status: CommercialVersionStatus.ACTIVE, effectiveFrom: { lt: candidate.effectiveTo || new Date('9999-12-31') }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: candidate.effectiveFrom } }] } });
      if (overlapping.length > 1 || overlapping.some((old) => old.effectiveFrom >= candidate.effectiveFrom || old.effectiveTo !== null)) throw new ConflictException({ code: 'COMMERCIAL_VERSION_OVERLAP_REQUIRES_SPLIT', message: 'The candidate overlaps an existing bounded or same-start commercial version; split the effective history explicitly' });
      for (const old of overlapping) await tx.ratePlanCommercialVersion.update({ where: { id: old.id }, data: { effectiveTo: candidate.effectiveFrom } });
      const activatedCount = await tx.ratePlanCommercialVersion.updateMany({ where: { id, status: CommercialVersionStatus.DRAFT }, data: { status: CommercialVersionStatus.ACTIVE, activatedById: user.sub } });
      if (activatedCount.count !== 1) throw new ConflictException('Commercial version was activated concurrently; reload and retry');
      const active = await tx.ratePlanCommercialVersion.findUniqueOrThrow({ where: { id }, include: versionSelect });
      await this.audit.write(tx, { actor: user, tenantId: this.tenantId(user), action: 'COMMERCIAL_VERSION_ACTIVATED', entityType: 'RatePlanCommercialVersion', entityId: id, afterState: { status: active.status, cutoverAt: new Date().toISOString(), previousVersionId: overlapping[0]?.id, previousEffectiveTo: overlapping[0]?.effectiveTo, newVersionId: id } });
      await this.outbox.enqueue(tx, { tenantId: this.tenantId(user), eventType: 'COMMERCIAL_VERSION_ACTIVATED', aggregateType: 'RatePlanCommercialVersion', aggregateId: id, payload: { ratePlanId: candidate.ratePlanId, versionNumber: candidate.versionNumber } });
      return active;
    });
  }

  private async resolveRules(input: QuoteDto, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const date = new Date(input.serviceDate);
    const channelId = input.channel ? (await client.distributionChannel.findUnique({ where: { code: input.channel }, select: { id: true } }))?.id : undefined;
    const candidates: any[] = await client.commercialRule.findMany({ where: { archivedAt: null, versions: { some: { status: CommercialRuleVersionStatus.ACTIVE, ...dateWindow(date) } } }, include: { versions: { where: { status: CommercialRuleVersionStatus.ACTIVE, ...dateWindow(date) }, orderBy: { versionNumber: 'desc' } }, agentGroup: { include: { members: true } } } });
    const plan = await client.ratePlan.findUnique({ where: { id: input.ratePlanId }, include: { variant: { include: { product: true } } } });
    if (!plan) throw new NotFoundException('Rate plan not found');
    const groupIds = input.agentTenantId ? (await client.agentGroupMember.findMany({ where: { agentTenantId: input.agentTenantId, agentGroup: { active: true } }, select: { agentGroupId: true } })).map((g) => g.agentGroupId) : [];
    const ids: Record<string, string | undefined> = { VENDOR: plan.variant.product.tenantId, PRODUCT: plan.variant.productId, VARIANT: plan.variantId, RATE_PLAN: plan.id, AGENT: input.agentTenantId };
    const specificity: Record<string, number> = { GLOBAL: 0, VENDOR: 1, PRODUCT: 2, VARIANT: 3, RATE_PLAN: 4, AGENT_GROUP: 5, AGENT: 6 };
    const scopeField: Record<string, string> = { VENDOR: 'vendorTenantId', PRODUCT: 'productId', VARIANT: 'variantId', RATE_PLAN: 'ratePlanId' };
    const matching = candidates.filter((r) => (r.distributionChannelId == null || r.distributionChannelId === channelId) && (r.scopeType === 'GLOBAL' || (r.scopeType === 'AGENT_GROUP' ? groupIds.includes(r.agentGroupId) : r.scopeType === 'AGENT' ? r.agentTenantId === input.agentTenantId : r[scopeField[r.scopeType]] === ids[r.scopeType])));
    const selected: any[] = [];
    for (const kind of Object.values(CommercialRuleKind)) {
      const sameKind = matching.filter((r) => r.kind === kind).map((r) => ({ r, v: r.versions[0] })).filter((x) => x.v);
      if (!sameKind.length) continue;
      const maxSpecificity = Math.max(...sameKind.map((x) => specificity[x.r.scopeType]));
      const scopedByBusinessScope = sameKind.filter((x) => specificity[x.r.scopeType] === maxSpecificity);
      const channelQualified = scopedByBusinessScope.some((x) => channelId && x.r.distributionChannelId === channelId);
      const scoped = scopedByBusinessScope.filter((x) => channelQualified ? x.r.distributionChannelId === channelId : x.r.distributionChannelId == null);
      const maxPriority = Math.max(...scoped.map((x) => x.v.priority));
      const top = scoped.filter((x) => x.v.priority === maxPriority);
      if (top.length > 1 && top.some((x) => x.v.stackingMode === CommercialStackingMode.EXCLUSIVE)) throw new ConflictException({ code: 'AMBIGUOUS_RULE', message: `Multiple exclusive ${kind} rules have the same specificity and priority` });
      selected.push(...top.map((x) => ({ rule: { ...x.r, versions: [x.v] }, config: x.v.config })));
    }
    return selected;
  }

  /** Trusted server-side calculation seam for marketplace and Phase 6.
   * The caller has already established the agent context; this method never
   * uses vendor-user ownership checks and returns the full internal result
   * only to other backend services.
   */
  async evaluateInternal(input: { ratePlanId: string; serviceDate: Date; units: number; travellers: Array<{ travellerType: string; quantity: number }>; agentTenantId?: string; channel?: string; agentFacingRequired?: boolean }, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const plan = await client.ratePlan.findUnique({ where: { id: input.ratePlanId }, include: { variant: { include: { product: true } } } });
    if (!plan) throw new NotFoundException('Rate plan not found');
    const versions = await client.ratePlanCommercialVersion.findMany({ where: { ratePlanId: plan.id, status: CommercialVersionStatus.ACTIVE, ...dateWindow(input.serviceDate) }, include: versionSelect });
    let version: any = null;
    let ambiguousVersion = false;
    try { version = selectEffectiveVersion(versions as any, input.serviceDate); } catch { ambiguousVersion = true; }
    const result = this.calculator.calculate(input, version, await this.resolveRules({ ...input, serviceDate: input.serviceDate.toISOString() } as QuoteDto, client));
    if (ambiguousVersion && !result.reasonCodes.includes('AMBIGUOUS_RULE')) { result.reasonCodes.push('AMBIGUOUS_RULE'); result.ready = false; }
    if (version?.bookingMode !== 'INSTANT' && (!Number.isInteger(version?.confirmationSlaMinutes) || version.confirmationSlaMinutes <= 0)) { if (!result.reasonCodes.includes('CONFIRMATION_SLA_MISSING')) result.reasonCodes.push('CONFIRMATION_SLA_MISSING'); result.ready = false; }
    result.confirmationSlaMinutes = version?.confirmationSlaMinutes ?? null;
    result.quoteFingerprint = this.quoteFingerprint(result);
    return result;
  }

  projectForAgent(result: any) {
    return {
      currency: result.currency,
      pricingUnit: result.pricingUnit,
      bookingMode: result.bookingMode,
      finalAmount: result.finalAmount,
      agentFacingAmount: result.agentFacingAmount,
      tax: result.tax ? { mode: result.tax.mode, amount: result.tax.amount } : null,
      promotion: { amount: result.promotionAmount, funder: result.promotionFunder },
      commercialEligibility: result.commercialEligibility,
      ratePlanCommercialVersionId: result.ratePlanCommercialVersionId,
      ready: result.ready,
      reasonCodes: result.reasonCodes,
      quoteFingerprint: result.quoteFingerprint ?? this.quoteFingerprint(result),
      confirmationSlaMinutes: result.confirmationSlaMinutes ?? null,
    };
  }

  quoteFingerprint(result: any) {
    return fingerprint({ ratePlanCommercialVersionId: result.ratePlanCommercialVersionId ?? null, currency: result.currency ?? null, pricingUnit: result.pricingUnit ?? null, bookingMode: result.bookingMode ?? null, finalAmount: result.finalAmount ?? null, tax: result.tax ?? null, promotion: result.promotion ?? { amount: result.promotionAmount ?? null, funder: result.promotionFunder ?? null }, foc: result.foc ?? { amount: result.focAmount ?? null }, commercialEligibility: result.commercialEligibility ?? null, ruleVersionIds: (result.appliedRules ?? []).map((rule: any) => rule.ruleVersionId).sort() });
  }

  async quote(user: AuthUser, dto: QuoteDto) {
    const plan = user.role === 'ADMIN' || user.role === 'SUB_ADMIN' ? await this.prisma.ratePlan.findUnique({ where: { id: dto.ratePlanId }, include: { variant: { include: { product: true } } } }) : await this.ownedRatePlan(user, dto.ratePlanId);
    if (!plan) throw new NotFoundException('Rate plan not found');
    const versions = await this.prisma.ratePlanCommercialVersion.findMany({ where: { ratePlanId: plan.id, status: CommercialVersionStatus.ACTIVE, ...dateWindow(new Date(dto.serviceDate)) }, include: versionSelect });
    let version: any = null; let ambiguousVersion = false;
    try { version = selectEffectiveVersion(versions as any, new Date(dto.serviceDate)); } catch { ambiguousVersion = true; }
    const result = this.calculator.calculate({ ...dto, serviceDate: new Date(dto.serviceDate) }, version, await this.resolveRules(dto));
    if (ambiguousVersion && !result.reasonCodes.includes('AMBIGUOUS_RULE')) { result.reasonCodes.push('AMBIGUOUS_RULE'); result.ready = false; }
    return { ...result, projection: 'INTERNAL', confidential: { supplier: result.supplier, voya: result.voya, agent: result.agent } };
  }

  toBookingSnapshotData(quote: any) {
    if (!quote.ratePlanCommercialVersionId || !quote.supplier) throw new ConflictException('Quote is not snapshot-ready');
    return {
      ratePlanCommercialVersionId: quote.ratePlanCommercialVersionId,
      currency: quote.currency, pricingUnit: quote.pricingUnit, supplierCommercialModel: quote.supplier.model,
      supplierGrossBasis: quote.supplier.grossBasis, supplierCommission: quote.supplier.commission, vendorPayable: quote.supplier.vendorPayable,
      voyaRevenueModel: quote.voya?.model, voyaRevenue: quote.voya?.revenue || '0.00', agentCommercialModel: quote.agent?.model,
      agentFacingAmount: quote.agentFacingAmount, agentCommission: quote.agent?.commission || '0.00', taxMode: quote.tax?.mode || 'NONE',
      taxAmount: quote.tax?.amount || '0.00', taxContext: quote.tax?.context || quote.tax || {}, promotionAmount: quote.promotionAmount,
      promotionFunder: ['SUPPLIER', 'VOYA', 'AGENT', 'SHARED'].includes(quote.promotionFunder) ? quote.promotionFunder : null, promotionContext: { applicationStage: quote.promotionApplicationStage, fundingBreakdown: quote.promotionFundingBreakdown },
      focAmount: quote.foc?.discountAmount || quote.focAmount || '0.00', focContext: quote.foc || {}, finalAmount: quote.finalAmount,
      commercialEligibility: { decision: quote.commercialEligibility }, calculationInputs: quote.calculationInputs, calculationOutputs: quote.calculationOutputs, ruleTrace: quote.appliedRules,
    };
  }

  async listRules() { return this.prisma.commercialRule.findMany({ where: { archivedAt: null }, include: { versions: { orderBy: { versionNumber: 'desc' } } }, orderBy: { createdAt: 'desc' } }); }
  private async validateScope(dto: CreateCommercialRuleDto) {
    const ids: Record<string, string | undefined> = { VENDOR: dto.vendorTenantId, PRODUCT: dto.productId, VARIANT: dto.variantId, RATE_PLAN: dto.ratePlanId, AGENT_GROUP: dto.agentGroupId, AGENT: dto.agentTenantId };
    const fields = Object.entries(ids).filter(([, value]) => Boolean(value));
    if (dto.scopeType === 'GLOBAL' && fields.length) throw new ConflictException('GLOBAL rules cannot contain scope ids');
    if (dto.scopeType !== 'GLOBAL' && (fields.length !== 1 || fields[0][0] !== dto.scopeType)) throw new ConflictException(`Exactly one ${dto.scopeType} scope id is required`);
    if (dto.scopeType === 'VENDOR') { const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.vendorTenantId }, select: { kind: true } }); if (tenant?.kind !== TenantKind.VENDOR) throw new ConflictException('vendorTenantId must identify a vendor tenant'); }
    if (dto.scopeType === 'AGENT') { const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.agentTenantId }, select: { kind: true } }); if (tenant?.kind !== TenantKind.TRAVEL_AGENT) throw new ConflictException('agentTenantId must identify a travel-agent tenant'); }
    if (dto.scopeType === 'AGENT_GROUP' && !(await this.prisma.agentGroup.findFirst({ where: { id: dto.agentGroupId, active: true }, select: { id: true } }))) throw new NotFoundException('Active agent group not found');
    if (dto.scopeType === 'PRODUCT' && !(await this.prisma.product.findUnique({ where: { id: dto.productId }, select: { id: true } }))) throw new NotFoundException('Product not found');
    if (dto.scopeType === 'VARIANT' && !(await this.prisma.productVariant.findUnique({ where: { id: dto.variantId }, select: { id: true } }))) throw new NotFoundException('Variant not found');
    if (dto.scopeType === 'RATE_PLAN' && !(await this.prisma.ratePlan.findUnique({ where: { id: dto.ratePlanId }, select: { id: true } }))) throw new NotFoundException('Rate plan not found');
  }

  async createRule(user: AuthUser, dto: CreateCommercialRuleDto) {
    if (!user.sub) throw new ForbiddenException();
    await this.validateScope(dto);
    const scopeFields: any = { vendorTenantId: dto.vendorTenantId, productId: dto.productId, variantId: dto.variantId, ratePlanId: dto.ratePlanId, agentGroupId: dto.agentGroupId, agentTenantId: dto.agentTenantId };
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.commercialRule.create({ data: { code: dto.code, name: dto.name, kind: dto.kind, scopeType: dto.scopeType, ...scopeFields, distributionChannelId: dto.distributionChannelId, createdById: user.sub } });
      await this.audit.write(tx, { actor: user, action: 'COMMERCIAL_RULE_CREATED', entityType: 'CommercialRule', entityId: rule.id, afterState: { code: rule.code, kind: rule.kind, scopeType: rule.scopeType } });
      await this.outbox.enqueue(tx, { eventType: 'COMMERCIAL_RULE_CREATED', aggregateType: 'CommercialRule', aggregateId: rule.id, payload: { code: rule.code, kind: rule.kind, scopeType: rule.scopeType } });
      return rule;
    }).catch((error) => {
      if (error?.code === 'P2002') throw new ConflictException('A commercial rule with this code and scope already exists');
      throw error;
    });
  }
  async createRuleVersion(user: AuthUser, ruleId: string, dto: CreateCommercialRuleVersionDto) {
    const rule = await this.prisma.commercialRule.findUnique({ where: { id: ruleId } }); if (!rule) throw new NotFoundException('Commercial rule not found');
    validateRuleConfig(rule.kind, dto.config as any);
    if (dto.stackingMode === CommercialStackingMode.STACKABLE && rule.kind !== CommercialRuleKind.PROMOTION) throw new ConflictException({ code: 'STACKING_NOT_SUPPORTED_FOR_RULE_KIND', message: `STACKABLE is supported only for PROMOTION rules` });
    const from = new Date(dto.effectiveFrom); const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null; if (to && to <= from) throw new ConflictException('effectiveTo must be after effectiveFrom');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CommercialRule" WHERE "id" = ${ruleId} FOR UPDATE`;
      const lockedRule = await tx.commercialRule.findUniqueOrThrow({ where: { id: ruleId } });
      if (lockedRule.archivedAt) throw new ConflictException({ code: 'COMMERCIAL_RULE_ARCHIVED', message: 'Archived commercial rules cannot receive new versions' });
      if (dto.stackingMode === CommercialStackingMode.STACKABLE && lockedRule.kind !== CommercialRuleKind.PROMOTION) throw new ConflictException({ code: 'STACKING_NOT_SUPPORTED_FOR_RULE_KIND', message: `STACKABLE is supported only for PROMOTION rules` });
      const latest = await tx.commercialRuleVersion.findFirst({ where: { ruleId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
      const created = await tx.commercialRuleVersion.create({ data: { ruleId, versionNumber: (latest?.versionNumber || 0) + 1, effectiveFrom: from, effectiveTo: to, priority: dto.priority, stackingMode: dto.stackingMode, config: dto.config as Prisma.InputJsonValue, createdById: user.sub } });
      await this.audit.write(tx, { actor: user, action: 'COMMERCIAL_RULE_VERSION_CREATED', entityType: 'CommercialRuleVersion', entityId: created.id, afterState: { ruleId, versionNumber: created.versionNumber } });
      await this.outbox.enqueue(tx, { eventType: 'COMMERCIAL_RULE_VERSION_CREATED', aggregateType: 'CommercialRuleVersion', aggregateId: created.id, payload: { ruleId, versionNumber: created.versionNumber } });
      return created;
    }).catch((error) => { if (error?.code === 'P2002') throw new ConflictException('Commercial rule version number was allocated concurrently; retry'); throw error; });
  }
  async activateRuleVersion(user: AuthUser, id: string) {
    const version = await this.prisma.commercialRuleVersion.findUnique({ where: { id }, include: { rule: true } }); if (!version) throw new NotFoundException('Commercial rule version not found');
    if (version.status !== CommercialRuleVersionStatus.DRAFT) throw new ConflictException('Only draft rule versions can be activated');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CommercialRule" WHERE "id" = ${version.ruleId} FOR UPDATE`;
      const candidate = await tx.commercialRuleVersion.findUniqueOrThrow({ where: { id }, include: { rule: true } });
      if (candidate.status !== CommercialRuleVersionStatus.DRAFT) throw new ConflictException('Only draft rule versions can be activated');
      if (candidate.rule.archivedAt) throw new ConflictException({ code: 'COMMERCIAL_RULE_ARCHIVED', message: 'Archived commercial rules cannot activate new versions' });
      if (candidate.stackingMode === CommercialStackingMode.STACKABLE && candidate.rule.kind !== CommercialRuleKind.PROMOTION) throw new ConflictException({ code: 'STACKING_NOT_SUPPORTED_FOR_RULE_KIND', message: `STACKABLE is supported only for PROMOTION rules` });
      const overlapping = await tx.commercialRuleVersion.findMany({ where: { ruleId: candidate.ruleId, status: CommercialRuleVersionStatus.ACTIVE, effectiveFrom: { lt: candidate.effectiveTo || new Date('9999-12-31') }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: candidate.effectiveFrom } }] } });
      if (overlapping.length > 1 || overlapping.some((old) => old.effectiveFrom >= candidate.effectiveFrom || old.effectiveTo !== null)) throw new ConflictException({ code: 'COMMERCIAL_RULE_VERSION_OVERLAP_REQUIRES_SPLIT', message: 'The candidate overlaps an existing bounded or same-start rule version; split the effective history explicitly' });
      for (const old of overlapping) await tx.commercialRuleVersion.update({ where: { id: old.id }, data: { effectiveTo: candidate.effectiveFrom } });
      const activated = await tx.commercialRuleVersion.updateMany({ where: { id, status: CommercialRuleVersionStatus.DRAFT }, data: { status: CommercialRuleVersionStatus.ACTIVE, activatedById: user.sub } });
      if (activated.count !== 1) throw new ConflictException('Rule version was activated concurrently; reload and retry');
      const active = await tx.commercialRuleVersion.findUniqueOrThrow({ where: { id } });
      await this.audit.write(tx, { actor: user, action: 'COMMERCIAL_RULE_VERSION_ACTIVATED', entityType: 'CommercialRuleVersion', entityId: id, afterState: { ruleId: candidate.ruleId, previousVersionId: overlapping[0]?.id, previousEffectiveTo: overlapping[0]?.effectiveTo, newVersionId: id, cutoverAt: new Date().toISOString() } });
      await this.outbox.enqueue(tx, { eventType: 'COMMERCIAL_RULE_VERSION_ACTIVATED', aggregateType: 'CommercialRuleVersion', aggregateId: id, payload: { ruleId: candidate.ruleId, versionNumber: active.versionNumber } });
      return active;
    });
  }
  async archiveRule(user: AuthUser, id: string) { return this.prisma.$transaction(async (tx) => { const rule = await tx.commercialRule.findUnique({ where: { id } }); if (!rule) throw new NotFoundException('Commercial rule not found'); const result = await tx.commercialRule.update({ where: { id }, data: { archivedAt: new Date() } }); await this.audit.write(tx, { actor: user, action: 'COMMERCIAL_RULE_ARCHIVED', entityType: 'CommercialRule', entityId: id }); await this.outbox.enqueue(tx, { eventType: 'COMMERCIAL_RULE_ARCHIVED', aggregateType: 'CommercialRule', aggregateId: id, payload: { code: rule.code } }); return result; }); }
  async listGroups() { return this.prisma.agentGroup.findMany({ include: { members: { include: { agentTenant: { select: { id: true, name: true, kind: true } } } } }, orderBy: { name: 'asc' } }); }
  async createGroup(user: AuthUser, dto: CreateAgentGroupDto) { return this.prisma.$transaction(async (tx) => { const group = await tx.agentGroup.create({ data: dto }); await this.audit.write(tx, { actor: user, action: 'AGENT_GROUP_CREATED', entityType: 'AgentGroup', entityId: group.id }); await this.outbox.enqueue(tx, { eventType: 'AGENT_GROUP_CREATED', aggregateType: 'AgentGroup', aggregateId: group.id, payload: { code: group.code } }); return group; }).catch((error) => { if (error?.code === 'P2002') throw new ConflictException('An agent group with this code already exists'); throw error; }); }
  async addMember(user: AuthUser, groupId: string, dto: AgentGroupMemberDto) { return this.prisma.$transaction(async (tx) => { const group = await tx.agentGroup.findFirst({ where: { id: groupId, active: true }, select: { id: true } }); if (!group) throw new NotFoundException('Active agent group not found'); const tenant = await tx.tenant.findUnique({ where: { id: dto.agentTenantId }, select: { kind: true } }); if (tenant?.kind !== TenantKind.TRAVEL_AGENT) throw new ConflictException('Only travel-agent tenants can be group members'); const member = await tx.agentGroupMember.create({ data: { agentGroupId: groupId, agentTenantId: dto.agentTenantId } }); await this.audit.write(tx, { actor: user, action: 'AGENT_GROUP_MEMBER_ADDED', entityType: 'AgentGroupMember', entityId: member.id }); await this.outbox.enqueue(tx, { eventType: 'AGENT_GROUP_MEMBER_ADDED', aggregateType: 'AgentGroupMember', aggregateId: member.id, payload: { groupId, agentTenantId: dto.agentTenantId } }); return member; }); }
  async removeMember(user: AuthUser, groupId: string, agentTenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.agentGroupMember.findUnique({ where: { agentGroupId_agentTenantId: { agentGroupId: groupId, agentTenantId } } });
      if (!member) throw new NotFoundException('Agent group member not found');
      await tx.agentGroupMember.delete({ where: { id: member.id } });
      await this.audit.write(tx, { actor: user, action: 'AGENT_GROUP_MEMBER_REMOVED', entityType: 'AgentGroupMember', entityId: member.id });
      await this.outbox.enqueue(tx, { eventType: 'AGENT_GROUP_MEMBER_REMOVED', aggregateType: 'AgentGroupMember', aggregateId: member.id, payload: { groupId, agentTenantId } });
      return { deleted: true };
    });
  }
}
