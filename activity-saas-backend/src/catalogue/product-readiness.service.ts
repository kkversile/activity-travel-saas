import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductRevisionStatus, ProductType, ScheduleStatus, SessionStatus, VariantStatus } from '@prisma/client';
import { CommercialService } from '../commercial/commercial.service';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';

export type ReadinessSection = { ready: boolean; reasonCodes: string[]; details?: Record<string, unknown> };
export type ProductReadiness = {
  productId: string;
  revisionId: string | null;
  ready: boolean;
  sections: {
    basicInfo: ReadinessSection;
    experience: ReadinessSection;
    options: ReadinessSection;
    rates: ReadinessSection;
    availability: ReadinessSection;
    mediaFulfilment: ReadinessSection;
  };
  reasonCodes: string[];
  evaluatedAt: string;
};

const startOfToday = () => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};

@Injectable()
export class ProductReadinessService {
  constructor(private readonly prisma: PrismaService, private readonly commercial: CommercialService) {}

  async evaluate(user: AuthUser, productId: string, client: any = this.prisma): Promise<ProductReadiness> {
    const tenantId = requireTenant(user);
    const product = await client.product.findFirst({
      where: { id: productId, tenantId },
      include: {
        revisions: {
          orderBy: { versionNumber: 'desc' },
          include: { media: { where: { archivedAt: null } }, fulfilmentPolicy: true },
        },
        variants: {
          where: { status: VariantStatus.ACTIVE, archivedAt: null },
          include: {
            ratePlans: {
              where: { status: 'ACTIVE' },
              include: { travellerRules: true, cancellationRules: true },
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

    const revision = product.revisions.find((item: any) => item.status === ProductRevisionStatus.DRAFT || item.status === ProductRevisionStatus.UNDER_REVIEW) || product.revisions.find((item: any) => item.id === product.currentRevisionId) || product.revisions[0] || null;
    const section = (reasonCodes: string[], details?: Record<string, unknown>): ReadinessSection => ({ ready: reasonCodes.length === 0, reasonCodes, ...(details ? { details } : {}) });
    const basicReasons: string[] = [];
    if (!revision?.productName?.trim()) basicReasons.push('PRODUCT_NAME_MISSING');
    if (!revision?.type) basicReasons.push('PRODUCT_TYPE_MISSING');
    if (!revision?.subType?.trim()) basicReasons.push('PRODUCT_SUBTYPE_MISSING');
    if (!revision?.subCategory?.trim()) basicReasons.push('SUBCATEGORY_MISSING');
    if (!revision?.cityName?.trim() || !revision?.stateName?.trim() || !revision?.countryName?.trim()) basicReasons.push('DESTINATION_MISSING');
    if (!revision?.meetingModel) basicReasons.push('MEETING_MODEL_MISSING');

    const experienceReasons: string[] = [];
    if (!revision?.description?.trim()) experienceReasons.push('EXPERIENCE_DESCRIPTION_MISSING');
    if (revision?.meetingModel === 'FIXED_MEETING_POINT' && !revision.meetingPoint?.trim()) experienceReasons.push('MEETING_POINT_MISSING');

    const optionsReasons: string[] = [];
    const variants = product.variants as any[];
    if (!variants.length) optionsReasons.push('OPTIONS_MISSING');

    const ratesReasons: string[] = [];
    const activePlans = variants.flatMap((variant) => variant.ratePlans || []);
    if (!activePlans.length) ratesReasons.push('RATE_PLAN_MISSING');
    const availabilityReasons: string[] = [];
    const activeSchedules = variants.flatMap((variant) => variant.schedules || []);
    if (!activeSchedules.length) availabilityReasons.push('SCHEDULE_MISSING');
    const commercialResults = await Promise.all(activePlans.map((plan) => this.commercial.readiness(user, plan.id, new Date(), undefined, client)));
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
    if (!revision?.fulfilmentPolicy?.mode) mediaReasons.push('FULFILMENT_POLICY_MISSING');

    const sections = {
      basicInfo: section(basicReasons),
      experience: section(experienceReasons),
      options: section(optionsReasons, { activeVariantCount: variants.length }),
      rates: section([...new Set(ratesReasons)], { activeRatePlanCount: activePlans.length, readyRatePlanCount: readyOffers.length }),
      availability: section([...new Set(availabilityReasons)], { activeScheduleCount: activeSchedules.length }),
      mediaFulfilment: section(mediaReasons),
    };
    const reasonCodes = [...new Set(Object.values(sections).flatMap((item) => item.reasonCodes))];
    return { productId, revisionId: revision?.id || null, ready: reasonCodes.length === 0, sections, reasonCodes, evaluatedAt: new Date().toISOString() };
  }
}
