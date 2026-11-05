import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import {
  ExperienceDisplayMode,
  OfferSelectionPolicy,
  Prisma,
  ProductMatchSuggestionStatus,
  ProductStatus,
  TenantKind,
  UserRole,
} from "@prisma/client";
import { AuthUser } from "../common/auth.types";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicEntity, allocatePublicCode, ensurePublicIdentifier, publicIdentifier, publicIdentifierMap } from "../common/public-identifiers";
import { calculatedAvailable } from "../inventory/inventory.types";
import { channelPublishedCapacity } from "../distribution/distribution-math";
import { CommercialService } from "../commercial/commercial.service";
import { DEFAULT_MIN_PLATFORM_MARGIN_PERCENT, DEFAULT_WEBSITE_GATEWAY_FEE_PERCENT, platformNetMarginAmount, platformNetMarginPercent } from "../commercial/commercial-margin";
import { ChannelEligibilityService } from "../distribution/channel-eligibility.service";
import { scoreSelectionOffer, selectionQualitySignals, shouldApplySupplierAllocation } from "./selection-scoring";
import {
  CreateExperienceMasterDto,
  DecideExperienceSuggestionDto,
  ExperiencePreviewQueryDto,
  ExperienceProductSearchDto,
  LinkExperienceProductDto,
  MapMasterOptionDto,
  PinExperienceProductDto,
  UpdateExperienceMasterDto,
  UpdateExperienceSelectionRulesDto,
} from "./experience-matching.dto";

const productInclude = {
  currentRevision: true,
  tenant: {
    select: {
      id: true,
      name: true,
      vendorProfile: {
        select: { displayName: true, legalBusinessName: true, verificationStatus: true },
      },
    },
  },
} as const;

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function fingerprint(revision: any) {
  return createHash("sha256")
    .update(
      [
        revision.productName,
        revision.type,
        revision.cityName,
        revision.stateName,
        revision.countryName,
      ]
        .map(normalize)
        .join("|"),
    )
    .digest("hex");
}

