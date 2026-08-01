import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { CreatePricePlanDto, PricePlanQueryDto, UpdatePricePlanDto } from "./dto/price-plan.dto";

@Injectable()
export class PricePlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: PricePlanQueryDto) {
    const parsed = parsePaginationQuery(query, ["name", "createdAt", "validFrom", "adultMinor"], "createdAt");
    const where = {
      tenantId,
      ...(query.activityId ? { activityId: query.activityId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.validOn ? { AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: new Date(query.validOn) } }] }, { OR: [{ validTo: null }, { validTo: { gte: new Date(query.validOn) } }] }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.pricePlan.findMany({
        where,
        include: { activity: { select: { id: true, name: true } }, variant: { select: { id: true, name: true } } },
        orderBy: { [parsed.sortBy]: parsed.sortOrder },
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
      }),
      this.prisma.pricePlan.count({ where }),
    ]);
    return paginated(data, parsed.page, parsed.pageSize, total);
  }

  async get(tenantId: string, id: string) {
    const result = await this.prisma.pricePlan.findFirst({ where: { id, tenantId }, include: { activity: true, variant: true } });
    if (!result) throw new NotFoundException("Price plan not found");
    return result;
  }

  private async ensureVariant(tenantId: string, activityId: string, variantId: string | undefined) {
    if (variantId && !(await this.prisma.activityVariant.findFirst({ where: { id: variantId, activityId, tenantId }, select: { id: true } }))) {
      throw new NotFoundException("Variant not found for activity");
    }
  }

  async create(tenantId: string, dto: CreatePricePlanDto) {
    const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, tenantId }, select: { id: true } });
    if (!activity) throw new NotFoundException("Activity not found");
    await this.ensureVariant(tenantId, dto.activityId, dto.variantId);
    const result = await this.prisma.pricePlan.create({ data: { tenantId, activityId: dto.activityId, variantId: dto.variantId, name: dto.name, currency: dto.currency.toUpperCase(), adultMinor: dto.adultMinor, childMinor: dto.childMinor, infantMinor: dto.infantMinor, basis: dto.basis, taxPercent: dto.taxPercent, commissionPercent: dto.commissionPercent, validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, validTo: dto.validTo ? new Date(dto.validTo) : undefined, isActive: dto.isActive } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "PRICE_PLAN_CREATED", entityType: "PricePlan", entityId: result.id } });
    return result;
  }

  async update(tenantId: string, id: string, dto: UpdatePricePlanDto) {
    const current = await this.get(tenantId, id);
    const activityId = dto.activityId ?? current.activityId;
    if (dto.activityId) {
      const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, tenantId }, select: { id: true } });
      if (!activity) throw new NotFoundException("Activity not found");
    }
    if (dto.activityId && dto.activityId !== current.activityId && dto.variantId === undefined && current.variantId) throw new BadRequestException("A variant for the new activity is required");
    const variantId = dto.variantId !== undefined ? dto.variantId : current.variantId ?? undefined;
    await this.ensureVariant(tenantId, activityId, variantId);
    const result = await this.prisma.pricePlan.update({ where: { id }, data: { activityId: dto.activityId, variantId, name: dto.name, currency: dto.currency?.toUpperCase(), adultMinor: dto.adultMinor, childMinor: dto.childMinor, infantMinor: dto.infantMinor, basis: dto.basis, taxPercent: dto.taxPercent, commissionPercent: dto.commissionPercent, validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined, validTo: dto.validTo ? new Date(dto.validTo) : undefined, isActive: dto.isActive } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "PRICE_PLAN_UPDATED", entityType: "PricePlan", entityId: id } });
    return result;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.pricePlan.update({ where: { id }, data: { isActive: false } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "PRICE_PLAN_ARCHIVED", entityType: "PricePlan", entityId: id } });
    return { success: true };
  }
}
