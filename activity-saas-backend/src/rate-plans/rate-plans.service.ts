import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VariantStatus } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRatePlanDto, UpdateRatePlanDto } from './rate-plan.dto';
import { CommercialService } from '../commercial/commercial.service';

@Injectable()
export class RatePlansService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly commercial?: CommercialService) {}

  private async ownedVariant(user: AuthUser, variantId: string) {
    const tenantId = requireTenant(user);
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, product: { tenantId } } });
    if (!variant) throw new NotFoundException('Product variant not found');
    return variant;
  }

  async list(user: AuthUser, variantId: string) {
    await this.ownedVariant(user, variantId);
    const plans = await this.prisma.ratePlan.findMany({
      where: { variantId },
      include: { travellerRules: true, cancellationRules: { orderBy: { minDaysBefore: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(plans.map(async (plan) => ({ ...plan, ...(this.commercial ? { commercialReadiness: await this.commercial.readiness(user, plan.id) } : {}) })));
  }

  async create(user: AuthUser, variantId: string, dto: CreateRatePlanDto) {
    const variant = await this.ownedVariant(user, variantId);
    if (variant.status === VariantStatus.ARCHIVED || variant.archivedAt) throw new ConflictException('Archived variants cannot accept new rate plans');
    const { travellerRules = [], cancellationRules = [], validFrom, validTo, ...rest } = dto;
    if (new Date(validTo) < new Date(validFrom)) throw new ConflictException('validTo must be after validFrom');

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ratePlan.create({
      data: {
        ...rest,
        variantId,
        validFrom: new Date(validFrom),
        validTo: new Date(validTo),
        basePrice: 0,
        unitType: 'per_person',
        freehold: false,
        affiliates: [],
        instantConfirmation: false,
        travellerRules: travellerRules.length ? { create: travellerRules } : undefined,
        cancellationRules: cancellationRules.length ? { create: cancellationRules } : undefined,
        commercialVersions: { create: { versionNumber: 1, status: 'DRAFT', effectiveFrom: new Date(validFrom), effectiveTo: new Date(validTo), currency: dto.currency || 'INR', createdById: user.sub, sourcePayload: { createdWithCommercialCore: true } } },
      },
      include: { travellerRules: true, cancellationRules: true },
      });
      await this.audit.write(tx, { actor: user, tenantId: user.tenantId, action: 'RATEPLAN_CREATED', entityType: 'RatePlan', entityId: created.id, afterState: { ratePlanCode: created.ratePlanCode, status: created.status } });
      return created;
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A rate plan with this ratePlanCode already exists for the variant');
      throw error;
    }
    return { ...created, ...(this.commercial ? { commercialReadiness: await this.commercial.readiness(user, created.id) } : {}) };
  }

  async update(user: AuthUser, id: string, dto: UpdateRatePlanDto) {
    const tenantId = requireTenant(user);
    const existing = await this.prisma.ratePlan.findFirst({ where: { id, variant: { product: { tenantId } } } });
    if (!existing) throw new NotFoundException('Rate plan not found');
    const { travellerRules, cancellationRules, validFrom, validTo, ...rest } = dto;
    if (travellerRules || cancellationRules) throw new ConflictException('Rate plan identity updates cannot mutate commercial or cancellation terms; use the versioned commercial editor');
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
      const updated = await tx.ratePlan.update({
        where: { id },
        data: {
          ...rest,
          ...(validFrom ? { validFrom: nextValidFrom } : {}),
          ...(validTo ? { validTo: nextValidTo } : {}),
        },
        include: { travellerRules: true, cancellationRules: true },
      });
      await this.audit.write(tx, { actor: user, tenantId, action: 'RATEPLAN_UPDATED', entityType: 'RatePlan', entityId: id, beforeState: { status: existing.status }, afterState: { status: updated.status } });
      return { ...updated, ...(this.commercial ? { commercialReadiness: await this.commercial.readiness(user, id) } : {}) };
    });
  }
}
