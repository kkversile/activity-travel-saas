import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ProductRevisionStatus, ProductType, ScheduleStatus, SessionStatus, UserRole, VariantStatus } from '@prisma/client';
import { CommercialService } from '../commercial/commercial.service';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelDistributionReadinessService, ProductDistributionReadiness } from '../distribution/channel-distribution-readiness.service';

export type ReadinessSection = { ready: boolean; reasonCodes: string[]; details?: Record<string, unknown> };
export type ProductReadiness = {
  productId: string;
  revisionId: string | null;
  ready: boolean;
  sections: {
    basicInfo: ReadinessSection;
    experience: ReadinessSection;
    policies: ReadinessSection;
    voucher: ReadinessSection;
    options: ReadinessSection;
    rates: ReadinessSection;
    availability: ReadinessSection;
    mediaFulfilment: ReadinessSection;
    distribution: ReadinessSection;
  };
  reasonCodes: string[];
  distributionReady: boolean;
  distributionReasonCodes: string[];
  evaluatedAt: string;
};

const startOfToday = () => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};

@Injectable()
export class ProductReadinessService {
  constructor(private readonly prisma: PrismaService, private readonly commercial: CommercialService, @Optional() private readonly distributionReadiness?: ChannelDistributionReadinessService) {}

  async evaluate(user: AuthUser, productId: string, client: any = this.prisma): Promise<ProductReadiness> {
    const tenantId = user.role === UserRole.VENDOR ? requireTenant(user) : undefined;
    const product = await client.product.findFirst({
      where: { id: productId, ...(tenantId ? { tenantId } : { tenant: { kind: 'VENDOR' } }) },
      include: {
        revisions: {
          orderBy: { versionNumber: 'desc' },
          include: { media: { where: { archivedAt: null } }, fulfilmentPolicy: true, itineraryStops: { orderBy: { sequence: 'asc' } } },
        },
        variants: {
          where: { status: VariantStatus.ACTIVE, archivedAt: null },
          include: {
            ratePlans: {
              where: { status: 'ACTIVE' },
              include: {
                travellerRules: true,
                cancellationRules: true,
                commercialVersions: {
                  where: { status: { in: ['ACTIVE', 'DRAFT'] } },
                  orderBy: { versionNumber: 'desc' },
                  take: 1,
                },
              },
            },
            schedules: {
              where: { status: ScheduleStatus.ACTIVE, archivedAt: null },
              include: {
                ratePlanMappings: { where: { active: true } },
                sessions: {
                  where: { serviceDate: { gte: startOfToday() }, archivedAt: null, status: SessionStatus.OPEN },
                  include: { inventoryState: true },
                  orderBy: { serviceDate: 'asc' },
                  take: 30,
                },
              },
            },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    const commercialActor = tenantId ? user : { ...user, role: UserRole.VENDOR, tenantId: product.tenantId };

    const revision = product.revisions.find((item: any) => item.status === ProductRevisionStatus.DRAFT || item.status === ProductRevisionStatus.UNDER_REVIEW) || product.revisions.find((item: any) => item.id === product.currentRevisionId) || product.revisions[0] || null;
    const section = (reasonCodes: string[], details?: Record<string, unknown>): ReadinessSection => ({ ready: reasonCodes.length === 0, reasonCodes, ...(details ? { details } : {}) });
    const basicReasons: string[] = [];
    if (!revision?.productName?.trim()) basicReasons.push('PRODUCT_NAME_MISSING');
    if (!revision?.type) basicReasons.push('PRODUCT_TYPE_MISSING');
    if (!revision?.subType?.trim()) basicReasons.push('PRODUCT_SUBTYPE_MISSING');
    // The Partner Hub prototype treats sub-category tags as optional. Keep the
    // canonical readiness contract aligned with that UI; category itself is
    // the required taxonomy field.
    if (!revision?.category?.trim()) basicReasons.push('CATEGORY_MISSING');
    if (!revision?.cityName?.trim() || !revision?.stateName?.trim() || !revision?.countryName?.trim()) basicReasons.push('DESTINATION_MISSING');
    if (!revision?.meetingModel) basicReasons.push('MEETING_MODEL_MISSING');

    const experienceReasons: string[] = [];
    if (!revision?.shortDescription?.trim()) experienceReasons.push('SHORT_SUMMARY_MISSING');
    if (!revision?.description?.trim()) experienceReasons.push('EXPERIENCE_DESCRIPTION_MISSING');
    const highlights = Array.isArray(revision?.highlights) ? revision.highlights.filter((item: unknown) => String(item || '').trim()) : [];
    if (highlights.length < 3 || highlights.length > 6) experienceReasons.push('HIGHLIGHTS_COUNT_INVALID');
    if (!Array.isArray(revision?.included) || !revision.included.some((item: unknown) => String(item || '').trim())) experienceReasons.push('INCLUDED_MISSING');
    if (!Array.isArray(revision?.notIncluded) || !revision.notIncluded.some((item: unknown) => String(item || '').trim())) experienceReasons.push('NOT_INCLUDED_MISSING');
    if (revision?.meetingModel === 'FIXED_MEETING_POINT' && !revision.meetingPoint?.trim()) experienceReasons.push('MEETING_POINT_MISSING');
    if (!revision?.endPoint?.trim()) experienceReasons.push('END_POINT_MISSING');
    const prototype = (revision?.sourcePayload as any)?.prototype;
    const followItinerary = revision?.followItinerary !== false && prototype?.followItinerary !== false;
    if (followItinerary && !(revision as any).itineraryStops?.length) experienceReasons.push('ITINERARY_STOPS_MISSING');
    if (followItinerary && (revision as any).itineraryStops?.some((stop: any) => !String(stop.stopName || '').trim())) experienceReasons.push('ITINERARY_STOP_NAME_MISSING');

    const policiesReasons: string[] = [];
    if (!revision?.cancellationPreset?.trim() && !prototype?.cancellationPreset) policiesReasons.push('CANCELLATION_POLICY_MISSING');
    const voucherReasons: string[] = [];
    if (!revision?.voucherCodeSource && !prototype?.voucherCodeSource) voucherReasons.push('VOUCHER_CONFIGURATION_MISSING');
    if (!revision?.voucherAcceptedAs && !prototype?.voucherAcceptedAs) voucherReasons.push('VOUCHER_CONFIGURATION_MISSING');
    if (!revision?.voucherInstructions?.trim() && !prototype?.voucherInstructions) voucherReasons.push('VOUCHER_INSTRUCTIONS_MISSING');

    const optionsReasons: string[] = [];
    const variants = (product.variants as any[]).filter((variant: any) => !revision || variant.revisionId === revision.id || (!variant.revisionId && product.currentRevisionId === revision.id));
    if (!variants.length) optionsReasons.push('OPTIONS_MISSING');

    const ratesReasons: string[] = [];
    const activePlans = variants.flatMap((variant) => variant.ratePlans || []);
    if (!activePlans.length) ratesReasons.push('RATE_PLAN_MISSING');
    const visitorPricingEnabled = Boolean((revision?.sourcePayload as any)?.hasDifferentialVisitorPricing);
    if (visitorPricingEnabled && activePlans.some((plan: any) => {
      const version = plan.commercialVersions?.[0];
      const visitorPrices = (version?.sourcePayload as any)?.visitorPrices;
      return !Array.isArray(visitorPrices) || visitorPrices.length === 0;
    })) {
      ratesReasons.push('VISITOR_PRICES_MISSING');
    }
    const availabilityReasons: string[] = [];
    const activeSchedules = variants.flatMap((variant) => variant.schedules || []);
    if (!activeSchedules.length) availabilityReasons.push('SCHEDULE_MISSING');
    const commercialResults = await Promise.all(activePlans.map((plan) => this.commercial.readiness(commercialActor, plan.id, new Date(), undefined, client)));
    const offerChecks = activePlans.map((plan: any, index) => {
      const variant = variants.find((candidate: any) => candidate.ratePlans?.some((item: any) => item.id === plan.id));
      const mappedSchedules = (variant?.schedules || []).filter((schedule: any) => schedule.ratePlanMappings?.some((mapping: any) => mapping.ratePlanId === plan.id));
      const futureAvailability = mappedSchedules.some((schedule: any) => (schedule.sessions || []).some((session: any) => {
        const inventory = session.inventoryState;
        return inventory && inventory.totalCapacity - inventory.blockedCapacity - inventory.heldCapacity - inventory.confirmedCapacity > 0;
      }));
      return { plan, commercial: commercialResults[index], hasCancellation: Boolean(plan.cancellationRules?.length), mapped: mappedSchedules.length > 0, futureAvailability };
    });
    const readyOffers = offerChecks.filter((offer) => offer.commercial.ready && offer.hasCancellation && offer.mapped && offer.futureAvailability);
    if (activePlans.length && !readyOffers.length) {
      const codes = offerChecks.flatMap((offer) => offer.commercial.reasonCodes);
      if (codes.length) ratesReasons.push(...codes);
      if (!offerChecks.some((offer) => offer.commercial.ready && offer.hasCancellation)) ratesReasons.push('CANCELLATION_RULES_MISSING');
      if (!offerChecks.some((offer) => offer.mapped)) availabilityReasons.push('RATE_PLAN_NOT_MAPPED');
      if (!offerChecks.some((offer) => offer.futureAvailability)) availabilityReasons.push('FUTURE_AVAILABILITY_MISSING');
    }

    const mediaReasons: string[] = [];
    if (!revision?.media?.some((media: any) => media.kind === 'IMAGE')) mediaReasons.push('COVER_IMAGE_MISSING');
    if (revision?.media?.some((media: any) => media.kind === 'IMAGE' && (media.externalUrl || media.sourceUrl))) mediaReasons.push('EXTERNAL_IMAGE_QUALITY_UNVERIFIED');
    if (!revision?.fulfilmentPolicy?.mode) mediaReasons.push('FULFILMENT_POLICY_MISSING');

    if (['SUPPLIER_BARCODE_POOL', 'SUPPLIER_API'].includes(String(revision?.voucherCodeSource || prototype?.voucherCodeSource || ''))) {
      voucherReasons.push('SUPPLIER_VOUCHER_INTEGRATION_MISSING');
    }

    const distribution: ProductDistributionReadiness = this.distributionReadiness
      ? await this.distributionReadiness.evaluate(productId, client)
      : {
        channelCode: 'VOYA_AGENT', ready: false, status: 'PENDING', reasonCodes: ['CHANNEL_PRODUCT_NOT_MAPPED'],
        details: { channelId: null, productMapping: 'MISSING', activeVariantCount: variants.length, mappedVariantCount: 0, activeRatePlanCount: activePlans.length, mappedRatePlanCount: 0, inventoryRuleCount: 0 },
      };

    const sections = {
      basicInfo: section(basicReasons),
      experience: section(experienceReasons),
      policies: section([...new Set(policiesReasons)]),
      voucher: section([...new Set(voucherReasons)]),
      options: section(optionsReasons, { activeVariantCount: variants.length }),
      rates: section([...new Set(ratesReasons)], { activeRatePlanCount: activePlans.length, readyRatePlanCount: readyOffers.length }),
      availability: section([...new Set(availabilityReasons)], { activeScheduleCount: activeSchedules.length }),
      mediaFulfilment: section(mediaReasons),
      distribution: section(distribution.reasonCodes, distribution.details),
    };
    // Distribution is intentionally excluded from `ready`: vendors may submit
    // and Admin may publish before the separate Agent-channel activation step.
    const reasonCodes = [...new Set(Object.entries(sections).filter(([key]) => key !== 'distribution').flatMap(([, item]) => item.reasonCodes))];
    return { productId, revisionId: revision?.id || null, ready: reasonCodes.length === 0, sections, reasonCodes, distributionReady: distribution.ready, distributionReasonCodes: distribution.reasonCodes, evaluatedAt: new Date().toISOString() };
  }
}
