import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { BulkSlotsDto, CreatePromotionDto, PricingRuleDto } from './availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, activityId?: string) {
    const tenantId = requireTenant(user);
    const where = activityId ? { ratePlan: { activityId, activity: { tenantId } } } : { ratePlan: { activity: { tenantId } } };
    return this.prisma.availabilitySlot.findMany({
      where,
      include: { ratePlan: { select: { name: true, ratePlanCode: true, basePrice: true, activity: { select: { id: true, productName: true } } } } },
      orderBy: [{ slotDate: 'asc' }, { startTime: 'asc' }],
      take: 200,
    });
  }

  async bulkUpsert(user: AuthUser, dto: BulkSlotsDto) {
    const tenantId = requireTenant(user);
    const ratePlanIds = [...new Set(dto.slots.map((s) => s.ratePlanId))];
    const owned = await this.prisma.ratePlan.findMany({ where: { id: { in: ratePlanIds }, activity: { tenantId } }, select: { id: true } });
    if (owned.length !== ratePlanIds.length) throw new NotFoundException('One or more rate plans are not owned by this vendor');
    if (dto.slots.some((s) => s.available > s.capacity)) throw new ConflictException('available cannot exceed capacity');

    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const slot of dto.slots) {
        const slotDate = new Date(slot.slotDate);
        const existing = await tx.availabilitySlot.findUnique({
          where: { ratePlanId_slotDate_startTime: { ratePlanId: slot.ratePlanId, slotDate, startTime: slot.startTime } },
        });
        if (!existing) {
          const { expectedVersion: _expectedVersion, ...createData } = slot;
          results.push(await tx.availabilitySlot.create({ data: { ...createData, slotDate } }));
          continue;
        }
        const expectedVersion = slot.expectedVersion ?? existing.version;
        const { count } = await tx.availabilitySlot.updateMany({
          where: { id: existing.id, version: expectedVersion },
          data: {
            capacity: slot.capacity,
            available: slot.available,
            priceOverride: slot.priceOverride,
            closed: slot.closed,
            version: { increment: 1 },
          },
        });
        if (count !== 1) throw new ConflictException(`Slot ${slot.slotDate} ${slot.startTime} changed in another session; reload and retry`);
        results.push(await tx.availabilitySlot.findUniqueOrThrow({ where: { id: existing.id } }));
      }
      return results;
    });
  }

  async remove(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    const slot = await this.prisma.availabilitySlot.findFirst({ where: { id, ratePlan: { activity: { tenantId } } }, select: { id: true } });
    if (!slot) throw new NotFoundException('Availability slot not found');
    await this.prisma.availabilitySlot.delete({ where: { id } });
    return { deleted: true, id };
  }

  async listPromotions(user: AuthUser) {
    const tenantId = requireTenant(user);
    return this.prisma.promotion.findMany({ where: { activity: { tenantId } }, include: { activity: { select: { productName: true } } }, orderBy: { startsAt: 'desc' } });
  }

  async createPromotion(user: AuthUser, dto: CreatePromotionDto) {
    const tenantId = requireTenant(user);
    const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, tenantId } });
    if (!activity) throw new NotFoundException('Activity not found');
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) throw new ConflictException('Promotion end must be after start');
    return this.prisma.promotion.create({ data: { ...dto, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) } });
  }

  async togglePromotion(user: AuthUser, id: string, active: boolean) {
    const tenantId = requireTenant(user);
    const promo = await this.prisma.promotion.findFirst({ where: { id, activity: { tenantId } } });
    if (!promo) throw new NotFoundException('Promotion not found');
    return this.prisma.promotion.update({ where: { id }, data: { active } });
  }

  async listPricingRules(user: AuthUser, activityId?: string) {
    const tenantId = requireTenant(user);
    return this.prisma.pricingRule.findMany({ where: { ...(activityId ? { activityId } : {}), activity: { tenantId } }, orderBy: { createdAt: 'asc' } });
  }

  async createPricingRule(user: AuthUser, dto: PricingRuleDto) {
    const tenantId = requireTenant(user);
    const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, tenantId }, select: { id: true } });
    if (!activity) throw new NotFoundException('Activity not found');
    if (dto.endsAt <= dto.startsAt) throw new ConflictException('Pricing rule end must be after start');
    if (dto.adjustmentType === 'PERCENTAGE' && dto.adjustment > 100) throw new ConflictException('Percentage adjustment cannot exceed 100');
    return this.prisma.pricingRule.create({ data: { ...dto, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) } });
  }

  async updatePricingRule(user: AuthUser, id: string, dto: Partial<PricingRuleDto>) {
    const tenantId = requireTenant(user);
    const rule = await this.prisma.pricingRule.findFirst({ where: { id, activity: { tenantId } } });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : rule.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : rule.endsAt;
    if (endsAt <= startsAt) throw new ConflictException('Pricing rule end must be after start');
    if (dto.adjustmentType === 'PERCENTAGE' && Number(dto.adjustment) > 100) throw new ConflictException('Percentage adjustment cannot exceed 100');
    return this.prisma.pricingRule.update({ where: { id }, data: { ...dto, startsAt, endsAt } });
  }

  async deletePricingRule(user: AuthUser, id: string) {
    const tenantId = requireTenant(user);
    const rule = await this.prisma.pricingRule.findFirst({ where: { id, activity: { tenantId } }, select: { id: true } });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    await this.prisma.pricingRule.delete({ where: { id } });
    return { deleted: true, id };
  }
}
