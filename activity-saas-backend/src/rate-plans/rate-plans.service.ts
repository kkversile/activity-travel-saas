import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatePlanDto, UpdateRatePlanDto } from './rate-plan.dto';

@Injectable()
export class RatePlansService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedActivity(user: AuthUser, activityId: string) {
    const tenantId = requireTenant(user);
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, tenantId } });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  async list(user: AuthUser, activityId: string) {
    await this.ownedActivity(user, activityId);
    return this.prisma.ratePlan.findMany({
      where: { activityId },
      include: { travellerRules: true, cancellationRules: { orderBy: { minDaysBefore: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthUser, activityId: string, dto: CreateRatePlanDto) {
    await this.ownedActivity(user, activityId);
    const { travellerRules = [], cancellationRules = [], validFrom, validTo, ...rest } = dto;
    if (new Date(validTo) < new Date(validFrom)) throw new ConflictException('validTo must be after validFrom');

    return this.prisma.ratePlan.create({
      data: {
        ...rest,
        activityId,
        validFrom: new Date(validFrom),
        validTo: new Date(validTo),
        travellerRules: travellerRules.length ? { create: travellerRules } : undefined,
        cancellationRules: cancellationRules.length ? { create: cancellationRules } : undefined,
      },
      include: { travellerRules: true, cancellationRules: true },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateRatePlanDto) {
    const tenantId = requireTenant(user);
    const existing = await this.prisma.ratePlan.findFirst({ where: { id, activity: { tenantId } } });
    if (!existing) throw new NotFoundException('Rate plan not found');
    const { travellerRules, cancellationRules, validFrom, validTo, ...rest } = dto;
    const nextValidFrom = validFrom ? new Date(validFrom) : existing.validFrom;
    const nextValidTo = validTo ? new Date(validTo) : existing.validTo;
    if (nextValidTo < nextValidFrom) throw new ConflictException('validTo must be after validFrom');

    return this.prisma.$transaction(async (tx) => {
      if (travellerRules) {
        await tx.travellerRule.deleteMany({ where: { ratePlanId: id } });
      }
      if (cancellationRules) {
        await tx.cancellationRule.deleteMany({ where: { ratePlanId: id } });
      }
      return tx.ratePlan.update({
        where: { id },
        data: {
          ...rest,
          ...(validFrom ? { validFrom: nextValidFrom } : {}),
          ...(validTo ? { validTo: nextValidTo } : {}),
          ...(travellerRules ? { travellerRules: travellerRules.length ? { create: travellerRules } : undefined } : {}),
          ...(cancellationRules ? { cancellationRules: cancellationRules.length ? { create: cancellationRules } : undefined } : {}),
        },
        include: { travellerRules: true, cancellationRules: true },
      });
    });
  }
}
