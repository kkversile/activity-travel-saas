import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BookingMode, BookingRecordType, BookingStatus, DistributionChannelType, FinancialEventStatus, FinancialEventType, Prisma, ProductRevisionStatus, TenantKind } from '@prisma/client';
import { FilePurpose, FileVisibility } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PublicEntity, allocatePublicCode, ensurePublicIdentifier, publicIdentifierMap } from '../common/public-identifiers';
import { AuditService } from '../audit/audit.service';
import { CommercialService } from '../commercial/commercial.service';
import { EligibilityService } from '../eligibility/eligibility.service';
import { normalizeTravellers } from '../eligibility/traveller-normalization';
import { getQaOnlyEligibilityOverride } from '../qa/qa-only-eligibility';
import { InventoryReservationService } from '../inventory/inventory-reservation.service';
import { capacityQuantity } from '../inventory/inventory.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BookingCreateDto, BookingDecisionDto, BookingListQueryDto, BookingPreviewDto, BookingTravellerDetailDto } from './booking.dto';
import { bookingRequestFingerprint, fingerprint } from './booking-fingerprint';
import { CancellationPolicyService } from './cancellation-policy.service';
import { BookingProjectionService } from './booking-projection.service';
import { BookingSnapshotService } from './booking-snapshot.service';
import { FulfilmentLifecycleService } from '../fulfilment/fulfilment-lifecycle.service';
import { ChannelEligibilityService } from '../distribution/channel-eligibility.service';
import { snapshotBookingTaxDeductions } from '../finance/booking-tax-snapshot';

const bookingInclude: any = { events: { orderBy: { createdAt: 'asc' } }, travellers: { orderBy: { sequence: 'asc' } }, operationalSnapshot: true, economicsSnapshot: true, inventoryHolds: true, inventoryAllocations: true, fulfilment: { include: { vouchers: { where: { status: 'CURRENT' }, select: { voucherCode: true } } } }, cancellation: { include: { refund: true, financialEvents: true } }, vendorTenant: { select: { id: true, name: true } }, agentTenant: { select: { id: true, name: true } }, agentUser: { select: { id: true, fullName: true, email: true } }, product: { select: { id: true, productCode: true } }, ratePlan: { select: { id: true, ratePlanCode: true, name: true } } };

function serviceDateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const exclusiveEnd = new Date(`${to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    range.lt = exclusiveEnd;
  }
  return range;
}

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly eligibility: EligibilityService, private readonly commercial: CommercialService, private readonly inventory: InventoryReservationService, private readonly policy: CancellationPolicyService, private readonly snapshot: BookingSnapshotService, private readonly projection: BookingProjectionService, private readonly fulfilment: FulfilmentLifecycleService = null as any, @Optional() private readonly channelEligibility?: ChannelEligibilityService) {}

  private assertAgent(user: AuthUser) { if (user.role !== 'TRAVEL_AGENT' || !user.tenantId) throw new ForbiddenException('An authenticated Travel Agent is required'); return user.tenantId; }
  private async loadContext(client: any, ratePlanId: string, sessionId: string, agentTenantId: string) {
    const [plan, session, agent] = await Promise.all([
      client.ratePlan.findUnique({
        where: { id: ratePlanId },
        include: {
          travellerRules: true,
          cancellationRules: true,
          channelMappings: { include: { channel: true } },
          scheduleMappings: { where: { active: true } },
          variant: {
            include: {
              product: {
                include: {
                  tenant: { include: { vendorProfile: true } },
                  currentRevision: {
                    include: { fulfilmentPolicy: true, bookingQuestions: { where: { archivedAt: null }, orderBy: [{ rank: 'asc' }, { code: 'asc' }] } },
                  },
                },
              },
            },
          },
        },
      }),
      client.serviceSession.findUnique({ where: { id: sessionId }, include: { inventoryState: true, slotTemplate: true, scheduleTemplate: true } }),
      client.tenant.findUnique({ where: { id: agentTenantId }, include: { agentProfile: true } }),
    ]);
    return { plan, session, agent };
  }

  private requestFingerprint(agentTenantId: string, dto: BookingCreateDto) { return bookingRequestFingerprint({ agentTenantId, ratePlanId: dto.ratePlanId, sessionId: dto.sessionId, searchAttemptId: dto.searchAttemptId ?? null, travellers: normalizeTravellers(dto.travellers as any).normalizedTravellers, units: dto.units ?? null, ...(dto.visitorCategory ? { visitorCategory: dto.visitorCategory, visitorEligibilityVerified: dto.visitorEligibilityVerified === true } : {}), travellerDetails: dto.travellerDetails ?? null, pickupDetails: dto.pickupDetails ?? null, bookingAnswers: dto.bookingAnswers ?? {}, customerName: dto.customerName, customerEmail: dto.customerEmail }); }
  private contextFingerprint(context: any, quote: any, policyFingerprint: string) { const { plan, session } = context; return fingerprint({ productRevisionId: plan.variant.product.currentRevision.id, variantId: plan.variant.id, variantVersion: plan.variant.version, ratePlanId: plan.id, ratePlanCode: plan.ratePlanCode, sessionId: session.id, sessionVersion: session.version, sessionKey: session.sessionKey, serviceTimezone: session.scheduleTemplate.timezone, quoteFingerprint: quote.quoteFingerprint, cancellationPolicyFingerprint: policyFingerprint }); }
  private validateExperienceContext(context: any, dto: BookingPreviewDto) { if (dto.experienceMasterId && context.plan?.variant?.product?.experienceMasterId !== dto.experienceMasterId) throw new ConflictException('EXPERIENCE_SELECTION_CONTEXT_CHANGED'); }
  private async assertSearchSelection(client: any, agentTenantId: string, context: any, dto: BookingPreviewDto, lockRow = false) {
    if (!dto.searchAttemptId) return null;
    const product = context.plan?.variant?.product;
    if (!product?.experienceMasterId) throw new ConflictException('EXPERIENCE_SELECTION_CONTEXT_CHANGED');
    const where = { agentTenantId, searchAttemptId: dto.searchAttemptId, experienceMasterId: product.experienceMasterId, productId: product.id, ratePlanId: dto.ratePlanId, sessionId: dto.sessionId, expiresAt: { gt: new Date() }, consumedAt: null };
    let lock = await client.experienceSelectionLock?.findFirst?.({ where });
    if (lock && lockRow && client.$queryRawUnsafe) {
      await client.$queryRawUnsafe('SELECT "id" FROM "public"."ExperienceSelectionLock" WHERE "id" = $1 FOR UPDATE', lock.id);
      lock = await client.experienceSelectionLock.findFirst({ where });
    }
    if (!lock) throw new ConflictException({ code: 'MARKETPLACE_SELECTION_LOCK_EXPIRED', message: 'This supplier selection expired. Return to marketplace and search again.' });
    return lock;
  }

  private async enforceSupplierAllocation(tx: any, input: { experienceMasterId?: string | null; productId: string; vendorTenantId: string; serviceDate: Date; channelCode: string; allocation?: string; agentTenantId: string; travellers: any[]; units?: number; visitorCategory?: 'INDIAN' | 'FOREIGN'; visitorEligibilityVerified?: boolean }) {
    const { experienceMasterId, productId, vendorTenantId, serviceDate, channelCode, allocation } = input;
    if (!experienceMasterId || !['ROUND_ROBIN', 'SPLIT_70_30'].includes(String(allocation))) return;
    const masters = await tx.$queryRawUnsafe(`SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE`, experienceMasterId);
    if (!masters?.length) throw new ConflictException('EXPERIENCE_SELECTION_CONTEXT_CHANGED');
    const placements = await tx.experienceOfferPlacement.findMany({ where: { experienceMasterId }, select: { productId: true, priority: true } });
    const linkedProductIds = [...new Set(placements.map((placement: any) => placement.productId))];
    const productFilter: any = {
      experienceMasterId,
      status: 'LIVE',
      deletedAt: null,
      currentRevision: { status: ProductRevisionStatus.PUBLISHED },
      tenant: { kind: TenantKind.VENDOR, vendorProfile: { verificationStatus: 'VERIFIED' } },
      variants: { some: { status: 'ACTIVE', archivedAt: null, ratePlans: { some: {
        status: 'ACTIVE', validFrom: { lte: serviceDate }, validTo: { gt: serviceDate },
        channelMappings: { some: { status: 'ACTIVE', enabled: true, channel: { code: channelCode, active: true } } },
        scheduleMappings: { some: { active: true, scheduleTemplate: { status: 'ACTIVE', archivedAt: null, effectiveFrom: { lte: serviceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: serviceDate } }], sessions: { some: { serviceDate, status: 'OPEN', archivedAt: null } } } } },
      } } } },
    };
    const productCandidates: any[] = await tx.product.findMany({ where: productFilter, select: { id: true, tenantId: true } });
    const candidateProductIds = [...new Set(productCandidates.map((candidate) => candidate.id))];
    const candidatePlans: any[] = candidateProductIds.length ? await tx.ratePlan.findMany({
      where: {
        variant: { productId: { in: candidateProductIds }, status: 'ACTIVE', archivedAt: null },
        status: 'ACTIVE', validFrom: { lte: serviceDate }, validTo: { gt: serviceDate },
        channelMappings: { some: { status: 'ACTIVE', enabled: true, channel: { code: channelCode, active: true } } },
        scheduleMappings: { some: { active: true, scheduleTemplate: { status: 'ACTIVE', archivedAt: null, effectiveFrom: { lte: serviceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: serviceDate } }], sessions: { some: { serviceDate, status: 'OPEN', archivedAt: null } } } } },
      },
      select: {
        id: true,
        currency: true,
        variant: { select: { id: true, productId: true } },
        scheduleMappings: {
          where: { active: true },
          select: { scheduleTemplate: { select: { sessions: { where: { serviceDate, status: 'OPEN', archivedAt: null }, select: { id: true } } } } },
        },
      },
    }) : [];
    const eligibleProductIds = new Set<string>();
    for (const plan of candidatePlans) {
      for (const session of plan.scheduleMappings.flatMap((mapping: any) => mapping.scheduleTemplate.sessions)) {
        const eligibility = await this.eligibility.evaluate({ agentTenantId: input.agentTenantId, ratePlanId: plan.id, sessionId: session.id, travellers: input.travellers, units: input.units, channelCode, visitorCategory: input.visitorCategory, visitorEligibilityVerified: input.visitorEligibilityVerified }, { client: tx });
        if (!eligibility.eligible) continue;
        if (this.channelEligibility) {
          const channel = await this.channelEligibility.evaluate({ channelCode, productId: plan.variant.productId, variantId: plan.variant.id, ratePlanId: plan.id, currency: plan.currency, units: input.units, agentTenantId: input.agentTenantId }, { client: tx });
          if (!channel.eligible) continue;
        }
        eligibleProductIds.add(plan.variant.productId);
      }
    }
    const candidates = productCandidates.filter((candidate) => eligibleProductIds.has(candidate.id));
    if (!candidates.some((candidate) => candidate.id === productId)) candidates.push({ id: productId, tenantId: vendorTenantId });
    const eligibleVendorIds = [...new Set(candidates.map((candidate) => candidate.tenantId))];
    if (eligibleVendorIds.length < 2) return;
    const countProductIds = [...new Set([...linkedProductIds, ...candidates.map((candidate) => candidate.id), productId])];
    const grouped: any[] = await tx.booking.groupBy({ by: ['vendorTenantId'], where: { recordType: BookingRecordType.CANONICAL, productId: { in: countProductIds } }, _count: { _all: true } });
    const counts = new Map<string, number>(grouped.map((row) => [row.vendorTenantId, Number(row._count?._all ?? 0)]));
    const priorityByProduct = new Map<string, number>(placements.map((placement: any) => [placement.productId, Number(placement.priority) || 0]));
    const priorityByVendor = new Map<string, number>();
    for (const candidate of candidates) priorityByVendor.set(candidate.tenantId, Math.max(priorityByVendor.get(candidate.tenantId) ?? 0, priorityByProduct.get(candidate.id) ?? 0));
    const orderedVendors = [...eligibleVendorIds].sort((left, right) => (priorityByVendor.get(right) ?? 0) - (priorityByVendor.get(left) ?? 0) || left.localeCompare(right));
    let expectedVendorId = orderedVendors[0];
    if (allocation === 'ROUND_ROBIN') {
      expectedVendorId = orderedVendors.reduce((best, candidate) => (counts.get(candidate) ?? 0) < (counts.get(best) ?? 0) ? candidate : best, orderedVendors[0]);
    } else {
      const totalAssigned = grouped.reduce((sum, row) => sum + Number(row._count?._all ?? 0), 0);
      const slot = totalAssigned % 10;
      if (slot >= 7) expectedVendorId = orderedVendors[1 + ((slot - 7) % (orderedVendors.length - 1))];
    }
    if (vendorTenantId !== expectedVendorId) throw new ConflictException({ code: 'SUPPLIER_ALLOCATION_CHANGED', message: 'The supplier allocation advanced after this offer was shown. Return to the marketplace, refresh results, and review the currently allocated supplier.' });
  }

  async preview(user: AuthUser, dto: BookingPreviewDto) {
    const agentTenantId = this.assertAgent(user); const now = new Date(); const context = await this.loadContext(this.prisma, dto.ratePlanId, dto.sessionId, agentTenantId);
    this.validateExperienceContext(context, dto);
    await this.assertSearchSelection(this.prisma, agentTenantId, context, dto);
    const eligibility = await this.eligibility.evaluate({ agentTenantId, ratePlanId: dto.ratePlanId, sessionId: dto.sessionId, travellers: dto.travellers as any, units: dto.units, channelCode: 'VOYA_AGENT', visitorCategory: dto.visitorCategory, visitorEligibilityVerified: dto.visitorEligibilityVerified, now });
    if (!context.plan || !context.session || !context.agent) return { eligible: false, bookingMode: eligibility.bookingMode, gates: eligibility.gates, priceChanged: false, contextFingerprint: null };
    const channelEligibility = this.channelEligibility ? await this.channelEligibility.evaluate({ channelCode: 'VOYA_AGENT', productId: context.plan.variant.product.id, variantId: context.plan.variant.id, ratePlanId: context.plan.id, currency: context.plan.currency, units: dto.units, agentTenantId }) : null;
    const quote = await this.commercial.evaluateInternal({ ratePlanId: dto.ratePlanId, serviceDate: new Date(context.session.serviceDate), activityStartsAt: context.session.startsAt, slotCode: context.session.slotTemplate?.slotCode, units: dto.units ?? 1, travellers: normalizeTravellers(dto.travellers as any).normalizedTravellers, agentTenantId, channel: 'VOYA_AGENT', visitorCategory: dto.visitorCategory, visitorEligibilityVerified: dto.visitorEligibilityVerified }, this.prisma);
    const policy = await this.policy.load(this.prisma, dto.ratePlanId, quote.ratePlanCommercialVersionId); const currentQuoteFingerprint = quote.quoteFingerprint ?? this.commercial.quoteFingerprint(quote); const contextFingerprint = this.contextFingerprint(context, { ...quote, quoteFingerprint: currentQuoteFingerprint }, policy.fingerprint); const currentAmount = quote.finalAmount?.toString() ?? null;
    return { eligible: eligibility.eligible && quote.ready && (channelEligibility?.eligible ?? true), bookingMode: quote.bookingMode, price: this.commercial.projectForAgent({ ...quote, quoteFingerprint: currentQuoteFingerprint }), quoteFingerprint: currentQuoteFingerprint, priceChanged: Boolean((dto.sourceQuoteFingerprint && dto.sourceQuoteFingerprint !== currentQuoteFingerprint) || (dto.sourceFinalAmount && dto.sourceFinalAmount !== currentAmount)), previousPrice: dto.sourceFinalAmount ?? null, cancellationPolicy: policy.policy, cancellationPolicyFingerprint: policy.fingerprint, questions: context.plan.variant.product.currentRevision.bookingQuestions, capacityConsumption: eligibility.capacityConsumption, confirmationSlaMinutes: quote.confirmationSlaMinutes ?? null, confirmationDueEstimate: quote.bookingMode !== BookingMode.INSTANT && quote.confirmationSlaMinutes ? new Date(now.getTime() + quote.confirmationSlaMinutes * 60_000) : null, productRevisionId: context.plan.variant.product.currentRevision.id, variantVersion: context.plan.variant.version, contextFingerprint, gates: [...eligibility.gates, ...(channelEligibility?.gates ?? [])] };
  }

  async create(user: AuthUser, dto: BookingCreateDto, idempotencyKey: string) {
    const agentTenantId = this.assertAgent(user); if (!idempotencyKey?.trim()) throw new ConflictException('Idempotency-Key is required'); const key = idempotencyKey.trim(); const requestFingerprint = this.requestFingerprint(agentTenantId, dto);
    const existing = await this.prisma.booking.findFirst({ where: { agentTenantId, idempotencyKey: key }, include: bookingInclude }); if (existing) return this.resolveIdempotency(existing, requestFingerprint);
    const selectionContext = await this.loadContext(this.prisma, dto.ratePlanId, dto.sessionId, agentTenantId);
    this.validateExperienceContext(selectionContext, dto);
    try {
      const saved = await this.prisma.$transaction(async (tx) => { if ((tx as any).$executeRawUnsafe) await (tx as any).$executeRawUnsafe('SET LOCAL search_path TO public');
        let context = await this.loadContext(tx, dto.ratePlanId, dto.sessionId, agentTenantId); if (!context.plan || !context.session || !context.agent) throw new NotFoundException('Booking context not found');
        const searchSelectionLock = await this.assertSearchSelection(tx, agentTenantId, context, dto, true);
        if (context.agent.kind !== TenantKind.TRAVEL_AGENT || context.agent.agentProfile?.verificationStatus !== 'APPROVED') throw new ForbiddenException('Travel Agent approval is required'); let plan = context.plan; let session = context.session; const vendor = plan.variant.product.tenant; if (vendor.kind !== TenantKind.VENDOR || vendor.vendorProfile?.verificationStatus !== 'VERIFIED') throw new ConflictException('VENDOR_NOT_VERIFIED');
        const normalized = normalizeTravellers(dto.travellers as any); const capacity = capacityQuantity(session.scheduleTemplate.capacityUnit, session.scheduleTemplate.capacityUnit === 'UNIT' ? (dto.units ?? 1) : session.scheduleTemplate.capacityUnit === 'BOOKING' ? 1 : normalized.totalPax); const quoteBeforeLock = await this.commercial.evaluateInternal({ ratePlanId: plan.id, serviceDate: new Date(session.serviceDate), activityStartsAt: session.startsAt, slotCode: session.slotTemplate?.slotCode, units: dto.units ?? 1, travellers: normalized.normalizedTravellers, agentTenantId, channel: 'VOYA_AGENT', visitorCategory: dto.visitorCategory, visitorEligibilityVerified: dto.visitorEligibilityVerified }, tx); if (!quoteBeforeLock.bookingMode) throw new ConflictException('BOOKING_MODE_MISSING');
        const qaOverride = await getQaOnlyEligibilityOverride(tx, plan.variant.product.id, agentTenantId);
        let channel = plan.channelMappings.find((mapping: any) => mapping.channel.code === 'VOYA_AGENT' && mapping.enabled && mapping.channel.active);
        if (!channel && qaOverride) { const channelRecord = await tx.distributionChannel.findUnique({ where: { code: 'VOYA_AGENT' } }); if (channelRecord?.active) channel = { channel: channelRecord }; }
        if (!channel) throw new ConflictException('MARKETPLACE_CHANNEL_NOT_CONFIGURED');
        if (this.channelEligibility) { const channelResult = await this.channelEligibility.evaluate({ channelCode: 'VOYA_AGENT', productId: plan.variant.product.id, variantId: plan.variant.id, ratePlanId: plan.id, currency: plan.currency, units: dto.units, agentTenantId }, { client: tx }); if (!channelResult.eligible) throw new ConflictException({ code: channelResult.reasonCodes[0] ?? 'CHANNEL_NOT_ELIGIBLE', message: 'Agent distribution eligibility failed', gates: channelResult.gates }); }
        const selectionRule = await (tx as any).experienceSelectionRuleSet?.findFirst?.({ where: { scope: { in: [channel.channel.code, 'GLOBAL'] }, status: 'LIVE' }, orderBy: { scope: 'desc' } });
        if (!searchSelectionLock) await this.enforceSupplierAllocation(tx, { experienceMasterId: plan.variant.product.experienceMasterId, productId: plan.variant.product.id, vendorTenantId: vendor.id, serviceDate: new Date(session.serviceDate), channelCode: channel.channel.code, allocation: selectionRule?.allocation, agentTenantId, travellers: dto.travellers as any, units: dto.units, visitorCategory: dto.visitorCategory, visitorEligibilityVerified: dto.visitorEligibilityVerified });
        const bookingPrefix = channel.channel.code === 'VOYA_AGENT' ? 'AG' : channel.channel.code === 'VOYA_API' ? 'AP' : 'BK';
        const bookingPeriod = `${String(new Date().getUTCFullYear()).slice(-2)}${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
        const publicBookingCode = await allocatePublicCode(tx, PublicEntity.BOOKING, `${bookingPrefix}-${bookingPeriod}`, 4);
        const booking = await tx.booking.create({ data: { recordType: BookingRecordType.CANONICAL, bookingCode: `VY-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`, vendorTenantId: vendor.id, agentTenantId, agentUserId: user.sub, productId: plan.variant.product.id, productRevisionId: plan.variant.product.currentRevision?.id, variantId: plan.variant.id, ratePlanId: plan.id, sessionId: session.id, distributionChannelId: channel.channel.id, bookingMode: quoteBeforeLock.bookingMode, channel: channel.channel.code, serviceDate: session.serviceDate, serviceTimezone: session.scheduleTemplate.timezone, pax: normalized.totalPax, paxBreakdown: normalized.quantitiesByType as Prisma.InputJsonValue, units: dto.units, capacityConsumption: capacity, amount: quoteBeforeLock.finalAmount ?? 0, currency: quoteBeforeLock.currency ?? plan.currency, status: BookingStatus.NEW, idempotencyKey: key, requestFingerprint, customerName: dto.customerName, customerEmail: dto.customerEmail } });
        if (searchSelectionLock) await tx.experienceSelectionLock.update({ where: { id: searchSelectionLock.id }, data: { bookingId: booking.id, consumedAt: new Date() } });
        await ensurePublicIdentifier(tx, PublicEntity.BOOKING, booking.id, publicBookingCode);
        const lockedState = await this.inventory.lockStateForBooking(tx, session.id); if (!lockedState) throw new NotFoundException('Inventory state not found'); await this.lockBookingContext(tx, plan.variant.product.id, plan.variant.id, plan.id, session.id); context = await this.loadContext(tx, dto.ratePlanId, dto.sessionId, agentTenantId); if (!context.plan || !context.session || !context.agent) throw new ConflictException('BOOKING_CONTEXT_CHANGED'); plan = context.plan; session = context.session;
        const finalEligibility = await this.eligibility.evaluate({ agentTenantId, ratePlanId: plan.id, sessionId: session.id, travellers: dto.travellers as any, units: dto.units, channelCode: channel.channel.code, visitorCategory: dto.visitorCategory, visitorEligibilityVerified: dto.visitorEligibilityVerified, now: new Date() }, { client: tx }); if (!finalEligibility.eligible) throw new ConflictException({ code: finalEligibility.gates.find((gate) => gate.status === 'FAIL')?.code ?? 'ELIGIBILITY_FAILED', message: 'Booking eligibility failed', gates: finalEligibility.gates });
        if (this.channelEligibility) { const channelResult = await this.channelEligibility.evaluate({ channelCode: 'VOYA_AGENT', productId: plan.variant.product.id, variantId: plan.variant.id, ratePlanId: plan.id, currency: plan.currency, units: dto.units, agentTenantId }, { client: tx }); if (!channelResult.eligible) throw new ConflictException({ code: channelResult.reasonCodes[0] ?? 'CHANNEL_NOT_ELIGIBLE', message: 'Agent distribution eligibility failed', gates: channelResult.gates }); }
        const quote = await this.commercial.evaluateInternal({ ratePlanId: plan.id, serviceDate: new Date(session.serviceDate), activityStartsAt: session.startsAt, slotCode: session.slotTemplate?.slotCode, units: dto.units ?? 1, travellers: normalized.normalizedTravellers, agentTenantId, channel: 'VOYA_AGENT', visitorCategory: dto.visitorCategory, visitorEligibilityVerified: dto.visitorEligibilityVerified }, tx); const quoteFingerprint = quote.quoteFingerprint ?? this.commercial.quoteFingerprint(quote); if (!quote.ready) throw new ConflictException({ code: quote.reasonCodes?.[0] ?? 'COMMERCIAL_NOT_READY', message: 'Current commercial quote is not ready' });
        if (quoteFingerprint !== dto.expectedQuoteFingerprint) throw new ConflictException({ code: 'PRICE_CHANGED', message: 'The price changed; refresh Preview before creating the booking', currentQuoteFingerprint: quoteFingerprint }); if (dto.sourceQuoteFingerprint && dto.sourceQuoteFingerprint !== dto.expectedQuoteFingerprint && !dto.priceChangeAcknowledged) throw new ConflictException('PRICE_CHANGE_ACK_REQUIRED');
         const cancellation = await this.policy.load(tx, plan.id, quote.ratePlanCommercialVersionId); if (cancellation.fingerprint !== dto.expectedCancellationPolicyFingerprint) throw new ConflictException({ code: 'CANCELLATION_POLICY_CHANGED', message: 'Cancellation policy changed; refresh Preview' }); if (!dto.cancellationPolicyAcknowledged) throw new ConflictException('CANCELLATION_POLICY_ACK_REQUIRED'); const contextFingerprint = this.contextFingerprint(context, { ...quote, quoteFingerprint }, cancellation.fingerprint); if (contextFingerprint !== dto.expectedContextFingerprint) throw new ConflictException({ code: 'BOOKING_CONTEXT_CHANGED', message: 'Booking context changed; refresh Preview' });
        const details = this.validateTravellerDetails(dto.travellerDetails ?? dto.travellers, normalized); this.validateAnswers(plan.variant.product.currentRevision.bookingQuestions, details, dto.bookingAnswers ?? {});
        const persistedSelectionRule = selectionRule || searchSelectionLock ? { ...(selectionRule ?? {}), id: selectionRule?.id ?? null, scope: selectionRule?.scope ?? channel.channel.code, allocation: selectionRule?.allocation ?? 'WINNER_TAKES_ALL', autoFailover: selectionRule?.autoFailover ?? false, absorbPriceGap: selectionRule?.absorbPriceGap ?? 'NEVER', lockMinutes: selectionRule?.lockMinutes ?? 15, experienceMasterId: plan.variant.product.experienceMasterId, selectedRatePlanId: plan.id, searchAttemptId: dto.searchAttemptId ?? null, selectionLockedUntil: searchSelectionLock?.expiresAt ?? null } : null; const configuredLockMinutes = Number(selectionRule?.lockMinutes); const sla = quote.bookingMode === BookingMode.INSTANT ? null : Number.isInteger(configuredLockMinutes) && configuredLockMinutes > 0 ? configuredLockMinutes : quote.confirmationSlaMinutes; if (quote.bookingMode !== BookingMode.INSTANT && (!Number.isInteger(sla) || (sla ?? 0) <= 0)) throw new ConflictException('CONFIRMATION_SLA_MISSING'); const now = new Date(); const due = typeof sla === 'number' ? new Date(now.getTime() + sla * 60_000) : null; const updated = await tx.booking.update({ where: { id: booking.id }, data: { bookingMode: quote.bookingMode, amount: quote.finalAmount ?? 0, currency: quote.currency ?? plan.currency, confirmationDueAt: due, status: quote.bookingMode === BookingMode.INSTANT ? BookingStatus.CONFIRMED : quote.bookingMode === BookingMode.VENDOR_CONFIRMATION ? BookingStatus.PENDING_VENDOR_CONFIRMATION : BookingStatus.PENDING_MANUAL_REVIEW, confirmedAt: quote.bookingMode === BookingMode.INSTANT ? now : null, capacityConsumption: finalEligibility.capacityConsumption, pax: normalized.totalPax, paxBreakdown: normalized.quantitiesByType as Prisma.InputJsonValue } });
        for (const [index, detail] of details.entries()) await tx.bookingTraveller.create({ data: { bookingId: booking.id, travellerType: detail.travellerType as any, sequence: index + 1, quantity: detail.quantity, fullName: detail.fullName, age: detail.age, email: detail.email, phone: detail.phone, isLead: detail.isLead === true, answers: (detail.answers ?? {}) as Prisma.InputJsonValue } });
        const fulfilmentPolicy = plan.variant.product.currentRevision.fulfilmentPolicy; if (!fulfilmentPolicy) throw new ConflictException('FULFILMENT_POLICY_SNAPSHOT_MISSING');
        await this.snapshot.create(tx, { booking: updated, plan, session, agent: context.agent, user, policy: cancellation.policy, policyFingerprint: cancellation.fingerprint, questions: plan.variant.product.currentRevision.bookingQuestions, bookingAnswers: dto.bookingAnswers ?? {}, pickupDetails: dto.pickupDetails, cancellationAcknowledgedAt: now, quote: { ...quote, confirmationSlaMinutes: sla }, selectionRule: persistedSelectionRule, fulfilmentPolicy }); await tx.bookingEconomicsSnapshot.create({ data: { bookingId: booking.id, ...this.commercial.toBookingSnapshotData(quote) } as any }); if (this.fulfilment) await this.fulfilment.initializeInTransaction(tx, updated, { ...fulfilmentPolicy, howToRedeem: plan.variant.product.currentRevision.voucherInstructions ? [plan.variant.product.currentRevision.voucherInstructions] : plan.variant.product.currentRevision.howToRedeem }, user);
        if (quote.bookingMode === BookingMode.INSTANT) await this.inventory.confirmDirectInTransaction(tx, { sessionId: session.id, quantity: finalEligibility.capacityConsumption!, bookingId: booking.id, referenceKey: `booking:${booking.id}`, reason: 'instant booking', actor: user }); else await this.inventory.createHoldInTransaction(tx, { sessionId: session.id, quantity: finalEligibility.capacityConsumption!, bookingId: booking.id, referenceKey: `booking:${booking.id}`, expiresAt: due!, reason: quote.bookingMode === BookingMode.VENDOR_CONFIRMATION ? 'vendor confirmation' : 'manual review', actor: user });
        await this.addEvent(tx, updated, 'BOOKING_CREATED', BookingStatus.NEW, updated.status, user); if (updated.status === BookingStatus.CONFIRMED) { await this.addEvent(tx, updated, 'BOOKING_CONFIRMED', BookingStatus.NEW, updated.status, user); await this.addFinancialEvent(tx, updated, user, now); } else await this.addEvent(tx, updated, updated.status === BookingStatus.PENDING_VENDOR_CONFIRMATION ? 'BOOKING_PENDING_VENDOR_CONFIRMATION' : 'BOOKING_PENDING_MANUAL_REVIEW', BookingStatus.NEW, updated.status, user);
        await this.audit.write(tx, { actor: user, tenantId: agentTenantId, action: 'BOOKING_CREATED', entityType: 'Booking', entityId: booking.id, metadata: { bookingMode: updated.bookingMode, status: updated.status, qaOnlyTestFixture: !!qaOverride } }); await this.outbox.enqueue(tx, { tenantId: agentTenantId, eventType: 'BOOKING_CREATED', aggregateType: 'Booking', aggregateId: booking.id, payload: { bookingCode: booking.bookingCode, status: updated.status, bookingMode: updated.bookingMode, ...(qaOverride ? { qaOnlyTestFixture: true } : {}) } }); if (updated.status === BookingStatus.CONFIRMED) await this.outbox.enqueue(tx, { tenantId: agentTenantId, eventType: 'BOOKING_CONFIRMED', aggregateType: 'Booking', aggregateId: booking.id, payload: { bookingCode: booking.bookingCode, ...(qaOverride ? { qaOnlyTestFixture: true } : {}) } });
        return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include: bookingInclude });
      }, { timeout: 30000, maxWait: 30000 });
      return this.projection.forAgent(saved);
    } catch (error: any) { if (error?.code === 'P2002') { const duplicate = await this.prisma.booking.findFirst({ where: { agentTenantId, idempotencyKey: key }, include: bookingInclude }); if (duplicate) return this.resolveIdempotency(duplicate, requestFingerprint); } throw error; }
  }

  private resolveIdempotency(booking: any, requestFingerprint: string) { if (booking.requestFingerprint !== requestFingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key was already used for a different request' }); return this.projection.forAgent(booking); }
  private validateTravellerDetails(details: BookingTravellerDetailDto[], normalized: any) { if (!details?.length) throw new ConflictException('Traveller details are required'); const leadCount = details.filter((detail) => detail.isLead === true).length; if (!leadCount) throw new ConflictException('LEAD_TRAVELLER_REQUIRED'); if (leadCount > 1) throw new ConflictException('MULTIPLE_LEAD_TRAVELLERS'); const quantities = details.reduce((map: Record<string, number>, detail: any) => { map[detail.travellerType] = (map[detail.travellerType] ?? 0) + detail.quantity; return map; }, {}); const expected = normalized.quantitiesByType as Record<string, number>; const types = new Set([...Object.keys(quantities), ...Object.keys(expected)]); for (const type of types) if ((quantities[type] ?? 0) !== (expected[type] ?? 0)) throw new ConflictException('TRAVELLER_DETAILS_MISMATCH'); return details; }
  private validateAnswers(questions: any[], details: BookingTravellerDetailDto[], answers: Record<string, unknown>) { const known = new Set(questions.map((question) => question.code)); for (const key of Object.keys(answers)) if (!known.has(key)) throw new ConflictException(`Unknown booking answer: ${key}`); const check = (question: any, value: unknown, required: boolean) => { if (value === undefined || value === null || (question.type === 'TEXT' && typeof value === 'string' && !value.trim())) { if (required) throw new ConflictException(`BOOKING_ANSWER_REQUIRED:${question.code}`); return; } if (question.type === 'TEXT' && typeof value !== 'string') throw new ConflictException(`BOOKING_ANSWER_INVALID:${question.code}`); if (question.type === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) throw new ConflictException(`BOOKING_ANSWER_INVALID:${question.code}`); if (question.type === 'BOOLEAN' && typeof value !== 'boolean') throw new ConflictException(`BOOKING_ANSWER_INVALID:${question.code}`); if (question.type === 'SELECT' && !((Array.isArray(question.options) ? question.options : Object.values(question.options ?? {})).map(String).includes(String(value)))) throw new ConflictException(`BOOKING_ANSWER_INVALID:${question.code}`); }; for (const question of questions) if (question.appliesPerTraveller) for (const detail of details) check(question, detail.answers?.[question.code], question.required); else check(question, answers[question.code], question.required); }
  private async addEvent(tx: Prisma.TransactionClient, booking: any, eventType: string, fromStatus: BookingStatus | null, toStatus: BookingStatus | null, actor: AuthUser | null, reason?: string, metadata?: Record<string, unknown>) { return tx.bookingEvent.create({ data: { bookingId: booking.id, eventType, fromStatus, toStatus, actorUserId: actor?.sub ?? null, actorRole: actor?.role ?? null, reason: reason ?? null, metadata: metadata as Prisma.InputJsonValue | undefined } }); }
  private async addFinancialEvent(tx: Prisma.TransactionClient, booking: any, actor: AuthUser | null, occurredAt = new Date()) {
    const eventKey = `booking:${booking.id}:confirmed`;
    const client: any = tx;
    let economics: any = await client.bookingEconomicsSnapshot.findUnique({ where: { bookingId: booking.id } });
    const existing = await client.financialEvent.findUnique?.({ where: { eventKey }, select: { id: true } });
    if (!existing && economics && client.financeConfiguration?.findUnique) {
      const financeConfiguration = await client.financeConfiguration.findUnique({ where: { id: 'default' } });
      if (financeConfiguration) {
        const taxSnapshot = snapshotBookingTaxDeductions(economics, financeConfiguration);
        economics = await client.bookingEconomicsSnapshot.update({ where: { bookingId: booking.id }, data: taxSnapshot });
      }
    }
    const event = await tx.financialEvent.upsert({ where: { eventKey }, update: {}, create: {
      eventKey: `booking:${booking.id}:confirmed`, bookingId: booking.id, vendorTenantId: booking.vendorTenantId, agentTenantId: booking.agentTenantId,
      type: FinancialEventType.BOOKING_CONFIRMED, status: FinancialEventStatus.POSTED, currency: booking.currency, amount: booking.amount,
      vendorAmount: economics?.netVendorPayable ?? economics?.vendorPayable ?? null,
      components: { bookingMode: booking.bookingMode, finalAmount: booking.amount?.toString?.() ?? String(booking.amount), economicsSnapshotId: economics?.id ?? null, supplierGrossBasis: economics?.supplierGrossBasis?.toString?.() ?? null, supplierCommission: economics?.supplierCommission?.toString?.() ?? null, vendorPayable: economics?.vendorPayable?.toString?.() ?? null, netVendorPayable: economics?.netVendorPayable?.toString?.() ?? economics?.vendorPayable?.toString?.() ?? null, gstOnCommissionPercent: economics?.gstOnCommissionPercent?.toString?.() ?? null, gstOnCommissionAmount: economics?.gstOnCommissionAmount?.toString?.() ?? null, tds194OPercent: economics?.tds194OPercent?.toString?.() ?? null, tds194OAmount: economics?.tds194OAmount?.toString?.() ?? null, gstTcsPercent: economics?.gstTcsPercent?.toString?.() ?? null, gstTcsAmount: economics?.gstTcsAmount?.toString?.() ?? null, financeConfigurationVersion: economics?.financeConfigurationVersion ?? null, taxAmount: economics?.taxAmount?.toString?.() ?? null, promotionAmount: economics?.promotionAmount?.toString?.() ?? null, promotionFunder: economics?.promotionFunder ?? null },
      actorUserId: actor?.sub ?? null, occurredAt
    } });
    if (economics?.promotionAmount?.gt?.(0) && economics.promotionFunder && (tx as any).financialEvent?.upsert) await tx.financialEvent.upsert({ where: { eventKey: `booking:${booking.id}:promotion-funded` }, update: {}, create: { eventKey: `booking:${booking.id}:promotion-funded`, bookingId: booking.id, vendorTenantId: booking.vendorTenantId, agentTenantId: booking.agentTenantId, type: FinancialEventType.PROMOTION_FUNDED, status: FinancialEventStatus.POSTED, currency: booking.currency, amount: economics.promotionAmount, vendorAmount: null, components: { promotionAmount: economics.promotionAmount.toString(), promotionFunder: economics.promotionFunder, promotionFundingBreakdown: economics.promotionContext ?? {}, economicsSnapshotId: economics.id }, actorUserId: actor?.sub ?? null, occurredAt } });
    return event;
  }

  async agentList(user: AuthUser, query: BookingListQueryDto) {
    const agentTenantId = this.assertAgent(user);
    const statusFilter = query.statusGroup === 'REJECTED' ? { in: [BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED] } : query.status;
    const where: Prisma.BookingWhereInput = {
      recordType: BookingRecordType.CANONICAL,
      agentTenantId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(query.bookingMode ? { bookingMode: query.bookingMode } : {}),
      ...(query.from || query.to ? { serviceDate: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
      ...(query.q ? { OR: [{ bookingCode: { contains: query.q.trim(), mode: 'insensitive' } }, { customerName: { contains: query.q.trim(), mode: 'insensitive' } }] } : {}),
    };
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const rows = await this.prisma.booking.findMany({ where, include: bookingInclude, orderBy: [{ serviceDate: 'asc' }, { createdAt: 'desc' }], take: limit, skip: (page - 1) * limit });
    return rows.map((row) => this.projection.forAgent(row));
  }
  async agentDetail(user: AuthUser, id: string) { const agentTenantId = this.assertAgent(user); const row = await this.prisma.booking.findFirst({ where: { id, recordType: BookingRecordType.CANONICAL, agentTenantId }, include: bookingInclude }); if (!row) throw new NotFoundException('Booking not found'); return this.projection.forAgent(row); }
  async vendorList(user: AuthUser, query: BookingListQueryDto) {
    const vendorTenantId = requireTenant(user);
    const search = query.q?.trim();
    const serviceDates = serviceDateRange(query.from, query.to);
    const publicMatches = search
      ? await this.prisma.publicIdentifier.findMany({
          where: { entityType: PublicEntity.BOOKING, publicCode: { contains: search, mode: 'insensitive' } },
          select: { entityId: true },
        })
      : [];
    const rows: any[] = await this.prisma.booking.findMany({
      where: {
        vendorTenantId,
        ...(query.status ? { status: query.status } : query.statusGroup === 'REJECTED' ? { status: { in: [BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED, BookingStatus.CONFIRMATION_EXPIRED] } } : {}),
        ...(query.recordType ? { recordType: query.recordType } : {}),
        ...(query.bookingMode ? { bookingMode: query.bookingMode } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.agentTenantId ? { agentTenantId: query.agentTenantId } : {}),
        ...(serviceDates ? { serviceDate: serviceDates } : {}),
        ...(search ? { OR: [
          { bookingCode: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { customerEmail: { contains: search, mode: 'insensitive' } },
          { travellers: { some: { phone: { contains: search, mode: 'insensitive' } } } },
          { vouchers: { some: { voucherCode: { contains: search, mode: 'insensitive' } } } },
          { product: { productCode: { contains: search, mode: 'insensitive' } } },
          ...(publicMatches.length ? [{ id: { in: publicMatches.map((row: any) => row.entityId) } }] : []),
        ] } : {}),
      },
      include: bookingInclude,
      orderBy: [{ confirmationDueAt: 'asc' }, { createdAt: 'desc' }],
      ...(query.page ? { skip: (query.page - 1) * Math.min(query.limit ?? 25, 100), take: Math.min(query.limit ?? 25, 100) } : { skip: 0, take: 200 }),
    });
    const publicCodes = await publicIdentifierMap(this.prisma, PublicEntity.BOOKING, rows.map((row) => row.id));
    return rows.map((row) => {
      row.publicCode = publicCodes.get(row.id) || null;
      return this.projection.forVendor(row);
    });
  }
  async vendorPage(user: AuthUser, query: BookingListQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);
    const vendorTenantId = requireTenant(user);
    const search = query.q?.trim();
    const serviceDates = serviceDateRange(query.from, query.to);
    const publicMatches = search ? await this.prisma.publicIdentifier.findMany({ where: { entityType: PublicEntity.BOOKING, publicCode: { contains: search, mode: 'insensitive' } }, select: { entityId: true } }) : [];
    const where: any = {
      vendorTenantId,
      ...(query.status ? { status: query.status } : query.statusGroup === 'REJECTED' ? { status: { in: [BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED, BookingStatus.CONFIRMATION_EXPIRED] } } : {}),
      ...(query.recordType ? { recordType: query.recordType } : {}),
      ...(query.bookingMode ? { bookingMode: query.bookingMode } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.agentTenantId ? { agentTenantId: query.agentTenantId } : {}),
      ...(serviceDates ? { serviceDate: serviceDates } : {}),
      ...(search ? { OR: [
        { bookingCode: { contains: search, mode: 'insensitive' } }, { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } }, { travellers: { some: { phone: { contains: search, mode: 'insensitive' } } } },
        { vouchers: { some: { voucherCode: { contains: search, mode: 'insensitive' } } } }, { product: { productCode: { contains: search, mode: 'insensitive' } } },
        ...(publicMatches.length ? [{ id: { in: publicMatches.map((row: any) => row.entityId) } }] : []),
      ] } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({ where, include: bookingInclude, orderBy: [{ confirmationDueAt: 'asc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
    ]);
    const publicCodes = await publicIdentifierMap(this.prisma, PublicEntity.BOOKING, (items as any[]).map((row) => row.id));
    const rows = (items as any[]).map((row) => { row.publicCode = publicCodes.get(row.id) || null; return this.projection.forVendor(row); });
    return { items: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
  async vendorCsv(user: AuthUser, query: BookingListQueryDto) {
    const rows: any[] = [];
    const first = await this.vendorPage(user, { ...query, page: 1, limit: 100 });
    rows.push(...first.items);
    for (let page = 2; page <= first.pagination.totalPages; page += 1) rows.push(...(await this.vendorPage(user, { ...query, page, limit: 100 })).items);
    const csv = (value: unknown) => { const text = value == null ? '' : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
    const lines = [['Booking', 'Product', 'Service date', 'Agent', 'Status', 'Pax', 'Amount', 'Currency'], ...rows.map((row: any) => [row.bookingCode, row.snapshot?.productSnapshot?.productName || '', row.serviceDate, row.agent?.name || '', row.status, row.travellers?.reduce((sum: number, item: any) => sum + Number(item.quantity || 1), 0) || '', row.amount ?? '', row.currency || 'INR'])];
    return `${lines.map((line) => line.map(csv).join(',')).join('\r\n')}\r\n`;
  }
  async vendorDetail(user: AuthUser, id: string) { const vendorTenantId = requireTenant(user); const row = await this.prisma.booking.findFirst({ where: { id, vendorTenantId }, include: bookingInclude }); if (!row) throw new NotFoundException('Booking not found'); return this.projection.forVendor(row); }

  private async lockBookingContext(tx: Prisma.TransactionClient, productId: string, variantId: string, ratePlanId: string, sessionId: string) { for (const [table, id] of [['Product', productId], ['ProductVariant', variantId], ['RatePlan', ratePlanId], ['ServiceSession', sessionId]]) { const rows = await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM "public"."${table}" WHERE "id" = $1 FOR UPDATE`, id); if (!rows[0]) throw new ConflictException('BOOKING_CONTEXT_CHANGED'); } }
  private async lockBooking(tx: Prisma.TransactionClient, id: string) { const rows = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "public"."Booking" WHERE "id" = $1 FOR UPDATE`, id); if (!rows[0]) throw new NotFoundException('Booking not found'); return tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }); }
  async vendorConfirm(user: AuthUser, id: string) {
    const vendorTenantId = requireTenant(user);
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, id);
      if (booking.vendorTenantId !== vendorTenantId) throw new NotFoundException('Booking not found');
      if (booking.recordType !== BookingRecordType.CANONICAL || booking.status !== BookingStatus.PENDING_VENDOR_CONFIRMATION) throw new ConflictException(`Booking cannot be confirmed from ${booking.status}`);
      if (!booking.confirmationDueAt || now >= booking.confirmationDueAt) {
        await this.expireLocked(tx, booking, null, 'confirmation deadline reached', now);
        return { outcome: 'EXPIRED' as const };
      }
      const hold = await tx.inventoryHold.findFirst({ where: { bookingId: booking.id, status: 'ACTIVE' } });
      if (!hold) throw new ConflictException('BOOKING_HOLD_MISSING');
      await this.inventory.convertHoldToConfirmedInTransaction(tx, hold.id, { bookingId: booking.id, referenceKey: `booking:${booking.id}`, actor: user });
      const updated = await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.CONFIRMED, confirmedAt: now, version: { increment: 1 } } });
      if (this.fulfilment) await this.fulfilment.confirmInTransaction(tx, updated, user);
      await this.addEvent(tx, updated, 'VENDOR_CONFIRMED', BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.CONFIRMED, user);
      await this.addFinancialEvent(tx, updated, user, now);
      await this.audit.write(tx, { actor: user, tenantId: vendorTenantId, action: 'BOOKING_VENDOR_CONFIRMED', entityType: 'Booking', entityId: id });
      await this.outbox.enqueue(tx, { tenantId: vendorTenantId, eventType: 'BOOKING_CONFIRMED', aggregateType: 'Booking', aggregateId: id, payload: { bookingCode: booking.bookingCode } });
      return { outcome: 'CONFIRMED' as const, booking: await tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }) };
    }, { timeout: 30000, maxWait: 30000 });
    if (result.outcome === 'EXPIRED') throw new ConflictException('BOOKING_CONFIRMATION_EXPIRED');
    return this.projection.forVendor(result.booking);
  }
  async vendorReject(user: AuthUser, id: string, dto: BookingDecisionDto) {
    return this.processVendorFailure(user, id, dto, 'VENDOR_REJECTED');
  }
  async vendorApiFailure(user: AuthUser, id: string, dto: BookingDecisionDto) {
    return this.processVendorFailure(user, id, dto, 'VENDOR_API_FAILURE');
  }
  private async processVendorFailure(user: AuthUser, id: string, dto: BookingDecisionDto, failureType: 'VENDOR_REJECTED' | 'VENDOR_API_FAILURE') {
    const vendorTenantId = requireTenant(user);
    if (!dto.reason?.trim()) throw new ConflictException('A rejection reason is required');
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, id);
      if (booking.vendorTenantId !== vendorTenantId) throw new NotFoundException('Booking not found');
      if (booking.recordType !== BookingRecordType.CANONICAL || booking.status !== BookingStatus.PENDING_VENDOR_CONFIRMATION) throw new ConflictException(`Booking cannot be rejected from ${booking.status}`);
      if (await this.expireIfDueLocked(tx, booking, user, now)) return { outcome: 'EXPIRED' as const };
      const candidate = await this.findAutoFailoverCandidate(tx, booking);
      if (candidate) {
        const updated = await this.applyAutoFailover(tx, booking, candidate, user, dto.reason.trim(), now, failureType);
        return { outcome: 'FAILOVERED' as const, booking: await tx.booking.findUniqueOrThrow({ where: { id: updated.id }, include: bookingInclude }) };
      }
      const hold = await tx.inventoryHold.findFirst({ where: { bookingId: booking.id, status: 'ACTIVE' } });
      if (!hold) throw new ConflictException('BOOKING_HOLD_MISSING');
      await this.inventory.releaseHoldInTransaction(tx, hold.id, dto.reason.trim(), user);
      const updated = await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.VENDOR_REJECTED, rejectedAt: now, version: { increment: 1 } } });
      await this.fulfilment?.voidForTerminalOutcomeInTransaction(tx, id, user, dto.reason.trim(), 'VENDOR_REJECTED');
      await this.addEvent(tx, updated, failureType, BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.VENDOR_REJECTED, user, dto.reason.trim(), { failureType });
      await this.audit.write(tx, { actor: user, tenantId: vendorTenantId, action: failureType === 'VENDOR_API_FAILURE' ? 'BOOKING_VENDOR_API_FAILURE' : 'BOOKING_VENDOR_REJECTED', entityType: 'Booking', entityId: id, reason: dto.reason });
      await this.outbox.enqueue(tx, { tenantId: vendorTenantId, eventType: failureType, aggregateType: 'Booking', aggregateId: id, payload: { bookingCode: booking.bookingCode, reason: dto.reason.trim() } });
      return { outcome: 'REJECTED' as const, booking: await tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }) };
    }, { timeout: 30000, maxWait: 30000 });
    if (result.outcome === 'EXPIRED') throw new ConflictException('BOOKING_CONFIRMATION_EXPIRED');
    return this.projection.forVendor(result.booking);
  }
  async manualConfirm(user: AuthUser, id: string) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, id);
      if (booking.recordType !== BookingRecordType.CANONICAL || booking.status !== BookingStatus.PENDING_MANUAL_REVIEW) throw new ConflictException(`Booking cannot be confirmed from ${booking.status}`);
      if (!booking.confirmationDueAt || now >= booking.confirmationDueAt) {
        await this.expireLocked(tx, booking, null, 'confirmation deadline reached', now);
        return { outcome: 'EXPIRED' as const };
      }
      const hold = await tx.inventoryHold.findFirst({ where: { bookingId: booking.id, status: 'ACTIVE' } });
      if (!hold) throw new ConflictException('BOOKING_HOLD_MISSING');
      await this.inventory.convertHoldToConfirmedInTransaction(tx, hold.id, { bookingId: booking.id, referenceKey: `booking:${booking.id}`, actor: user });
      const updated = await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.CONFIRMED, confirmedAt: now, version: { increment: 1 } } });
      if (this.fulfilment) await this.fulfilment.confirmInTransaction(tx, updated, user);
      await this.addEvent(tx, updated, 'MANUAL_CONFIRMED', BookingStatus.PENDING_MANUAL_REVIEW, BookingStatus.CONFIRMED, user);
      await this.addFinancialEvent(tx, updated, user, now);
      await this.audit.write(tx, { actor: user, action: 'BOOKING_MANUAL_CONFIRMED', entityType: 'Booking', entityId: id });
      await this.outbox.enqueue(tx, { eventType: 'BOOKING_CONFIRMED', aggregateType: 'Booking', aggregateId: id, payload: { bookingCode: booking.bookingCode } });
      return { outcome: 'CONFIRMED' as const, booking: await tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }) };
    }, { timeout: 30000, maxWait: 30000 });
    if (result.outcome === 'EXPIRED') throw new ConflictException('BOOKING_CONFIRMATION_EXPIRED');
    return this.projection.forAdmin(result.booking);
  }
  async manualReject(user: AuthUser, id: string, dto: BookingDecisionDto) { if (!dto.reason?.trim()) throw new ConflictException('A rejection reason is required'); const now = new Date(); const result = await this.prisma.$transaction(async (tx) => { const booking = await this.lockBooking(tx, id); if (booking.recordType !== BookingRecordType.CANONICAL || booking.status !== BookingStatus.PENDING_MANUAL_REVIEW) throw new ConflictException(`Booking cannot be rejected from ${booking.status}`); if (await this.expireIfDueLocked(tx, booking, user, now)) return { outcome: 'EXPIRED' as const }; const hold = await tx.inventoryHold.findFirst({ where: { bookingId: booking.id, status: 'ACTIVE' } }); if (!hold) throw new ConflictException('BOOKING_HOLD_MISSING'); await this.inventory.releaseHoldInTransaction(tx, hold.id, dto.reason.trim(), user); const updated = await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.MANUAL_REJECTED, rejectedAt: now, version: { increment: 1 } } }); await this.fulfilment?.voidForTerminalOutcomeInTransaction(tx, id, user, dto.reason.trim(), 'MANUAL_REJECTED'); await this.addEvent(tx, updated, 'MANUAL_REJECTED', BookingStatus.PENDING_MANUAL_REVIEW, BookingStatus.MANUAL_REJECTED, user, dto.reason.trim()); await this.audit.write(tx, { actor: user, action: 'BOOKING_MANUAL_REJECTED', entityType: 'Booking', entityId: id, reason: dto.reason }); await this.outbox.enqueue(tx, { eventType: 'BOOKING_MANUAL_REJECTED', aggregateType: 'Booking', aggregateId: id, payload: { bookingCode: booking.bookingCode, reason: dto.reason.trim() } }); return { outcome: 'REJECTED' as const, booking: await tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }) }; }, { timeout: 30000, maxWait: 30000 }); if (result.outcome === 'EXPIRED') throw new ConflictException('BOOKING_CONFIRMATION_EXPIRED'); return this.projection.forAdmin(result.booking); }
  private async expireIfDueLocked(tx: Prisma.TransactionClient, booking: any, actor: AuthUser | null, now: Date) { if (!booking.confirmationDueAt || now >= booking.confirmationDueAt) { await this.expireLocked(tx, booking, actor, 'confirmation deadline reached', now); return true; } return false; }
  async expireLocked(tx: Prisma.TransactionClient, booking: any, actor: AuthUser | null, reason: string, now = new Date()) { const hold = await tx.inventoryHold.findFirst({ where: { bookingId: booking.id, status: 'ACTIVE' } }); if (hold) await this.inventory.expireHoldInTransaction(tx, hold.id, actor); const updated = await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.CONFIRMATION_EXPIRED, expiredAt: now, version: { increment: 1 } } }); await this.fulfilment?.voidForTerminalOutcomeInTransaction(tx, booking.id, actor, reason, 'CONFIRMATION_EXPIRED'); await this.addEvent(tx, updated, 'CONFIRMATION_EXPIRED', booking.status, BookingStatus.CONFIRMATION_EXPIRED, actor, reason, actor ? undefined : { actorType: 'SYSTEM' }); await this.audit.write(tx, { actor, tenantId: booking.vendorTenantId, action: 'BOOKING_CONFIRMATION_EXPIRED', entityType: 'Booking', entityId: booking.id, reason }); await this.outbox.enqueue(tx, { tenantId: booking.vendorTenantId, eventType: 'BOOKING_CONFIRMATION_EXPIRED', aggregateType: 'Booking', aggregateId: booking.id, payload: { bookingCode: booking.bookingCode } }); return updated; }
  async adminList(query: BookingListQueryDto) {
    const search = query.q?.trim();
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: any = { ...(query.statusGroup === 'REJECTED' ? { status: { in: [BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED] } } : query.status ? { status: query.status } : {}), ...(query.recordType ? { recordType: query.recordType } : {}), ...(query.bookingMode ? { bookingMode: query.bookingMode } : {}), ...(query.channel ? { channel: query.channel } : {}), ...(query.vendorTenantId ? { vendorTenantId: query.vendorTenantId } : {}), ...(query.agentTenantId ? { agentTenantId: query.agentTenantId } : {}), ...(query.from || query.to ? { serviceDate: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) };
    const additionalFilters: any[] = [];
    if (query.channelType) {
      const legacyChannel = query.channelType === DistributionChannelType.PARTNER_API
        ? 'VOYA_API'
        : query.channelType === DistributionChannelType.INTERNAL_MARKETPLACE
          ? 'VOYA_AGENT'
          : query.channelType === DistributionChannelType.DIRECT ? 'VOYA_WEB' : null;
      additionalFilters.push({ OR: [
        { distributionChannel: { is: { type: query.channelType } } },
        ...(legacyChannel ? [{ distributionChannelId: null, channel: legacyChannel }] : []),
      ] });
    }
    if (search) {
      const publicMatches = await this.prisma.publicIdentifier.findMany({ where: { entityType: PublicEntity.BOOKING, publicCode: { contains: search, mode: 'insensitive' } }, select: { entityId: true } });
      const searchFilter = { OR: [
      { bookingCode: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
      { customerEmail: { contains: search, mode: 'insensitive' } },
      { customerPhone: { contains: search, mode: 'insensitive' } },
      { travellers: { some: { phone: { contains: search, mode: 'insensitive' } } } },
      { vouchers: { some: { voucherCode: { contains: search, mode: 'insensitive' } } } },
      { vendorTenant: { name: { contains: search, mode: 'insensitive' } } },
      { product: { productCode: { contains: search, mode: 'insensitive' } } },
      { product: { currentRevision: { productName: { contains: search, mode: 'insensitive' } } } },
      { productRevision: { productName: { contains: search, mode: 'insensitive' } } },
      ...(publicMatches.length ? [{ id: { in: publicMatches.map((row) => row.entityId) } }] : []),
      ] };
      if (query.channelType) additionalFilters.push(searchFilter);
      else where.OR = searchFilter.OR;
    }
    if (additionalFilters.length) where.AND = [...(where.AND || []), ...additionalFilters];
    const [total, rows] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({ where, include: bookingInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    const [bookingCodes, productCodes, ratePlanCodes, channelCodes] = await Promise.all([
      publicIdentifierMap(this.prisma, PublicEntity.BOOKING, rows.map((row) => row.id)),
      publicIdentifierMap(this.prisma, PublicEntity.PRODUCT, rows.map((row: any) => row.product?.id).filter((value: unknown): value is string => Boolean(value))),
      publicIdentifierMap(this.prisma, PublicEntity.RATE_PLAN, rows.map((row: any) => row.ratePlan?.id).filter((value: unknown): value is string => Boolean(value))),
      publicIdentifierMap(this.prisma, PublicEntity.DISTRIBUTION_CHANNEL, rows.map((row: any) => row.distributionChannelId || row.operationalSnapshot?.channelSnapshot?.id).filter((value: unknown): value is string => Boolean(value))),
    ]);
    rows.forEach((row: any) => {
      row.publicCode = bookingCodes.get(row.id) || null;
      if (row.product) row.product.publicCode = productCodes.get(row.product.id) || null;
      if (row.ratePlan) row.ratePlan.publicCode = ratePlanCodes.get(row.ratePlan.id) || null;
      const channelSnapshot = row.operationalSnapshot?.channelSnapshot;
      const channelId = row.distributionChannelId || channelSnapshot?.id;
      if (channelSnapshot && channelId) row.operationalSnapshot = { ...row.operationalSnapshot, channelSnapshot: { ...channelSnapshot, publicCode: channelCodes.get(channelId) || channelSnapshot.publicCode || null } };
    });
    return {
      items: rows.map((row) => this.projection.forAdmin(row)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async adminDetail(id: string) { const row: any = await this.prisma.booking.findUnique({ where: { id }, include: bookingInclude }); if (!row) throw new NotFoundException('Booking not found'); const [bookingCode, productCode, ratePlanCode] = await Promise.all([publicIdentifierMap(this.prisma, PublicEntity.BOOKING, [row.id]), publicIdentifierMap(this.prisma, PublicEntity.PRODUCT, row.product?.id ? [row.product.id] : []), publicIdentifierMap(this.prisma, PublicEntity.RATE_PLAN, row.ratePlan?.id ? [row.ratePlan.id] : [])]); row.publicCode = bookingCode.get(row.id) || null; if (row.product) row.product.publicCode = productCode.get(row.product.id) || null; if (row.ratePlan) row.ratePlan.publicCode = ratePlanCode.get(row.ratePlan.id) || null; return this.projection.forAdmin(row); }

  async list(user: AuthUser, status?: BookingStatus) { return this.vendorList(user, { status }); }
  async confirm(user: AuthUser, id: string) { const booking = await this.prisma.booking.findFirst({ where: { id, vendorTenantId: requireTenant(user), recordType: BookingRecordType.LEGACY, status: BookingStatus.PENDING } }); if (!booking) throw new ConflictException('Legacy booking cannot be confirmed'); return this.prisma.booking.update({ where: { id }, data: { status: BookingStatus.CONFIRMED, version: { increment: 1 } } }); }
  async cancel(user: AuthUser, id: string) { const booking = await this.prisma.booking.findFirst({ where: { id, vendorTenantId: requireTenant(user) } }); if (!booking) throw new NotFoundException('Booking not found'); if (booking.recordType === BookingRecordType.CANONICAL) throw new ConflictException('CANCELLATION_ENGINE_NOT_IMPLEMENTED'); return this.prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED, version: { increment: 1 } } }); }
  async voucher(user: AuthUser, id: string) { const tenantId = requireTenant(user); const booking: any = await this.prisma.booking.findFirst({ where: { id, vendorTenantId: tenantId }, include: { product: { select: { productCode: true, currentRevision: { select: { productName: true, address: true } } } }, ratePlan: { select: { name: true, variant: { select: { pickupInput: true } } } } } }); if (!booking) throw new NotFoundException('Booking not found'); if (booking.recordType === BookingRecordType.CANONICAL) throw new ConflictException('FULFILMENT_NOT_IMPLEMENTED'); if (![BookingStatus.CONFIRMED, BookingStatus.COMPLETED].includes(booking.status)) throw new ConflictException('Voucher is available only for confirmed bookings'); const existing = await this.prisma.fileAsset.findFirst({ where: { tenantId, purpose: FilePurpose.BOOKING_VOUCHER, entityId: booking.id, archivedAt: null }, orderBy: { createdAt: 'desc' } }); if (existing) return { voucherCode: `VCH-${booking.bookingCode}`, fileId: existing.id, fileName: existing.originalName, booking }; throw new ConflictException('Legacy voucher generation is unavailable in this build'); }
  private async findAutoFailoverCandidate(tx: Prisma.TransactionClient, booking: any) {
    const selectionRule = booking.operationalSnapshot?.confirmationPolicySnapshot?.selectionRule;
    if (!selectionRule?.autoFailover) return null;
    const product = await tx.product.findUnique({ where: { id: booking.productId }, select: { experienceMasterId: true } });
    if (!product?.experienceMasterId) return null;
    const serviceDate = new Date(booking.serviceDate);
    const plans: any[] = await tx.ratePlan.findMany({
      where: { status: 'ACTIVE', validFrom: { lte: serviceDate }, validTo: { gt: serviceDate }, channelMappings: { some: { status: 'ACTIVE', enabled: true, channel: { code: booking.channel, active: true } } }, variant: { status: 'ACTIVE', archivedAt: null, product: { id: { not: booking.productId }, experienceMasterId: product.experienceMasterId, status: 'LIVE', currentRevision: { status: ProductRevisionStatus.PUBLISHED }, tenant: { kind: TenantKind.VENDOR, vendorProfile: { verificationStatus: 'VERIFIED' } } } }, scheduleMappings: { some: { active: true, scheduleTemplate: { sessions: { some: { serviceDate, status: 'OPEN', archivedAt: null } } } } } },
      include: { travellerRules: true, cancellationRules: true, channelMappings: { include: { channel: true } }, variant: { include: { product: { include: { tenant: { include: { vendorProfile: true } }, currentRevision: { include: { fulfilmentPolicy: true, bookingQuestions: { where: { archivedAt: null }, orderBy: [{ rank: 'asc' }, { code: 'asc' }] } } } } } } }, scheduleMappings: { where: { active: true }, include: { scheduleTemplate: { include: { sessions: { where: { serviceDate, status: 'OPEN', archivedAt: null } } } } } } },
    } as any);
    const travellers = (booking.travellers ?? []).map((traveller: any) => ({ travellerType: traveller.travellerType, quantity: traveller.quantity }));
    const candidates: any[] = [];
    for (const plan of plans) {
      if (plan.variant.product.tenantId === booking.vendorTenantId) continue;
      const channel = plan.channelMappings.find((mapping: any) => mapping.channel.code === booking.channel && mapping.enabled && mapping.channel.active);
      if (!channel) continue;
      for (const mapping of plan.scheduleMappings) for (const session of mapping.scheduleTemplate.sessions) {
        const eligibility = await this.eligibility.evaluate({ agentTenantId: booking.agentTenantId, ratePlanId: plan.id, sessionId: session.id, travellers, units: booking.units, channelCode: booking.channel }, { client: tx });
        if (!eligibility.eligible || !eligibility.capacityConsumption) continue;
        const quote = await this.commercial.evaluateInternal({ ratePlanId: plan.id, serviceDate: new Date(session.serviceDate), activityStartsAt: session.startsAt, slotCode: session.slotTemplate?.slotCode, units: booking.units ?? 1, travellers: normalizeTravellers(travellers as any).normalizedTravellers, agentTenantId: booking.agentTenantId }, tx);
        if (!quote.ready || !quote.bookingMode) continue;
        const originalAmount = Number(booking.amount); const nextAmount = Number(quote.finalAmount);
        const gap = Number.isFinite(originalAmount) && Number.isFinite(nextAmount) ? Math.max(0, nextAmount - originalAmount) : Number.POSITIVE_INFINITY;
        const allowance = selectionRule.absorbPriceGap === '100' ? 100 : selectionRule.absorbPriceGap === 'LOWER_OF_50_OR_5_PERCENT' ? Math.min(50, originalAmount * 0.05) : 0;
        if (gap > allowance) continue;
        const policy = await this.policy.load(tx, plan.id, quote.ratePlanCommercialVersionId); candidates.push({ plan, mapping, session, eligibility, quote, policy, score: nextAmount });
      }
    }
    candidates.sort((left, right) => left.score - right.score || left.plan.id.localeCompare(right.plan.id));
    return candidates[0] ?? null;
  }

  private async applyAutoFailover(tx: Prisma.TransactionClient, booking: any, candidate: any, actor: AuthUser, reason: string, now: Date, failureType: 'VENDOR_REJECTED' | 'VENDOR_API_FAILURE' = 'VENDOR_REJECTED') {
    const { plan, session, eligibility, quote, policy } = candidate;
    const currentHold = await tx.inventoryHold.findFirst({ where: { bookingId: booking.id, status: 'ACTIVE' } }); if (!currentHold) throw new ConflictException('BOOKING_HOLD_MISSING');
    const lockMinutes = Number(booking.operationalSnapshot?.confirmationPolicySnapshot?.selectionRule?.lockMinutes) || 15; const due = quote.bookingMode === BookingMode.INSTANT ? null : new Date(now.getTime() + lockMinutes * 60_000);
    const originalAmount = Number(booking.amount); const nextAmount = Number(quote.finalAmount); const absorbed = Number.isFinite(originalAmount) && Number.isFinite(nextAmount) && nextAmount > originalAmount; const amount = absorbed ? booking.amount : (quote.finalAmount ?? booking.amount);
    const nextStatus = quote.bookingMode === BookingMode.INSTANT ? BookingStatus.CONFIRMED : quote.bookingMode === BookingMode.VENDOR_CONFIRMATION ? BookingStatus.PENDING_VENDOR_CONFIRMATION : BookingStatus.PENDING_MANUAL_REVIEW;
    const hold = await this.inventory.createHoldInTransaction(tx, { sessionId: session.id, quantity: eligibility.capacityConsumption, expiresAt: due ?? new Date(now.getTime() + 60_000), referenceKey: `booking:${booking.id}:failover:${plan.id}`, bookingId: booking.id, reason: 'automatic supplier failover', actor });
    await this.inventory.releaseHoldInTransaction(tx, currentHold.id, reason, actor); if (nextStatus === BookingStatus.CONFIRMED) await this.inventory.convertHoldToConfirmedInTransaction(tx, hold.id, { bookingId: booking.id, referenceKey: `booking:${booking.id}`, actor });
    const updated = await tx.booking.update({ where: { id: booking.id }, data: { vendorTenantId: plan.variant.product.tenantId, productId: plan.variant.product.id, productRevisionId: plan.variant.product.currentRevision.id, variantId: plan.variant.id, ratePlanId: plan.id, sessionId: session.id, distributionChannelId: plan.channelMappings.find((mapping: any) => mapping.channel.code === booking.channel)?.channel.id, bookingMode: quote.bookingMode, serviceDate: session.serviceDate, serviceTimezone: session.scheduleTemplate.timezone, amount, currency: quote.currency ?? plan.currency, capacityConsumption: eligibility.capacityConsumption, status: nextStatus, confirmationDueAt: due, confirmedAt: nextStatus === BookingStatus.CONFIRMED ? now : null, rejectedAt: null, version: { increment: 1 } } });
    const persistedSelectionRule = booking.operationalSnapshot?.confirmationPolicySnapshot?.selectionRule ? { ...booking.operationalSnapshot.confirmationPolicySnapshot.selectionRule, experienceMasterId: plan.variant.product.experienceMasterId, selectedRatePlanId: plan.id } : null;
    if (booking.operationalSnapshot) { await tx.bookingSnapshot.delete({ where: { bookingId: booking.id } }); await this.snapshot.create(tx, { booking: updated, plan, session, agent: booking.agentTenant, user: booking.agentUser ?? { sub: booking.agentUserId, fullName: null, email: null }, policy: policy.policy, policyFingerprint: policy.fingerprint, questions: plan.variant.product.currentRevision.bookingQuestions, bookingAnswers: booking.operationalSnapshot.bookingAnswers ?? {}, pickupDetails: booking.operationalSnapshot.pickupSnapshot?.supplied ?? undefined, cancellationAcknowledgedAt: booking.operationalSnapshot.cancellationAcknowledgedAt, quote: { ...quote, confirmationSlaMinutes: lockMinutes }, selectionRule: persistedSelectionRule, fulfilmentPolicy: plan.variant.product.currentRevision.fulfilmentPolicy }); }
    if (booking.economicsSnapshot) await tx.bookingEconomicsSnapshot.update({ where: { bookingId: booking.id }, data: this.commercial.toBookingSnapshotData(quote) as any });
    if (booking.fulfilment) { await tx.bookingFulfilment.update({ where: { bookingId: booking.id }, data: { mode: plan.variant.product.currentRevision.fulfilmentPolicy?.mode, status: 'AWAITING_CONFIRMATION', generationStatus: 'NOT_REQUESTED', generationToken: null, generationClaimedAt: null, generationLeaseExpiresAt: null, lastGenerationError: null, version: { increment: 1 } } as any }); if (nextStatus === BookingStatus.CONFIRMED) await this.fulfilment?.confirmInTransaction(tx, updated, actor); } else if (this.fulfilment) await this.fulfilment.initializeInTransaction(tx, updated, { ...plan.variant.product.currentRevision.fulfilmentPolicy, howToRedeem: plan.variant.product.currentRevision.voucherInstructions ? [plan.variant.product.currentRevision.voucherInstructions] : plan.variant.product.currentRevision.howToRedeem }, actor);
    await this.addEvent(tx, updated, 'BOOKING_FAILOVER_SELECTED', booking.status, nextStatus, actor, reason, { fromVendorTenantId: booking.vendorTenantId, toVendorTenantId: updated.vendorTenantId, fromRatePlanId: booking.ratePlanId, toRatePlanId: updated.ratePlanId, absorbedPriceGap: absorbed, allocation: persistedSelectionRule?.allocation ?? 'WINNER_TAKES_ALL', failureType });
    await this.audit.write(tx, { actor, tenantId: updated.vendorTenantId, action: 'BOOKING_AUTO_FAILOVER_SELECTED', entityType: 'Booking', entityId: booking.id, reason, metadata: { fromVendorTenantId: booking.vendorTenantId, toVendorTenantId: updated.vendorTenantId, absorbedPriceGap: absorbed, failureType } }); await this.outbox.enqueue(tx, { tenantId: updated.vendorTenantId, eventType: nextStatus === BookingStatus.CONFIRMED ? 'BOOKING_CONFIRMED_AFTER_FAILOVER' : 'BOOKING_FAILOVER_PENDING_VENDOR', aggregateType: 'Booking', aggregateId: booking.id, payload: { bookingCode: booking.bookingCode, fromVendorTenantId: booking.vendorTenantId, toVendorTenantId: updated.vendorTenantId, reason, failureType } });
    return updated;
  }
}
