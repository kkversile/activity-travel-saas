import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { FilePurpose, FileVisibility, ProductRevisionStatus, ProductStatus, RatePlanStatus, TenantKind, VariantStatus } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { EligibilityService } from '../eligibility/eligibility.service';
import { MarketplaceProductViewDto, MarketplaceSearchDto } from '../eligibility/eligibility.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceRankingService } from './marketplace-ranking.service';
import { DemandObservationService } from '../demand/demand-observation.service';
import { ChannelEligibilityService } from '../distribution/channel-eligibility.service';
import { channelPublishedCapacity } from '../distribution/distribution-math';
import { BuyBoxService } from '../buy-box/buy-box.service';

type SearchOptions = { productId?: string };

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService, private readonly eligibility: EligibilityService, private readonly ranking: MarketplaceRankingService, @Optional() private readonly buyBox: BuyBoxService = null as any, private readonly observations: DemandObservationService = null as any, @Optional() private readonly channelEligibility?: ChannelEligibilityService) {}

  private validatePriceCurrency(dto: MarketplaceSearchDto) {
    if ((dto.priceMin != null || dto.priceMax != null) && !dto.currency) throw new BadRequestException('MARKETPLACE_PRICE_CURRENCY_REQUIRED');
  }

  private async assertApprovedAgent(user: AuthUser) {
    if (user.role !== 'TRAVEL_AGENT' || !user.tenantId) throw new ForbiddenException('An authenticated Travel Agent is required');
    const tenant: any = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, include: { agentProfile: true } });
    if (!tenant || tenant.kind !== TenantKind.TRAVEL_AGENT || tenant.agentProfile?.verificationStatus !== 'APPROVED') throw new ForbiddenException('Travel Agent approval is required for marketplace access');
    return user.tenantId;
  }

  private safeMedia(media: any) {
    if (!media || (media.fileAssetId && (!media.fileAsset || media.fileAsset.visibility !== FileVisibility.PUBLIC || media.fileAsset.purpose !== FilePurpose.PRODUCT_MEDIA))) return null;
    const url = media.externalUrl ?? (media.fileAssetId ? `/api/files/public/${media.fileAssetId}/content` : null);
    return url ? { id: media.id, kind: media.kind, description: media.description, rank: media.rank, url } : null;
  }

  private searchable(plan: any, query?: string) {
    if (!query?.trim()) return true;
    const q = query.trim().toLowerCase(); const revision = plan.variant.product.currentRevision; const fields = [revision.productName, revision.shortDescription, plan.variant.product.productCode, revision.type, revision.subType, revision.subCategory, revision.cityName, revision.stateName, revision.countryName, plan.variant.name, plan.variant.description].filter(Boolean).map((value) => String(value).toLowerCase());
    return fields.some((field) => field.includes(q));
  }

  private safeVariant(variant: any) {
    return { id: variant.id, variantCode: variant.variantCode, name: variant.name, description: variant.description, durationMinutes: variant.durationMinutes, privateShared: variant.privateShared, pickupIncluded: variant.pickupIncluded, pickupType: variant.pickupType, pickupInput: variant.pickupInput, pickupTimings: variant.pickupTimings, dropoffIncluded: variant.dropoffIncluded, dropoffTimings: variant.dropoffTimings, mealIncluded: variant.mealIncluded, mealType: variant.mealType, menu: variant.menu, mealVariety: variant.mealVariety, vehicleType: variant.vehicleType, minPax: variant.minPax, maxPax: variant.maxPax, cutOffMinutes: variant.cutOffMinutes, pointsOfInterest: variant.pointsOfInterest, inclusions: variant.inclusions, exclusions: variant.exclusions, suitableFor: variant.suitableFor };
  }

  private async findEligibleOffers(agentTenantId: string, dto: MarketplaceSearchDto | MarketplaceProductViewDto, options: SearchOptions = {}) {
    const parsedDate = new Date(dto.serviceDate); const serviceDate = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate()));
    const s: any = dto; const revisionWhere: any = { status: ProductRevisionStatus.PUBLISHED }; const variantWhere: any = { status: VariantStatus.ACTIVE, archivedAt: null, revision: { status: ProductRevisionStatus.PUBLISHED } };
    if (!options.productId) this.validatePriceCurrency(dto as MarketplaceSearchDto);
    if (s.durationMin != null && s.durationMax != null && s.durationMin > s.durationMax) throw new BadRequestException('durationMin must be less than or equal to durationMax');
    if (s.priceMin != null && s.priceMax != null && s.priceMin > s.priceMax) throw new BadRequestException('priceMin must be less than or equal to priceMax');
    if (options.productId) revisionWhere.productId = options.productId;
    if ('destination' in s && s.destination) revisionWhere.AND = [{ OR: [{ cityName: { contains: s.destination, mode: 'insensitive' } }, { stateName: { contains: s.destination, mode: 'insensitive' } }, { countryName: { contains: s.destination, mode: 'insensitive' } }] }];
    if ('category' in s && s.category) (revisionWhere.AND ??= []).push({ OR: [{ type: s.category }, { subType: s.category }, { subCategory: s.category }] });
    if ('durationMin' in s && (s.durationMin != null || s.durationMax != null)) variantWhere.durationMinutes = { ...(s.durationMin != null ? { gte: s.durationMin } : {}), ...(s.durationMax != null ? { lte: s.durationMax } : {}) };
    if ('privateShared' in s && s.privateShared) variantWhere.privateShared = { equals: s.privateShared, mode: 'insensitive' };
    if ('pickupIncluded' in s && s.pickupIncluded !== undefined) variantWhere.pickupIncluded = s.pickupIncluded;
    const where = { status: RatePlanStatus.ACTIVE, validFrom: { lte: serviceDate }, validTo: { gt: serviceDate }, channelMappings: { some: { status: 'ACTIVE', enabled: true, channel: { code: 'VOYA_AGENT', active: true } } }, variant: { ...variantWhere, product: { ...(options.productId ? { id: options.productId } : {}), status: ProductStatus.LIVE, currentRevision: revisionWhere, tenant: { kind: TenantKind.VENDOR, vendorProfile: { verificationStatus: 'VERIFIED' } } } }, scheduleMappings: { some: { active: true, scheduleTemplate: { status: 'ACTIVE', effectiveFrom: { lte: serviceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: serviceDate } }], sessions: { some: { serviceDate, status: 'OPEN', archivedAt: null } } } } } };
    const include = { travellerRules: true, channelMappings: { where: { status: 'ACTIVE', enabled: true, channel: { code: 'VOYA_AGENT', active: true } }, include: { channel: true, inventoryRule: true } }, variant: { include: { product: { include: { experienceMaster: { include: { placements: true, buyBox: { include: { offers: { include: { bids: { where: { status: 'ACTIVE' }, orderBy: { submittedAt: 'desc' } } } } } } } }, currentRevision: { include: { media: { where: { archivedAt: null }, include: { fileAsset: { select: { id: true, visibility: true, purpose: true } } }, orderBy: { rank: 'asc' } } } } } } } }, scheduleMappings: { where: { active: true }, include: { scheduleTemplate: { include: { sessions: { where: { serviceDate, status: 'OPEN', archivedAt: null } } } } } } };
    const plans: any[] = []; const pageSize = 100; let cursor: string | undefined;
    do {
      const page: any[] = await this.prisma.ratePlan.findMany({ where, include, orderBy: { id: 'asc' }, take: pageSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) } as any);
      plans.push(...page);
      cursor = page.length === pageSize ? page[page.length - 1]?.id : undefined;
      if (!page.length) break;
    } while (cursor);
    const offers: any[] = []; const eligibleBeforePrice: any[] = []; const eligibilityFailureCounts: Record<string, number> = {}; const soldOutSessionIds = new Set<string>();
    const priceValues = new Map<string, number[]>();
    const countFailure = (code?: string) => { if (code) eligibilityFailureCounts[code] = (eligibilityFailureCounts[code] ?? 0) + 1; };
    for (const plan of plans) {
      if (!this.searchable(plan, 'query' in s ? s.query : undefined)) continue;
      const currentRevision = plan.variant.product.currentRevision;
      if (s.subType && String(currentRevision.subType ?? '').toLowerCase() !== String(s.subType).toLowerCase()) continue;
      if ('childSuitable' in s && s.childSuitable === true && !plan.travellerRules.some((rule: any) => rule.type === 'CHILD' && rule.maxCount >= 1)) continue;
      for (const mapping of plan.scheduleMappings) for (const session of mapping.scheduleTemplate.sessions) {
        const result = await this.eligibility.evaluate({ agentTenantId, ratePlanId: plan.id, sessionId: session.id, travellers: s.travellers as any, units: s.units, channelCode: 'VOYA_AGENT' });
        if (!result.eligible) { for (const gate of (result.gates ?? []).filter((entry) => entry.status === 'FAIL')) { countFailure(gate.code); if (gate.code === 'INSUFFICIENT_INVENTORY') soldOutSessionIds.add(session.id); } continue; }
        let exposedInventory = result.inventory;
        if (this.channelEligibility) {
          const channelResult = await this.channelEligibility.evaluate({ channelCode: 'VOYA_AGENT', productId: plan.variant.product.id, variantId: plan.variant.id, ratePlanId: plan.id, currency: (result.commercial as any)?.currency, units: s.units });
          if (!channelResult.eligible) {
            for (const gate of (channelResult.gates ?? []).filter((entry: any) => entry.status === 'FAIL')) countFailure(gate.code);
            continue;
          }
          const channelMapping = plan.channelMappings?.[0];
          const inventoryRule = channelMapping?.inventoryRule;
          const available = Number((result.inventory as any)?.availableCapacity ?? 0);
          const publishedAvailable = channelPublishedCapacity(available, inventoryRule?.capacityBuffer ?? 0, inventoryRule?.maxPublishedCapacity ?? undefined);
          if (publishedAvailable <= 0) {
            countFailure('INSUFFICIENT_INVENTORY');
            soldOutSessionIds.add(session.id);
            continue;
          }
          exposedInventory = { ...(result.inventory ?? {}), availableCapacity: publishedAvailable, channelExposureMode: inventoryRule?.exposureMode };
        }
        const revision = plan.variant.product.currentRevision; const finalAmount = Number((result.commercial as any)?.finalAmount);
        if ('bookingMode' in s && s.bookingMode && result.bookingMode !== s.bookingMode) continue;
        if ('minRating' in s && s.minRating != null && Number(revision.starRating ?? 0) < s.minRating) continue;
        const media = revision.media.map((item: any) => this.safeMedia(item)).filter(Boolean);
        const item: any = { product: { id: plan.variant.product.id, productCode: plan.variant.product.productCode, name: revision.productName, shortDescription: revision.shortDescription, destination: { city: revision.cityName, state: revision.stateName, country: revision.countryName }, starRating: revision.starRating?.toString() ?? null, coverMedia: media[0] ?? null, experienceMaster: plan.variant.product.experienceMaster ? { id: plan.variant.product.experienceMaster.id, canonicalName: plan.variant.product.experienceMaster.canonicalName, displayMode: plan.variant.product.experienceMaster.displayMode, selectionPolicy: plan.variant.product.experienceMaster.selectionPolicy, placements: plan.variant.product.experienceMaster.placements } : null }, variant: this.safeVariant(plan.variant), offer: { ratePlanId: plan.id, ratePlanCode: plan.ratePlanCode, name: plan.name, sessionId: session.id, serviceDate: session.serviceDate, localStartTime: session.localStartTime, localEndTime: session.localEndTime, timezone: mapping.scheduleTemplate.timezone, startsAt: session.startsAt, bookingMode: result.bookingMode, quoteFingerprint: (result.commercial as any)?.quoteFingerprint ?? null, price: result.commercial ? { currency: (result.commercial as any).currency, finalAmount: (result.commercial as any).finalAmount, tax: (result.commercial as any).tax, promotion: (result.commercial as any).promotion } : null, availability: exposedInventory, evaluatedAt: result.evaluatedAt }, _commissionScore: Number((result.commercial as any)?.voya?.revenue ?? 0) };
        const offerCurrency = String((result.commercial as any)?.currency ?? '').toUpperCase();
        if (Number.isFinite(finalAmount) && offerCurrency) { const values = priceValues.get(offerCurrency) ?? []; values.push(finalAmount); priceValues.set(offerCurrency, values); }
        eligibleBeforePrice.push(item);
      }
    }
    const percentile = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
    const priceSummary = Object.fromEntries([...priceValues.entries()].map(([currency, values]) => [currency, { offerCount: values.length, minimum: Math.min(...values), maximum: Math.max(...values), median: percentile(values) }]));
    const filtered = eligibleBeforePrice.filter((item) => {
      const amount = Number(item.offer.price?.finalAmount); const offerCurrency = String(item.offer.price?.currency ?? '').toUpperCase();
      if ((s.priceMin != null || s.priceMax != null) && offerCurrency !== String(s.currency).toUpperCase()) return false;
      if (s.priceMin != null && (!Number.isFinite(amount) || amount < s.priceMin)) return false;
      if (s.priceMax != null && (!Number.isFinite(amount) || amount > s.priceMax)) return false;
      return true;
    });
    for (const item of filtered) { item._ranking = this.ranking.score(item, s); item.matchReasons = item._ranking.matchReasons; offers.push(item); }
    const requestedCurrency = String(s.currency ?? '').toUpperCase(); const requestedValues = priceValues.get(requestedCurrency) ?? [];
    const priceCeilingMiss = s.priceMax != null && eligibleBeforePrice.length > 0 && filtered.length === 0 && requestedValues.length > 0 && Math.min(...requestedValues) > s.priceMax;
    return { serviceDate: dto.serviceDate, offers, diagnostics: { candidateRatePlanCount: plans.length, candidateSessionCount: plans.reduce((sum, plan) => sum + plan.scheduleMappings.reduce((inner: number, mapping: any) => inner + mapping.scheduleTemplate.sessions.length, 0), 0), eligibleOfferCountBeforePrice: eligibleBeforePrice.length, resultProductCount: new Set(offers.map((item) => item.product.id)).size, resultOfferCount: offers.length, eligibilityFailureCounts, soldOutSessionIds: [...soldOutSessionIds], priceDiagnostics: { byCurrency: priceSummary, priceCeilingMiss } } };
  }

  private collapseLinkedOffers(items: any[]) {
    const groups = new Map<string, any[]>();
    for (const item of items) { const master = item.product.experienceMaster; const key = master?.id ?? item.product.id; const group = groups.get(key) ?? []; group.push(item); groups.set(key, group); }
    const output: any[] = [];
    for (const group of groups.values()) {
      const master = group[0].product.experienceMaster;
      const buyBoxPolicy = this.buyBox?.selectionPolicy(master);
      const showAll = this.buyBox?.shouldShowAll(master) ?? (master?.displayMode === 'ALL_OFFERS');
      const buyBoxSorted = (items: any[]) => [...items].sort((a, b) => { const bidA = this.buyBox?.activeBidAmount(master, a.product.id) ?? -1; const bidB = this.buyBox?.activeBidAmount(master, b.product.id) ?? -1; return bidB - bidA || Number(a.offer.price?.finalAmount ?? Number.POSITIVE_INFINITY) - Number(b.offer.price?.finalAmount ?? Number.POSITIVE_INFINITY); });
      if (!master || showAll) { output.push(...(buyBoxPolicy === 'HIGHEST_BID' ? buyBoxSorted(group) : group)); continue; }
      const placementPriority = (item: any) => master.placements?.find((placement: any) => placement.productId === item.product.id)?.priority ?? 0;
      const selected = [...group].sort((a, b) => {
        if (master.selectionPolicy === 'ADMIN_SELECTED' && placementPriority(a) !== placementPriority(b)) return placementPriority(b) - placementPriority(a);
        if (buyBoxPolicy === 'HIGHEST_BID') { const bidA = this.buyBox?.activeBidAmount(master, a.product.id) ?? -1; const bidB = this.buyBox?.activeBidAmount(master, b.product.id) ?? -1; if (bidA !== bidB) return bidB - bidA; }
        if (master.selectionPolicy === 'HIGHEST_COMMISSION' && a._commissionScore !== b._commissionScore) return b._commissionScore - a._commissionScore;
        if (master.selectionPolicy === 'BALANCED' && a._ranking.score !== b._ranking.score) return b._ranking.score - a._ranking.score;
        return Number(a.offer.price?.finalAmount ?? Number.POSITIVE_INFINITY) - Number(b.offer.price?.finalAmount ?? Number.POSITIVE_INFINITY);
      })[0];
      output.push(selected);
    }
    return output;
  }

  async search(user: AuthUser, dto: MarketplaceSearchDto) {
    const agentTenantId = await this.assertApprovedAgent(user); const result = await this.findEligibleOffers(agentTenantId, dto); const sorted = this.collapseLinkedOffers(this.ranking.sort(result.offers, dto.sort)); const grouped = new Map<string, any>();
    for (const item of sorted) { let product = grouped.get(item.product.id); if (!product) { product = { ...item.product, variants: [] }; delete product.experienceMaster; grouped.set(item.product.id, product); } let variant = product.variants.find((entry: any) => entry.id === item.variant.id); if (!variant) { variant = { ...item.variant, offers: [] }; grouped.get(item.product.id).variants.push(variant); } variant.offers.push({ ...item.offer, matchReasons: item.matchReasons }); }
    const response = { serviceDate: dto.serviceDate, evaluatedAt: new Date().toISOString(), count: grouped.size, products: [...grouped.values()].slice(0, dto.limit ?? 50) };
    if (this.observations) await this.observations.record(user, dto, { ...result.diagnostics, resultProductCount: response.count, resultOfferCount: response.products.reduce((sum, product) => sum + product.variants.reduce((inner: number, variant: any) => inner + variant.offers.length, 0), 0) });
    return response;
  }

  async currencies() {
    const versions = await this.prisma.ratePlanCommercialVersion.findMany({ where: { status: 'ACTIVE' }, distinct: ['currency'], select: { currency: true }, orderBy: { currency: 'asc' } });
    return versions.map((version) => version.currency.toUpperCase());
  }

  async productView(user: AuthUser, productId: string, dto: MarketplaceProductViewDto) {
    const agentTenantId = await this.assertApprovedAgent(user); const result = await this.findEligibleOffers(agentTenantId, dto, { productId });
    if (!result.offers.length) throw new NotFoundException('Product has no eligible marketplace offer for this context');
    const source: any = await this.prisma.product.findFirst({ where: { id: productId, status: ProductStatus.LIVE, currentRevision: { status: ProductRevisionStatus.PUBLISHED } }, include: { currentRevision: { include: { media: { where: { archivedAt: null }, include: { fileAsset: { select: { id: true, visibility: true, purpose: true } } }, orderBy: { rank: 'asc' } }, bookingQuestions: { where: { archivedAt: null }, orderBy: { rank: 'asc' }, select: { label: true, helpText: true, type: true, required: true, appliesPerTraveller: true, options: true } } } } } });
    if (!source?.currentRevision) throw new NotFoundException('Published product not found'); const revision = source.currentRevision; const grouped = new Map<string, any>();
    for (const item of result.offers) { let variant = grouped.get(item.variant.id); if (!variant) { variant = { ...item.variant, offers: [] }; grouped.set(item.variant.id, variant); } variant.offers.push(item.offer); }
    return {
      id: source.id,
      productCode: source.productCode,
      name: revision.productName,
      type: revision.type,
      subType: revision.subType,
      subCategory: revision.subCategory,
      starRating: revision.starRating?.toString() ?? null,
      description: revision.description,
      shortDescription: revision.shortDescription,
      highlights: revision.highlights,
      // Customer-facing content only. Never expose draft revisions, internal labels,
      // supplier source payloads, commission rates, or unpublished media.
      inclusions: [...new Set(result.offers.flatMap((item: any) => item.variant.inclusions ?? []))],
      exclusions: [...new Set(result.offers.flatMap((item: any) => item.variant.exclusions ?? []))],
      terms: revision.terms,
      importantInfo: revision.importantInfo,
      thingsToCarry: revision.thingsToCarry,
      safetyMeasures: revision.safetyMeasures,
      howToRedeem: revision.howToRedeem,
      additionalInfo: revision.additionalInfo,
      faqs: Array.isArray(revision.faqs) ? revision.faqs : [],
      bookingQuestions: revision.bookingQuestions,
      meetingModel: revision.meetingModel,
      meetingPoint: revision.meetingPoint,
      address: revision.address,
      coordinates: revision.lat != null && revision.lon != null
        ? { lat: Number(revision.lat), lon: Number(revision.lon) }
        : null,
      destination: { city: revision.cityName, state: revision.stateName, country: revision.countryName },
      media: revision.media.map((item: any) => this.safeMedia(item)).filter(Boolean),
      variants: [...grouped.values()],
    };
  }
}