@Injectable()
export class ExperienceMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly commercial: CommercialService = null as any,
    @Optional() private readonly channelEligibility?: ChannelEligibilityService,
  ) {}

  private async ensureMasterOptionsForProduct(tx: any, masterId: string, productId: string) {
    const variants = await tx.productVariant.findMany({
      where: { productId, status: "ACTIVE", archivedAt: null },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    for (const variant of variants) {
      const optionKey = normalize(variant.name).replace(/\s+/g, "-") || variant.id;
      const option = await tx.experienceMasterOption.upsert({
        where: { experienceMasterId_optionKey: { experienceMasterId: masterId, optionKey } },
        create: { experienceMasterId: masterId, optionKey, name: variant.name.trim() || "Option" },
        update: { active: true },
        select: { id: true },
      });
      await tx.experienceMasterOptionPlacement.upsert({
        where: { productVariantId: variant.id },
        create: { masterOptionId: option.id, productVariantId: variant.id },
        update: {},
      });
    }
    const options = await tx.experienceMasterOption.findMany({
      where: { experienceMasterId: masterId },
      select: { id: true, optionKey: true },
      orderBy: [{ optionKey: "asc" }, { id: "asc" }],
    });
    const masterCode = await publicIdentifier(tx, PublicEntity.MASTER_PRODUCT, masterId);
    const masterNumber = masterCode?.match(/^MP-(\d+)$/)?.[1];
    if (!masterNumber) return;
    const prefix = `MO-${masterNumber}-`;
    const identifiers = await tx.publicIdentifier.findMany({
      where: { entityType: PublicEntity.MASTER_OPTION, publicCode: { startsWith: prefix } },
      select: { publicCode: true },
    });
    let next = Math.max(0, ...identifiers.map((row: any) => Number(String(row.publicCode).slice(prefix.length)) || 0)) + 1;
    for (const option of options) {
      if (await publicIdentifier(tx, PublicEntity.MASTER_OPTION, option.id)) continue;
      await ensurePublicIdentifier(tx, PublicEntity.MASTER_OPTION, option.id, `${prefix}${String(next++).padStart(2, "0")}`);
    }
  }

  private async resolveMasterId(idOrCode: string) {
    const identifier = await this.prisma.publicIdentifier?.findUnique?.({
      where: { publicCode: idOrCode },
      select: { entityType: true, entityId: true },
    });
    return identifier?.entityType === PublicEntity.MASTER_PRODUCT ? identifier.entityId : idOrCode;
  }

  private async resolveMasterOption(idOrCode: string) {
    const identifier = await this.prisma.publicIdentifier?.findUnique?.({ where: { publicCode: idOrCode }, select: { entityType: true, entityId: true } });
    const optionId = identifier?.entityType === PublicEntity.MASTER_OPTION ? identifier.entityId : idOrCode;
    return this.prisma.experienceMasterOption.findUnique({ where: { id: optionId }, select: { id: true, experienceMasterId: true } });
  }

  private selectionRulesView(row: any) {
    return {
      ...row,
      liveStatus: row.status,
      status: row.pendingConfiguration ? "PENDING_APPROVAL" : row.status,
      weights: {
        price: row.priceWeight,
        rating: row.ratingWeight,
        reliability: row.reliabilityWeight,
        inventory: row.inventoryWeight,
        contract: row.contractWeight,
      },
    };
  }

  async selectionRules(scope = "GLOBAL") {
    const normalizedScope = String(scope || "GLOBAL")
      .trim()
      .toUpperCase();
    if (
      !["GLOBAL", "VOYA_WEB", "VOYA_AGENT", "VOYA_API"].includes(
        normalizedScope,
      )
    )
      throw new ConflictException("Unsupported selection rule scope");
    const row = await this.prisma.experienceSelectionRuleSet.upsert({
      where: { scope: normalizedScope },
      update: {},
      create: { scope: normalizedScope },
    });
    let publicCode = await publicIdentifier(this.prisma, PublicEntity.SELECTION_RULE_SET, row.id);
    if (!publicCode) {
      await ensurePublicIdentifier(this.prisma, PublicEntity.SELECTION_RULE_SET, row.id, await allocatePublicCode(this.prisma, PublicEntity.SELECTION_RULE_SET, "SRS-", 2));
      publicCode = await publicIdentifier(this.prisma, PublicEntity.SELECTION_RULE_SET, row.id);
    }
    return { ...this.selectionRulesView(row), publicCode };
  }

  async updateSelectionRules(
    actor: AuthUser,
    dto: UpdateExperienceSelectionRulesDto,
  ) {
    if (actor.role === UserRole.ADMIN && !dto.submitForApproval) {
      throw new ConflictException(
        "Normal admins must submit selection-rule changes for approval",
      );
    }
    const scope = String(dto.scope || "GLOBAL").trim().toUpperCase();
    if (!["GLOBAL", "VOYA_WEB", "VOYA_AGENT", "VOYA_API"].includes(scope))
      throw new ConflictException("Unsupported selection rule scope");
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.experienceSelectionRuleSet.upsert({
        where: { scope },
        update: {},
        create: { scope, createdById: actor.sub },
      });
      await tx.$queryRaw`SELECT "id" FROM "ExperienceSelectionRuleSet" WHERE "scope" = ${scope} FOR UPDATE`;
      const current = await tx.experienceSelectionRuleSet.findUnique({ where: { scope } });
      if (!current) throw new NotFoundException("Selection rule set not found");
      if (current.pendingConfiguration) {
        throw new ConflictException("A selection-rule change is already awaiting approval");
      }
      const next = {
        objective: dto.objective ?? current.objective,
        priceWeight: dto.priceWeight ?? current.priceWeight,
        ratingWeight: dto.ratingWeight ?? current.ratingWeight,
        reliabilityWeight: dto.reliabilityWeight ?? current.reliabilityWeight,
        inventoryWeight: dto.inventoryWeight ?? current.inventoryWeight,
        contractWeight: dto.contractWeight ?? current.contractWeight,
        autoFailover: dto.autoFailover ?? current.autoFailover,
        absorbPriceGap: dto.absorbPriceGap ?? current.absorbPriceGap,
        lockMinutes: dto.lockMinutes ?? current.lockMinutes,
        allocation: dto.allocation ?? current.allocation,
      };
      const weightTotal = next.priceWeight + next.ratingWeight + next.reliabilityWeight + next.inventoryWeight + next.contractWeight;
      if (weightTotal !== 100)
        throw new ConflictException(`Selection rule weights must total 100%; received ${weightTotal}%`);
      const updated = dto.submitForApproval
        ? await tx.experienceSelectionRuleSet.update({
            where: { id: current.id },
            data: { pendingConfiguration: next as Prisma.InputJsonValue, pendingUpdatedById: actor.sub, pendingUpdatedAt: new Date() },
          })
        : await tx.experienceSelectionRuleSet.update({
            where: { id: current.id },
            data: { ...next, status: current.status, updatedById: actor.sub },
          });
      if (!(await publicIdentifier(tx, PublicEntity.SELECTION_RULE_SET, updated.id))) {
        await ensurePublicIdentifier(tx, PublicEntity.SELECTION_RULE_SET, updated.id, await allocatePublicCode(tx, PublicEntity.SELECTION_RULE_SET, "SRS-", 2));
      }
      await this.audit.write(tx, {
        actor,
        action: dto.submitForApproval ? "EXPERIENCE_SELECTION_RULES_SUBMITTED" : "EXPERIENCE_SELECTION_RULES_UPDATED",
        entityType: "ExperienceSelectionRuleSet",
        entityId: updated.id,
        beforeState: dto.submitForApproval ? { activeConfiguration: current } : undefined,
        afterState: dto.submitForApproval
          ? { pendingConfiguration: next, submittedById: actor.sub, weightsTotal: weightTotal }
          : { ...next, weightsTotal: weightTotal },
      });
      return updated;
    });
    return { ...this.selectionRulesView(result), publicCode: await publicIdentifier(this.prisma, PublicEntity.SELECTION_RULE_SET, result.id) };
  }

  async approveSelectionRules(actor: AuthUser, scope = "GLOBAL") {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN)
      throw new ConflictException("Only an Admin can approve selection rules");
    const normalizedScope = String(scope || "GLOBAL").trim().toUpperCase();
    const approval = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ExperienceSelectionRuleSet" WHERE "scope" = ${normalizedScope} FOR UPDATE`;
      const current = await tx.experienceSelectionRuleSet.findUnique({ where: { scope: normalizedScope } });
      if (!current) throw new NotFoundException("Selection rule set not found");
      if (!current.pendingConfiguration)
        throw new ConflictException("No selection-rule proposal is awaiting approval");
      if (current.pendingUpdatedById === actor.sub)
        throw new ConflictException("A different Admin must approve this selection-rule change");
      const configuration = current.pendingConfiguration as Record<string, unknown>;
      const liveConfiguration = {
        objective: current.objective,
        priceWeight: current.priceWeight,
        ratingWeight: current.ratingWeight,
        reliabilityWeight: current.reliabilityWeight,
        inventoryWeight: current.inventoryWeight,
        contractWeight: current.contractWeight,
        autoFailover: current.autoFailover,
        absorbPriceGap: current.absorbPriceGap,
        lockMinutes: current.lockMinutes,
        allocation: current.allocation,
      };
      const updated = await tx.experienceSelectionRuleSet.update({
        where: { id: current.id },
        data: {
          ...(configuration as any),
          status: "LIVE",
          updatedById: actor.sub,
          pendingConfiguration: Prisma.DbNull,
          pendingUpdatedById: null,
          pendingUpdatedAt: null,
        },
      });
      return { updated, configuration, liveConfiguration };
    });
    const { updated, configuration, liveConfiguration } = approval;
    await this.audit.write(this.prisma, {
      actor,
      action: "EXPERIENCE_SELECTION_RULES_APPROVED",
      entityType: "ExperienceSelectionRuleSet",
      entityId: updated.id,
      beforeState: { scope: updated.scope, liveConfiguration, pendingConfiguration: configuration },
      afterState: { scope: updated.scope, status: updated.status, liveConfiguration: configuration },
    });
    return {
      ...this.selectionRulesView(updated),
      publicCode: await publicIdentifier(
        this.prisma,
        PublicEntity.SELECTION_RULE_SET,
        updated.id,
      ),
    };
  }

  async preview(id: string, query: ExperiencePreviewQueryDto) {
    const requestedIdentifier = await this.prisma.publicIdentifier?.findUnique?.({ where: { publicCode: id }, select: { entityType: true, entityId: true } });
    const requestedOption = requestedIdentifier?.entityType === PublicEntity.MASTER_OPTION
      ? await this.prisma.experienceMasterOption.findUnique({ where: { id: requestedIdentifier.entityId }, select: { id: true, experienceMasterId: true } })
      : null;
    const masterId = requestedOption?.experienceMasterId || await this.resolveMasterId(id);
    const serviceDate = query.serviceDate
      ? new Date(`${query.serviceDate}T00:00:00.000Z`)
      : new Date();
    const channelCode =
      (
        { WEB: "VOYA_WEB", AGENT: "VOYA_AGENT", API: "VOYA_API" } as Record<
          string,
          string
        >
      )[query.channel || "WEB"] || "VOYA_WEB";
    if (query.agentTenantId) {
      const agent = await this.prisma.tenant.findUnique({ where: { id: query.agentTenantId }, include: { agentProfile: true } });
      if (agent?.kind !== TenantKind.TRAVEL_AGENT || agent.agentProfile?.verificationStatus !== "APPROVED")
        throw new ConflictException("Preview agent must be an approved travel agent");
    }
    const marginConfiguration = await this.prisma.commercialGuardrailConfiguration?.findUnique?.({ where: { id: "default" } });
    const minimumMarginPercent = Number(marginConfiguration?.minimumNetMarginPercent ?? DEFAULT_MIN_PLATFORM_MARGIN_PERCENT);
    const websiteGatewayFeePercent = Number(marginConfiguration?.websiteGatewayFeePercent ?? DEFAULT_WEBSITE_GATEWAY_FEE_PERCENT);
    const master: any = await this.prisma.experienceMaster.findUnique({
      where: { id: masterId },
      include: {
        placements: true,
        products: {
          where: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
          include: {
            currentRevision: true,
            tenant: {
              select: {
                id: true,
                name: true,
                vendorProfile: {
                  select: { displayName: true, legalBusinessName: true, verificationStatus: true },
                },
              },
            },
            variants: {
              where: { status: "ACTIVE", archivedAt: null },
              include: {
                masterOptionPlacement: { include: { masterOption: true } },
                ratePlans: {
                  where: {
                    status: "ACTIVE",
                    validFrom: { lte: serviceDate },
                    validTo: { gt: serviceDate },
                  },
                  include: {
                    channelMappings: {
                      where: { status: "ACTIVE", enabled: true },
                      include: { channel: true, inventoryRule: true },
                    },
                    commercialVersions: {
                      where: {
                        status: "ACTIVE",
                        effectiveFrom: { lte: serviceDate },
                        OR: [
                          { effectiveTo: null },
                          { effectiveTo: { gt: serviceDate } },
                        ],
                      },
                      orderBy: { versionNumber: "desc" },
                      take: 1,
                      include: { travellerPrices: true },
                    },
                    scheduleMappings: {
                      where: { active: true },
                      include: {
                        scheduleTemplate: {
                          include: {
                            sessions: {
                              where: { serviceDate, status: "OPEN", archivedAt: null },
                              include: { inventoryState: true },
                            },
                          },
                        },
                      },
                    },
                  },
                  orderBy: { updatedAt: "desc" },
                },
              },
              orderBy: { updatedAt: "desc" },
            },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!master) throw new NotFoundException("Experience master not found");
    const rules: any = await this.prisma.experienceSelectionRuleSet.findFirst({
      where: { scope: { in: [channelCode, "GLOBAL"] }, status: "LIVE" },
      orderBy: { scope: "desc" },
    });
    const [productPublicCodes, ratePlanPublicCodes, masterPublicCode] = await Promise.all([
      publicIdentifierMap(this.prisma, PublicEntity.PRODUCT, master.products.map((product: any) => product.id)),
      publicIdentifierMap(this.prisma, PublicEntity.RATE_PLAN, master.products.flatMap((product: any) => product.variants.flatMap((variant: any) => variant.ratePlans.map((plan: any) => plan.id)))),
      publicIdentifier(this.prisma, PublicEntity.MASTER_PRODUCT, master.id),
    ]);
    const placementPriority = (productId: string) => Number(master.placements?.find((placement: any) => placement.productId === productId)?.priority ?? 0);
    const maxPlacementPriority = Math.max(0, ...master.products.map((product: any) => placementPriority(product.id)));
    const rawOffers = await Promise.all(master.products.flatMap((product: any) =>
      product.variants.flatMap((variant: any) =>
        variant.ratePlans.map(async (plan: any) => {
          const masterOption = variant.masterOptionPlacement?.masterOption;
          if (requestedOption && masterOption?.id !== requestedOption.id) return null;
          const commercial = plan.commercialVersions?.[0];
          const adultPrice =
            commercial?.travellerPrices?.find(
              (price: any) => price.travellerType === "ADULT",
            ) || commercial?.travellerPrices?.[0];
          const selectedChannelMapping = plan.channelMappings?.find(
            (mapping: any) => mapping.channel?.code === channelCode && mapping.channel?.active,
          );
          const channelAvailable = Boolean(selectedChannelMapping);
          const sessions = (plan.scheduleMappings ?? []).flatMap((mapping: any) => {
            const schedule = mapping.scheduleTemplate;
            if (!schedule || schedule.status !== "ACTIVE" || schedule.effectiveFrom > serviceDate || (schedule.effectiveTo && schedule.effectiveTo <= serviceDate)) return [];
            return (schedule.sessions ?? []).map((session: any) => ({
              sessionId: session.id,
              availableCapacity: session.inventoryState
                ? calculatedAvailable(Number(session.inventoryState.totalCapacity ?? 0), Number(session.inventoryState.blockedCapacity ?? 0), Number(session.inventoryState.heldCapacity ?? 0), Number(session.inventoryState.confirmedCapacity ?? 0), session.status)
                : 0,
              inventoryReady: !schedule.capacityUnitReviewRequired,
            }));
          });
          const channelRule = selectedChannelMapping?.inventoryRule;
          const availableSession = sessions.map((session: any) => ({
            ...session,
            publishedCapacity: channelPublishedCapacity(session.availableCapacity, Number(channelRule?.capacityBuffer ?? 0), channelRule?.maxPublishedCapacity == null ? null : Number(channelRule.maxPublishedCapacity)),
          })).filter((session: any) => session.inventoryReady && session.publishedCapacity > 0).sort((a: any, b: any) => b.publishedCapacity - a.publishedCapacity)[0] ?? null;
          const productPublished = product.status === ProductStatus.LIVE && product.currentRevision?.status === "PUBLISHED";
          const vendorVerified = product.tenant.vendorProfile?.verificationStatus === "VERIFIED";
          const sourcePrice = Number(adultPrice?.amount ?? plan.basePrice ?? 0);
          const quote = this.commercial && availableSession && channelAvailable && productPublished && vendorVerified
            ? await this.commercial.evaluateInternal({
                ratePlanId: plan.id,
                serviceDate,
                activityStartsAt: availableSession.startsAt,
                units: 1,
                travellers: [{ travellerType: "ADULT", quantity: 1 }],
                agentTenantId: query.agentTenantId,
                channel: channelCode,
                agentFacingRequired: Boolean(query.agentTenantId),
              })
            : null;
          const quoteReady = Boolean(quote?.ready);
          const price = quoteReady ? Number(quote?.finalAmount) : sourcePrice;
          const marginInput = quote ? {
            finalAmount: quote.finalAmount,
            voyaRevenue: quote.voya?.revenue,
            agentCommission: quote.agent?.commission,
            voyaPromotionFunding: quote.promotionFundingBreakdown?.VOYA,
            channelCode,
          } : null;
          const netMarginAmount = marginInput ? platformNetMarginAmount(marginInput, websiteGatewayFeePercent) : null;
          const netMarginPercent = marginInput ? platformNetMarginPercent(marginInput, websiteGatewayFeePercent) : null;
          const marginFloorStatus = channelCode === "VOYA_AGENT" && !query.agentTenantId
            ? "UNVERIFIED"
            : !quoteReady || netMarginPercent == null
              ? "UNVERIFIED"
              : netMarginPercent >= minimumMarginPercent ? "PASS" : "FAIL";
          const channelGate = this.channelEligibility && availableSession && channelAvailable
            ? await this.channelEligibility.evaluate({
                channelCode,
                productId: product.id,
                variantId: variant.id,
                ratePlanId: plan.id,
                currency: quote?.currency || commercial?.currency || plan.currency,
                units: 1,
              })
            : null;
          return {
            productId: product.id,
            productVariantId: variant.id,
            productCode: product.productCode,
            publicCode: productPublicCodes.get(product.id) || null,
            vendor:
              product.tenant.vendorProfile?.displayName ||
              product.tenant.vendorProfile?.legalBusinessName ||
              product.tenant.name,
            vendorId: product.tenant.id,
            offerName: plan.name,
            ratePlanCode: plan.ratePlanCode,
            ratePlanPublicCode: ratePlanPublicCodes.get(plan.id) || null,
            price,
            currency: quote?.currency || commercial?.currency || plan.currency,
            rating: null,
            ratingAvailable: false,
            reliability: null,
            reliabilityAvailable: false,
            connectionType: product.currentRevision.voucherCodeSource ?? null,
            bookingMode: commercial?.bookingMode || null,
            channelAvailable,
            channelEligible: channelGate?.eligible ?? channelAvailable,
            channelEligibilityReasonCodes: channelGate?.reasonCodes ?? [],
            marginPercent: netMarginPercent ?? 0,
            netMarginAmount,
            marginFloorStatus,
            commercialReady: quoteReady,
            contractPriority: placementPriority(product.id),
            availableCapacity: availableSession?.publishedCapacity ?? 0,
            sessionId: availableSession?.sessionId ?? null,
            productPublished,
            vendorVerified,
            variantName: variant.name,
            masterOptionId: masterOption?.id ?? null,
            masterOptionCode: masterOption ? await publicIdentifier(this.prisma, PublicEntity.MASTER_OPTION, masterOption.id) : null,
            masterOptionName: masterOption?.name ?? null,
            status: product.status,
          };
        }),
      ),
    ));
    const candidateOffers = rawOffers.filter(Boolean);
    const qualityRows = this.prisma.supplierQualitySnapshot?.findFirst
      ? await Promise.all([...new Set(candidateOffers.map((offer: any) => offer.vendorId))].map((vendorTenantId) =>
          this.prisma.supplierQualitySnapshot.findFirst({
            where: { vendorTenantId },
            orderBy: { generatedAt: "desc" },
            include: { metricSnapshots: true },
          }),
        ))
      : [];
    const qualityByVendor = new Map<string, any>();
    for (const snapshot of qualityRows) if (snapshot) qualityByVendor.set(snapshot.vendorTenantId, snapshot);
    for (const offer of candidateOffers) {
      const quality = selectionQualitySignals(qualityByVendor.get(offer.vendorId)?.metricSnapshots ?? []);
      offer.rating = quality.rating;
      offer.ratingAvailable = quality.rating !== null;
      offer.reliability = quality.reliability;
      offer.reliabilityAvailable = quality.reliability !== null;
    }
    const candidateOffer = (offer: any) => offer.channelAvailable && offer.channelEligible && offer.price > 0 && offer.productPublished && offer.vendorVerified && offer.availableCapacity > 0 && offer.commercialReady;
    const eligibleOffer = (offer: any) => candidateOffer(offer) && offer.marginFloorStatus === "PASS";
    const provisionalOffer = (offer: any) => candidateOffer(offer) && offer.marginFloorStatus === "UNVERIFIED";
    const prices = candidateOffers
      .filter((offer: any) => eligibleOffer(offer) || provisionalOffer(offer))
      .map((offer: any) => offer.price);
    const minimumPrice = prices.length ? Math.min(...prices) : 0;
    const maximumMargin = Math.max(0, ...candidateOffers.filter((offer: any) => eligibleOffer(offer) || provisionalOffer(offer)).map((offer: any) => Number(offer.netMarginAmount ?? 0)));
    const weightedOffers = candidateOffers
      .map((offer: any) => {
        const score = rules ? scoreSelectionOffer({
          price: offer.price,
          minimumPrice,
          margin: Number(offer.netMarginAmount ?? 0),
          maximumMargin,
          rating: offer.rating,
          reliability: offer.reliability,
          connectionType: offer.connectionType,
          contractPriority: offer.contractPriority,
          maximumContractPriority: maxPlacementPriority,
        }, rules) : (offer.price > 0 && minimumPrice > 0 ? minimumPrice / offer.price * 100 : 0);
        return {
          ...offer,
          score,
          eligible: eligibleOffer(offer),
          provisionalEligible: provisionalOffer(offer),
        };
      })
      .sort((a: any, b: any) => b.score - a.score || a.price - b.price);
    const eligible = weightedOffers.filter((offer: any) => offer.eligible);
    const provisional = !this.commercial || (channelCode === "VOYA_AGENT" && !query.agentTenantId);
    const automaticWinner = eligible[0] || (provisional ? weightedOffers.find((offer: any) => offer.provisionalEligible) : null) || null;
    const activeOptionPin: any = requestedOption ? await this.prisma.experienceMasterOptionPlacement.findFirst({
      where: { masterOptionId: requestedOption.id, pinnedById: { not: null }, OR: [{ pinnedUntil: null }, { pinnedUntil: { gt: new Date() } }] },
      include: { productVariant: { select: { id: true, productId: true } } },
    }) : null;
    const activeProductPin = !requestedOption ? (master.placements ?? []).find((placement: any) => placement.pinnedById && (!placement.pinnedUntil || placement.pinnedUntil > new Date())) : null;
    const activePin = activeOptionPin ? { productId: activeOptionPin.productVariant.productId, productVariantId: activeOptionPin.productVariantId, pinnedUntil: activeOptionPin.pinnedUntil, pinReason: activeOptionPin.pinReason } : activeProductPin;
    const pinnedWinner = activePin ? (eligible.find((offer: any) => requestedOption ? offer.productVariantId === activePin.productVariantId : offer.productId === activePin.productId) || (provisional ? weightedOffers.find((offer: any) => (requestedOption ? offer.productVariantId === activePin.productVariantId : offer.productId === activePin.productId) && offer.provisionalEligible) : null)) : null;
    let winner = pinnedWinner || automaticWinner;
    const pinApplied = Boolean(pinnedWinner);
    let allocationApplied = false;
    if (winner && !pinApplied && !provisional && rules && shouldApplySupplierAllocation(rules.allocation, eligible.map((offer: any) => offer.score))) {
      const productIds = [...new Set([...master.products.map((product: any) => product.id), ...(master.placements ?? []).map((placement: any) => placement.productId)])];
      const bookingCounts = await this.prisma.booking.groupBy({
        by: ["vendorTenantId"],
        where: { recordType: "CANONICAL", productId: { in: productIds } },
        _count: { _all: true },
      });
      const allocations = new Map<string, number>(bookingCounts.map((row: any) => [row.vendorTenantId, Number(row._count?._all ?? 0)]));
      const suppliers = [...new Set<string>(eligible.map((offer: any) => String(offer.vendorId)))].sort((left, right) => placementPriority(right) - placementPriority(left) || left.localeCompare(right));
      let selectedSupplier: string | undefined;
      if (rules.allocation === "ROUND_ROBIN" && suppliers.length) {
        selectedSupplier = suppliers.reduce((best: string, supplier: string) => (allocations.get(supplier) ?? 0) < (allocations.get(best) ?? 0) ? supplier : best, suppliers[0]);
      } else if (rules.allocation === "SPLIT_70_30" && suppliers.length > 1) {
        const totalAssigned = bookingCounts.reduce((sum: number, row: any) => sum + Number(row._count?._all ?? 0), 0);
        const slot = totalAssigned % 10;
        if (slot >= 7) selectedSupplier = suppliers.slice(1)[(slot - 7) % (suppliers.length - 1)];
      }
      if (selectedSupplier) {
        winner = eligible.find((offer: any) => offer.vendorId === selectedSupplier) ?? winner;
        allocationApplied = winner.vendorId === selectedSupplier;
      }
    }
    return {
      master: {
        id: master.id,
        publicCode: masterPublicCode,
        canonicalName: master.canonicalName,
        selectionPolicy: master.selectionPolicy,
      },
      serviceDate: serviceDate.toISOString().slice(0, 10),
      channel: query.channel || "WEB",
      channelCode,
      rulesStatus: rules?.status || "DEFAULT",
      provisional,
      masterOption: requestedOption ? { id: requestedOption.id, publicCode: await publicIdentifier(this.prisma, PublicEntity.MASTER_OPTION, requestedOption.id) } : null,
      pin: activePin ? { productId: activePin.productId, productVariantId: activePin.productVariantId ?? null, pinnedUntil: activePin.pinnedUntil, reason: activePin.pinReason, applied: pinApplied, unavailable: !pinnedWinner } : null,
      marginFloorPercent: minimumMarginPercent,
      allocationApplied,
      offers: weightedOffers.map((offer: any) => ({
        ...offer,
        selected:
          winner?.productId === offer.productId &&
          winner?.ratePlanCode === offer.ratePlanCode,
      })),
      winnerProductId: winner?.productId || null,
      winnerRatePlanCode: winner?.ratePlanCode || null,
    };
  }

  private async product(id: string) {
    const value: any = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, tenant: { kind: TenantKind.VENDOR } },
      include: productInclude,
    });
    if (!value?.currentRevision)
      throw new NotFoundException(
        "Vendor product with a current revision not found",
      );
    return value;
  }

  private async refreshSuggestions() {
    const products: any[] = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: { not: ProductStatus.ARCHIVED },
        tenant: { kind: TenantKind.VENDOR },
      },
      include: productInclude,
      orderBy: { id: "asc" },
    });
    const groups = new Map<string, any[]>();
    for (const item of products) {
      if (!item.currentRevision) continue;
      const key = fingerprint(item.currentRevision);
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      for (let left = 0; left < group.length; left += 1)
        for (let right = left + 1; right < group.length; right += 1) {
          if (group[left].tenantId === group[right].tenantId) continue;
          await this.prisma.productMatchSuggestion.upsert({
            where: {
              sourceProductId_candidateProductId: {
                sourceProductId: group[left].id,
                candidateProductId: group[right].id,
              },
            },
            update: { fingerprint: key },
            create: {
              sourceProductId: group[left].id,
              candidateProductId: group[right].id,
              fingerprint: key,
              confidence: 100,
            },
          });
        }
    }
  }

  async products(query: ExperienceProductSearchDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const term = query.search?.trim();
    const where: any = {
      deletedAt: null,
      tenant: { kind: TenantKind.VENDOR },
      ...(query.vendorId ? { tenantId: query.vendorId } : {}),
    };
    if (term)
      where.OR = [
        { productCode: { contains: term, mode: "insensitive" } },
        {
          currentRevision: {
            productName: { contains: term, mode: "insensitive" },
          },
        },
        { tenant: { name: { contains: term, mode: "insensitive" } } },
        {
          tenant: {
            vendorProfile: {
              displayName: { contains: term, mode: "insensitive" },
            },
          },
        },
        {
          tenant: {
            vendorProfile: {
              legalBusinessName: { contains: term, mode: "insensitive" },
            },
          },
        },
      ];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows
        .filter((row: any) => row.currentRevision)
        .map((row: any) => this.productSummary(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private productSummary(row: any) {
    const r = row.currentRevision;
    return {
      id: row.id,
      productCode: row.productCode,
      name: r?.productName || row.productCode,
      type: r?.type,
      subType: r?.subType,
      cityName: r?.cityName || null,
      stateName: r?.stateName || null,
      countryName: r?.countryName || null,
      destination: [r?.cityName, r?.stateName, r?.countryName]
        .filter(Boolean)
        .join(", "),
      vendor: {
        id: row.tenant.id,
        name: row.tenant.vendorProfile?.displayName || row.tenant.vendorProfile?.legalBusinessName || row.tenant.name,
      },
      status: row.status,
      experienceMasterId: row.experienceMasterId || null,
    };
  }

  async suggestions() {
    await this.refreshSuggestions();
    const rows: any[] = await this.prisma.productMatchSuggestion.findMany({
      where: { status: ProductMatchSuggestionStatus.PENDING },
      include: {
        sourceProduct: { include: productInclude },
        candidateProduct: { include: productInclude },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      confidence: row.confidence,
      fingerprint: row.fingerprint,
      source: this.productSummary(row.sourceProduct),
      candidate: this.productSummary(row.candidateProduct),
    }));
  }

  async masters() {
    const rows: any[] = await this.prisma.experienceMaster.findMany({
      include: {
        products: { include: productInclude, orderBy: { updatedAt: "desc" } },
        placements: true,
        options: {
          where: { active: true },
          include: { placements: { include: { productVariant: { select: { id: true, name: true, productId: true } } } } },
          orderBy: [{ optionKey: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return Promise.all(rows.map(async (master) => {
      const optionCodes = await publicIdentifierMap(this.prisma, PublicEntity.MASTER_OPTION, master.options.map((option: any) => option.id));
      return {
        ...master,
        options: master.options.map((option: any) => ({ ...option, publicCode: optionCodes.get(option.id) || null })),
        products: master.products.map((item: any) => this.productSummary(item)),
      };
    }));
  }

  async pinProduct(actor: AuthUser, masterId: string, dto: PinExperienceProductDto) {
    const option = await this.resolveMasterOption(masterId);
    masterId = option?.experienceMasterId || await this.resolveMasterId(masterId);
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE', masterId);
      const master = await tx.experienceMaster.findUnique({ where: { id: masterId }, select: { id: true } });
      if (!master) throw new NotFoundException('Experience master not found');
      const product = await tx.product.findFirst({ where: { id: dto.productId, experienceMasterId: masterId }, select: { id: true } });
      if (!product) throw new NotFoundException('Product is not linked to this experience master');
      if (option) {
        if (!dto.productVariantId) throw new ConflictException('A productVariantId is required when pinning a master option');
        const variant = await tx.productVariant.findFirst({ where: { id: dto.productVariantId, productId: dto.productId, masterOptionPlacement: { is: { masterOptionId: option.id } } }, select: { id: true } });
        if (!variant) throw new NotFoundException('Product option is not mapped to this master option');
        if (dto.pinnedUntil && new Date(dto.pinnedUntil) <= now) throw new ConflictException('Pin expiry must be in the future');
        if (!dto.pinned) {
          await tx.experienceMasterOptionPlacement.update({ where: { productVariantId: variant.id }, data: { pinnedUntil: null, pinnedById: null, pinReason: null } });
          return { productId: dto.productId, productVariantId: variant.id, masterOptionId: option.id, pinned: false, pinnedUntil: null, reason: null };
        }
        await tx.experienceMasterOptionPlacement.updateMany({ where: { masterOptionId: option.id, productVariantId: { not: variant.id } }, data: { pinnedUntil: null, pinnedById: null, pinReason: null } });
        const placement = await tx.experienceMasterOptionPlacement.update({ where: { productVariantId: variant.id }, data: { pinnedUntil: dto.pinnedUntil ? new Date(dto.pinnedUntil) : null, pinnedById: actor.sub, pinReason: dto.reason?.trim() || null } });
        return { productId: dto.productId, productVariantId: placement.productVariantId, masterOptionId: option.id, pinned: true, pinnedUntil: placement.pinnedUntil, reason: placement.pinReason };
      }
      if (dto.pinnedUntil && new Date(dto.pinnedUntil) <= now) throw new ConflictException('Pin expiry must be in the future');
      if (!dto.pinned) {
        await tx.experienceOfferPlacement.updateMany({ where: { experienceMasterId: masterId, productId: dto.productId }, data: { pinnedUntil: null, pinnedById: null, pinReason: null } });
        return { productId: dto.productId, pinned: false, pinnedUntil: null, reason: null };
      }
      await tx.experienceOfferPlacement.updateMany({ where: { experienceMasterId: masterId, productId: { not: dto.productId } }, data: { pinnedUntil: null, pinnedById: null, pinReason: null } });
      const placement = await tx.experienceOfferPlacement.upsert({
        where: { experienceMasterId_productId: { experienceMasterId: masterId, productId: dto.productId } },
        create: { experienceMasterId: masterId, productId: dto.productId, pinnedUntil: dto.pinnedUntil ? new Date(dto.pinnedUntil) : null, pinnedById: actor.sub, pinReason: dto.reason?.trim() || null },
        update: { pinnedUntil: dto.pinnedUntil ? new Date(dto.pinnedUntil) : null, pinnedById: actor.sub, pinReason: dto.reason?.trim() || null },
      });
      return { productId: placement.productId, pinned: true, pinnedUntil: placement.pinnedUntil, reason: placement.pinReason };
    });
    await this.audit.write(this.prisma, {
      actor,
      action: result.pinned ? 'EXPERIENCE_PRODUCT_PINNED' : 'EXPERIENCE_PRODUCT_UNPINNED',
      entityType: 'ExperienceMaster',
      entityId: masterId,
      afterState: result,
    });
    return result;
  }

  async mapMasterOption(actor: AuthUser, sourceOptionCode: string, dto: MapMasterOptionDto) {
    const sourceOption = await this.resolveMasterOption(sourceOptionCode);
    const targetOption = await this.resolveMasterOption(dto.targetMasterOptionId);
    if (!sourceOption || !targetOption || sourceOption.experienceMasterId !== targetOption.experienceMasterId)
      throw new NotFoundException('Master option was not found in this experience');
    const result = await this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE', sourceOption.experienceMasterId);
      const placement = await tx.experienceMasterOptionPlacement.findUnique({
        where: { productVariantId: dto.productVariantId },
        include: { productVariant: { select: { id: true, productId: true } } },
      });
      if (!placement || placement.masterOptionId !== sourceOption.id)
        throw new NotFoundException('Supplier option is not mapped to the source master option');
      const product = await tx.product.findFirst({ where: { id: placement.productVariant.productId, experienceMasterId: sourceOption.experienceMasterId }, select: { id: true } });
      if (!product) throw new ConflictException('Supplier product is no longer linked to this experience');
      const updated = await tx.experienceMasterOptionPlacement.update({ where: { productVariantId: dto.productVariantId }, data: { masterOptionId: targetOption.id, pinnedUntil: null, pinnedById: null, pinReason: null } });
      await tx.experienceMasterOption.updateMany({ where: { id: sourceOption.id, placements: { none: {} } }, data: { active: false } });
      await tx.experienceMasterOption.update({ where: { id: targetOption.id }, data: { active: true } });
      await this.audit.write(tx, { actor, action: 'EXPERIENCE_MASTER_OPTION_MAPPED', entityType: 'ExperienceMasterOption', entityId: targetOption.id, beforeState: { sourceMasterOptionId: sourceOption.id, productVariantId: dto.productVariantId }, afterState: { targetMasterOptionId: targetOption.id, productVariantId: dto.productVariantId } });
      return updated;
    });
    return { ...result, sourceMasterOptionId: sourceOption.id, targetMasterOptionId: targetOption.id };
  }

  async insights() {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const masters: any[] = await this.prisma.experienceMaster.findMany({
      include: {
        products: {
          select: {
            id: true,
            tenantId: true,
            tenant: {
              select: {
                id: true,
                name: true,
                vendorProfile: { select: { displayName: true, legalBusinessName: true } },
              },
            },
          },
        },
      },
    });
    const productIds = masters.flatMap((master) =>
      master.products.map((product: any) => product.id),
    );
    if (!productIds.length) return [];
    const [bookings, events] = await Promise.all([
      this.prisma.booking.findMany({
        where: { productId: { in: productIds }, createdAt: { gte: from } },
        select: { productId: true, vendorTenantId: true, status: true },
      }),
      this.prisma.bookingEvent.findMany({
        where: {
          createdAt: { gte: from },
          booking: { productId: { in: productIds } },
        },
        select: {
          eventType: true,
          reason: true,
          metadata: true,
          booking: { select: { productId: true, vendorTenantId: true } },
        },
      }),
    ]);
    const vendorMap = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        mappedOffers: number;
        won: number;
        declines: number;
        failovers: number;
        reasons: string[];
      }
    >();
    for (const master of masters)
      for (const product of master.products) {
        const vendorId = product.tenantId;
        const vendorName =
          product.tenant.vendorProfile?.displayName ||
          product.tenant.vendorProfile?.legalBusinessName ||
          product.tenant.name;
        const current = vendorMap.get(vendorId) || {
          vendorId,
          vendorName,
          mappedOffers: 0,
          won: 0,
          declines: 0,
          failovers: 0,
          reasons: [],
        };
        current.mappedOffers += 1;
        vendorMap.set(vendorId, current);
      }
    const mappedProductIds = new Set(productIds);
    for (const booking of bookings) {
      const current = vendorMap.get(booking.vendorTenantId);
      if (current && mappedProductIds.has(booking.productId)) current.won += 1;
    }
    for (const event of events) {
      const current = vendorMap.get(event.booking.vendorTenantId);
      if (!current) continue;
      if (
        event.eventType === "VENDOR_REJECTED" ||
        event.eventType === "VENDOR_DECLINED"
      ) {
        current.declines += 1;
        if (event.reason?.trim()) current.reasons.push(event.reason.trim());
      }
      if (
        event.eventType.toUpperCase().includes("FAILOVER") ||
        (event.metadata &&
          JSON.stringify(event.metadata).toUpperCase().includes("FAILOVER"))
      )
        current.failovers += 1;
    }
    const totalWon = bookings.length;
    return Array.from(vendorMap.values())
      .map((vendor) => ({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        mappedOffers: vendor.mappedOffers,
        bookings30d: vendor.won,
        winRate: totalWon ? Math.round((vendor.won / totalWon) * 100) : null,
        mainReasonWhenLosing:
          vendor.reasons[0] ||
          (vendor.won === 0 && totalWon > 0
            ? "Price, availability or confirmation"
            : "No recorded loss reason"),
        failoversHandled: vendor.failovers,
        declines30d: vendor.declines,
      }))
      .sort(
        (a, b) =>
          b.mappedOffers - a.mappedOffers ||
          (b.winRate ?? -1) - (a.winRate ?? -1),
      );
  }

  async createMaster(actor: AuthUser, dto: CreateExperienceMasterDto) {
    const source: any = await this.product(dto.productId);
    const master: any = await this.prisma.$transaction(async (tx) => {
      const created = await tx.experienceMaster.create({
        data: {
          id: randomUUID(),
          canonicalName: dto.canonicalName.trim(),
          type: source.currentRevision.type,
          subType: source.currentRevision.subType || null,
          cityName: source.currentRevision.cityName,
          stateName: source.currentRevision.stateName,
          countryName: source.currentRevision.countryName,
          displayMode: dto.displayMode ?? ExperienceDisplayMode.SINGLE_OFFER,
          selectionPolicy: dto.selectionPolicy ?? OfferSelectionPolicy.CHEAPEST,
          createdById: actor.sub,
          updatedById: actor.sub,
        },
      });
      await ensurePublicIdentifier(tx, PublicEntity.MASTER_PRODUCT, created.id, await allocatePublicCode(tx, PublicEntity.MASTER_PRODUCT, "MP-", 4));
      await tx.product.update({
        where: { id: source.id },
        data: { experienceMasterId: created.id },
      });
      await tx.experienceOfferPlacement.create({
        data: {
          experienceMasterId: created.id,
          productId: source.id,
          placementType: "PREFERRED",
          priority: 0,
          reason: "Initial canonical offer",
        },
      });
      await this.ensureMasterOptionsForProduct(tx, created.id, source.id);
      await this.audit.write(tx, {
        actor,
        action: "EXPERIENCE_MASTER_CREATED",
        entityType: "ExperienceMaster",
        entityId: created.id,
        afterState: {
          canonicalName: created.canonicalName,
          productId: source.id,
        },
      });
      return created;
    });
    return this.detail(master.id);
  }

  async detail(id: string) {
    const master: any = await this.prisma.experienceMaster.findUnique({
      where: { id },
      include: {
        products: { include: productInclude, orderBy: { updatedAt: "desc" } },
        placements: true,
        options: {
          where: { active: true },
          include: { placements: { include: { productVariant: { select: { id: true, name: true, productId: true } } } } },
          orderBy: [{ optionKey: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!master) throw new NotFoundException("Experience master not found");
    const masterOptions = master.options || [];
    const optionCodes = await publicIdentifierMap(this.prisma, PublicEntity.MASTER_OPTION, masterOptions.map((option: any) => option.id));
    return {
      ...master,
      options: masterOptions.map((option: any) => ({ ...option, publicCode: optionCodes.get(option.id) || null })),
      products: master.products.map((item: any) => this.productSummary(item)),
    };
  }

  async link(actor: AuthUser, masterId: string, dto: LinkExperienceProductDto) {
    const source: any = await this.product(dto.productId);
    const master = await this.prisma.experienceMaster.findUnique({
      where: { id: masterId },
      select: { id: true },
    });
    if (!master) throw new NotFoundException("Experience master not found");
    const linked: any = await this.prisma.product.findUnique({
      where: { id: source.id },
      select: { experienceMasterId: true },
    });
    if (linked?.experienceMasterId && linked.experienceMasterId !== masterId)
      throw new ConflictException(
        "Product is already linked to another experience master",
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE', masterId);
      await tx.product.update({
        where: { id: source.id },
        data: { experienceMasterId: masterId },
      });
      await tx.experienceOfferPlacement.upsert({
        where: {
          experienceMasterId_productId: {
            experienceMasterId: masterId,
            productId: source.id,
          },
        },
        update: {
          priority: dto.priority ?? 0,
          reason: dto.reason?.trim() || null,
        },
        create: {
          experienceMasterId: masterId,
          productId: source.id,
          priority: dto.priority ?? 0,
          reason: dto.reason?.trim() || null,
        },
      });
      await this.ensureMasterOptionsForProduct(tx, masterId, source.id);
      await tx.productMatchSuggestion.updateMany({
        where: {
          OR: [
            { sourceProductId: source.id },
            { candidateProductId: source.id },
          ],
          status: ProductMatchSuggestionStatus.PENDING,
        },
        data: {
          status: ProductMatchSuggestionStatus.ACCEPTED,
          experienceMasterId: masterId,
        },
      });
      await this.audit.write(tx, {
        actor,
        action: "EXPERIENCE_PRODUCT_LINKED",
        entityType: "ExperienceMaster",
        entityId: masterId,
        afterState: { productId: source.id, reason: dto.reason || null },
      });
    });
    return this.detail(masterId);
  }

  async unlink(actor: AuthUser, masterId: string, productId: string) {
    await this.prisma.$transaction(async (tx) => {
      if (typeof (tx as any).$executeRawUnsafe === "function")
        await (tx as any).$executeRawUnsafe(
          "SET LOCAL search_path TO public",
        );
      const masters = await (tx as any).$queryRawUnsafe(
        'SELECT "id" FROM "public"."ExperienceMaster" WHERE "id" = $1 FOR UPDATE',
        masterId,
      );
      if (!masters.length)
        throw new NotFoundException("Experience master not found");
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { experienceMasterId: true },
      });
      if (!product)
        throw new NotFoundException("Product not found");
      if (product.experienceMasterId !== masterId)
        throw new ConflictException(
          "Product is not linked to this experience master",
        );
      const count = await tx.product.count({
        where: { experienceMasterId: masterId },
      });
      if (count <= 1)
        throw new ConflictException(
          "An experience master must keep at least one product",
        );
      await tx.product.update({
        where: { id: productId },
        data: { experienceMasterId: null },
      });
      await tx.experienceOfferPlacement.deleteMany({
        where: { experienceMasterId: masterId, productId },
      });
      await tx.experienceMasterOptionPlacement.deleteMany({ where: { productVariant: { productId } } });
      await tx.experienceMasterOption.updateMany({ where: { experienceMasterId: masterId, placements: { none: {} } }, data: { active: false } });
      await this.audit.write(tx, {
        actor,
        action: "EXPERIENCE_PRODUCT_UNLINKED",
        entityType: "ExperienceMaster",
        entityId: masterId,
        afterState: { productId },
      });
    });
    return this.detail(masterId);
  }

  async update(actor: AuthUser, id: string, dto: UpdateExperienceMasterDto) {
    await this.detail(id);
    const updated = await this.prisma.experienceMaster.update({
      where: { id },
      data: {
        ...(dto.canonicalName === undefined
          ? {}
          : { canonicalName: dto.canonicalName.trim() }),
        ...(dto.displayMode === undefined
          ? {}
          : { displayMode: dto.displayMode }),
        ...(dto.selectionPolicy === undefined
          ? {}
          : { selectionPolicy: dto.selectionPolicy }),
        updatedById: actor.sub,
      },
    });
    await this.audit.write(this.prisma, {
      actor,
      action: "EXPERIENCE_MASTER_UPDATED",
      entityType: "ExperienceMaster",
      entityId: id,
      afterState: dto as Prisma.InputJsonValue,
    });
    return updated;
  }

  async rejectSuggestion(actor: AuthUser, id: string) {
    const row = await this.prisma.productMatchSuggestion.update({
      where: { id },
      data: { status: ProductMatchSuggestionStatus.REJECTED },
    });
    await this.audit.write(this.prisma, {
      actor,
      action: "EXPERIENCE_MATCH_REJECTED",
      entityType: "ProductMatchSuggestion",
      entityId: id,
    });
    return row;
  }

  async decideSuggestion(actor: AuthUser, id: string, dto: DecideExperienceSuggestionDto) {
    if (dto.decision === 'REJECT') return this.rejectSuggestion(actor, id);
    const masterId = await this.prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "public"."ProductMatchSuggestion" WHERE "id" = $1 FOR UPDATE', id);
      const suggestion = await tx.productMatchSuggestion.findUnique({
        where: { id },
        include: { sourceProduct: { include: productInclude }, candidateProduct: { include: productInclude } },
      });
      if (!suggestion || suggestion.status !== ProductMatchSuggestionStatus.PENDING) throw new ConflictException('Mapping suggestion is no longer pending');
      const source = suggestion.sourceProduct;
      const candidate = suggestion.candidateProduct;
      if (source.tenantId === candidate.tenantId) throw new ConflictException('A multi-supplier master requires products from different vendors');
      if (source.experienceMasterId || candidate.experienceMasterId) throw new ConflictException('Both products must be unlinked before accepting this suggestion');
      const revision = source.currentRevision;
      if (!revision?.type || !revision.cityName || !revision.stateName || !revision.countryName) throw new ConflictException('Source product is missing required experience master identity fields');
      const master = await tx.experienceMaster.create({
        data: {
          id: randomUUID(), canonicalName: (dto.canonicalName?.trim() || revision.productName || source.productCode).trim(),
          type: revision.type, subType: revision.subType || null,
          cityName: revision.cityName, stateName: revision.stateName,
          countryName: revision.countryName,
          displayMode: ExperienceDisplayMode.SINGLE_OFFER, selectionPolicy: OfferSelectionPolicy.CHEAPEST,
          createdById: actor.sub, updatedById: actor.sub,
        },
      });
      await ensurePublicIdentifier(tx, PublicEntity.MASTER_PRODUCT, master.id, await allocatePublicCode(tx, PublicEntity.MASTER_PRODUCT, 'MP-', 4));
      const linked = await tx.product.updateMany({ where: { id: { in: [source.id, candidate.id] }, experienceMasterId: null }, data: { experienceMasterId: master.id } });
      if (linked.count !== 2) throw new ConflictException('A product was linked while this mapping decision was being saved');
      await tx.experienceOfferPlacement.createMany({ data: [source.id, candidate.id].map((productId, index) => ({ experienceMasterId: master.id, productId, placementType: 'PREFERRED', priority: 0, reason: index === 0 ? 'Accepted mapping suggestion source' : 'Accepted mapping suggestion candidate' })) });
      await this.ensureMasterOptionsForProduct(tx, master.id, source.id);
      await this.ensureMasterOptionsForProduct(tx, master.id, candidate.id);
      await tx.productMatchSuggestion.update({ where: { id }, data: { status: ProductMatchSuggestionStatus.ACCEPTED, experienceMasterId: master.id } });
      await this.audit.write(tx, { actor, action: 'EXPERIENCE_MATCH_ACCEPTED', entityType: 'ProductMatchSuggestion', entityId: id, afterState: { experienceMasterId: master.id, productIds: [source.id, candidate.id] } });
      return master.id;
    });
    return this.detail(masterId);
  }
}
