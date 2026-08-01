import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityQueryDto, CreateActivityDto, CreateBlackoutDto, CreateCancellationRuleDto, CreateCategoryDto, CreateDestinationDto, CreatePricePlanDto, CreateRecurringScheduleDto, CreateScheduleDto, CreateVariantDto, UpdateActivityDto } from "./dto/activity.dto";
import { paginated, parsePaginationQuery } from "../common/pagination/pagination";

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, options: ActivityQueryDto = new ActivityQueryDto()) {
    const parsed = parsePaginationQuery(options, ["name", "createdAt", "updatedAt", "status", "destination"], "name");
    const where = {
      tenantId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options.destinationId ? { destinationId: options.destinationId } : {}),
      ...(options.minDuration || options.maxDuration ? { durationMinutes: { ...(options.minDuration ? { gte: options.minDuration } : {}), ...(options.maxDuration ? { lte: options.maxDuration } : {}) } } : {}),
      ...(options.createdFrom || options.createdTo ? { createdAt: { ...(options.createdFrom ? { gte: new Date(options.createdFrom) } : {}), ...(options.createdTo ? { lte: new Date(options.createdTo) } : {}) } } : {}),
      ...(options.publishedFrom || options.publishedTo ? { publishedAt: { ...(options.publishedFrom ? { gte: new Date(options.publishedFrom) } : {}), ...(options.publishedTo ? { lte: new Date(options.publishedTo) } : {}) } } : {}),
      ...(options.hasActiveSchedule === undefined ? {} : options.hasActiveSchedule ? { schedules: { some: { isBookable: true, startsAt: { gte: new Date() } } } } : { schedules: { none: { isBookable: true, startsAt: { gte: new Date() } } } }),
      ...(parsed.search ? { OR: [{ name: { contains: parsed.search, mode: "insensitive" as const } }, { destination: { contains: parsed.search, mode: "insensitive" as const } }] } : {})
    };
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
      where: {
        ...where
      },
      include: {
        category: { select: { id: true, name: true } },
        pricePlans: { where: { isActive: true } },
        schedules: {
          where: {
            isBookable: true,
            startsAt: { gte: new Date() }
          },
          orderBy: { startsAt: "asc" },
          take: 10
        }
      },
      orderBy: { [parsed.sortBy]: parsed.sortOrder },
      skip: (parsed.page - 1) * parsed.pageSize,
      take: parsed.pageSize
      }),
      this.prisma.activity.count({ where })
    ]);
    return paginated(data, parsed.page, parsed.pageSize, totalItems);
  }

  async create(tenantId: string, dto: CreateActivityDto) {
    await this.validateCatalogReferences(tenantId, dto.categoryId, dto.destinationId);
    const { images, ...data } = dto;
    const result = await this.prisma.activity.create({ data: { ...data, tenantId, publishedAt: dto.status === ActivityStatus.PUBLISHED ? new Date() : undefined, images: images ? { create: images.map((url, sortOrder) => ({ tenantId, url, sortOrder })) } : undefined }, include: { images: true, pricePlans: true, schedules: true } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "ACTIVITY_CREATED", entityType: "Activity", entityId: result.id, metadata: { name: result.name } } });
    return result;
  }

  async update(tenantId: string, id: string, dto: UpdateActivityDto) {
    await this.requireActivity(tenantId, id);
    await this.validateCatalogReferences(tenantId, dto.categoryId, dto.destinationId);
    const { images, ...data } = dto;
    const result = await this.prisma.activity.update({ where: { id }, data: { ...data, ...(dto.status === ActivityStatus.PUBLISHED ? { publishedAt: new Date() } : dto.status === ActivityStatus.DRAFT ? { publishedAt: null } : {}), ...(images ? { images: { deleteMany: {}, create: images.map((url, sortOrder) => ({ tenantId, url, sortOrder })) } } : {}) }, include: { images: true, pricePlans: true, schedules: true } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "ACTIVITY_UPDATED", entityType: "Activity", entityId: id } });
    return result;
  }

  private async validateCatalogReferences(tenantId: string, categoryId?: string, destinationId?: string) {
    if (categoryId && !(await this.prisma.category.findFirst({ where: { id: categoryId, tenantId }, select: { id: true } }))) throw new NotFoundException("Category not found for tenant");
    if (destinationId && !(await this.prisma.destination.findFirst({ where: { id: destinationId, tenantId }, select: { id: true } }))) throw new NotFoundException("Destination not found for tenant");
  }

  async publish(tenantId: string, id: string, status: ActivityStatus) {
    const current = await this.requireActivity(tenantId, id);
    const result = await this.prisma.activity.update({ where: { id }, data: { status, ...(status === ActivityStatus.PUBLISHED ? { publishedAt: current.publishedAt ?? new Date() } : status === ActivityStatus.DRAFT ? { publishedAt: null } : {}) } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "ACTIVITY_STATUS_CHANGED", entityType: "Activity", entityId: id, metadata: { status } } });
    return result;
  }

  async changeStatus(tenantId: string, id: string, status: ActivityStatus) { const current = await this.requireActivity(tenantId, id); const result = await this.prisma.activity.update({ where: { id }, data: { status, ...(status === ActivityStatus.PUBLISHED ? { publishedAt: current.publishedAt ?? new Date() } : status === ActivityStatus.DRAFT ? { publishedAt: null } : {}) } }); await this.prisma.auditLog.create({ data: { tenantId, action: "ACTIVITY_STATUS_CHANGED", entityType: "Activity", entityId: id, metadata: { status } } }); return result; }
  async archive(tenantId: string, id: string) { await this.requireActivity(tenantId, id); const result = await this.prisma.activity.update({ where: { id }, data: { status: ActivityStatus.ARCHIVED } }); await this.prisma.auditLog.create({ data: { tenantId, action: "ACTIVITY_ARCHIVED", entityType: "Activity", entityId: id } }); return result; }

  async createSchedule(tenantId: string, activityId: string, dto: CreateScheduleDto) {
    await this.requireActivity(tenantId, activityId);
    if (dto.variantId && !(await this.prisma.activityVariant.findFirst({ where: { id: dto.variantId, activityId, tenantId }, select: { id: true } }))) throw new NotFoundException("Variant not found for activity");
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("Schedule end must be after start");
    const result = await this.prisma.activitySchedule.create({ data: { tenantId, activityId, variantId: dto.variantId, startsAt, endsAt, capacity: dto.capacity, isBookable: dto.isBookable ?? true, cutoffMinutes: dto.cutoffMinutes ?? 0 } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SCHEDULE_CREATED", entityType: "ActivitySchedule", entityId: result.id } });
    return result;
  }

  async createPricePlan(tenantId: string, activityId: string, dto: CreatePricePlanDto) {
    await this.requireActivity(tenantId, activityId);
    if (dto.variantId && !(await this.prisma.activityVariant.findFirst({ where: { id: dto.variantId, activityId, tenantId }, select: { id: true } }))) throw new NotFoundException("Variant not found for activity");
    const result = await this.prisma.pricePlan.create({ data: { tenantId, activityId, ...dto } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "PRICE_PLAN_CREATED", entityType: "PricePlan", entityId: result.id } });
    return result;
  }

  async availability(tenantId: string, activityId: string) {
    const activity = await this.requireActivity(tenantId, activityId);
    return activity.schedules.map((schedule) => ({ ...schedule, availableSeats: Math.max(0, schedule.capacity - schedule.bookedSeats), holdSeats: 0 }));
  }

  async addBlackout(tenantId: string, scheduleId: string, dto: CreateBlackoutDto) {
    const schedule = await this.prisma.activitySchedule.findFirst({ where: { id: scheduleId, tenantId } });
    if (!schedule) throw new NotFoundException("Schedule not found");
    const result = await this.prisma.scheduleBlackout.create({ data: { tenantId, scheduleId, date: new Date(dto.date), reason: dto.reason } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SCHEDULE_BLACKOUT_CREATED", entityType: "ScheduleBlackout", entityId: result.id } });
    return result;
  }

  async createRecurringSchedule(tenantId: string, activityId: string, dto: CreateRecurringScheduleDto) {
    await this.requireActivity(tenantId, activityId);
    if (new Date(dto.endsOn) < new Date(dto.startsOn) || dto.weekdays.some((day) => day < 0 || day > 6)) throw new BadRequestException("Invalid recurrence window");
    const result = await this.prisma.recurringSchedule.create({ data: { tenantId, activityId, startsOn: new Date(dto.startsOn), endsOn: new Date(dto.endsOn), weekdays: dto.weekdays, startTime: dto.startTime, durationMinutes: dto.durationMinutes, capacity: dto.capacity } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "RECURRING_SCHEDULE_CREATED", entityType: "RecurringSchedule", entityId: result.id } });
    return result;
  }

  async generateRecurringDepartures(tenantId: string, recurringId: string) {
    const recurring = await this.prisma.recurringSchedule.findFirst({ where: { id: recurringId, tenantId } });
    if (!recurring) throw new NotFoundException("Recurring schedule not found");
    const blackouts = await this.prisma.scheduleBlackout.findMany({ where: { tenantId, date: { gte: recurring.startsOn, lte: recurring.endsOn }, schedule: { activityId: recurring.activityId } } });
    const blackoutDays = new Set(blackouts.map((item) => item.date.toISOString().slice(0, 10)));
    const created: string[] = [];
    for (let cursor = new Date(recurring.startsOn); cursor <= recurring.endsOn; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (!recurring.weekdays.includes(cursor.getUTCDay()) || blackoutDays.has(cursor.toISOString().slice(0, 10))) continue;
      const [hour, minute] = recurring.startTime.split(":").map(Number);
      const startsAt = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), hour, minute));
      const existing = await this.prisma.activitySchedule.findFirst({ where: { tenantId, activityId: recurring.activityId, startsAt } });
      if (!existing) { const schedule = await this.prisma.activitySchedule.create({ data: { tenantId, activityId: recurring.activityId, startsAt, endsAt: new Date(startsAt.getTime() + recurring.durationMinutes * 60000), capacity: recurring.capacity } }); created.push(schedule.id); }
    }
    return { createdCount: created.length, scheduleIds: created };
  }

  listCategories(tenantId: string) { return this.prisma.category.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 100 }); }
  async createCategory(tenantId: string, dto: CreateCategoryDto) { const result = await this.prisma.category.create({ data: { tenantId, ...dto } }); await this.prisma.auditLog.create({ data: { tenantId, action: "CATEGORY_CREATED", entityType: "Category", entityId: result.id } }); return result; }
  listDestinations(tenantId: string) { return this.prisma.destination.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 100 }); }
  async createDestination(tenantId: string, dto: CreateDestinationDto) { const result = await this.prisma.destination.create({ data: { tenantId, ...dto } }); await this.prisma.auditLog.create({ data: { tenantId, action: "DESTINATION_CREATED", entityType: "Destination", entityId: result.id } }); return result; }
  listVariants(tenantId: string, activityId: string) { return this.prisma.activityVariant.findMany({ where: { tenantId, activityId }, orderBy: { name: "asc" }, take: 100 }); }
  async createVariant(tenantId: string, activityId: string, dto: CreateVariantDto) { await this.requireActivity(tenantId, activityId); const result = await this.prisma.activityVariant.create({ data: { tenantId, activityId, ...dto } }); await this.prisma.auditLog.create({ data: { tenantId, action: "VARIANT_CREATED", entityType: "ActivityVariant", entityId: result.id } }); return result; }
  async listCancellationRules(tenantId: string, activityId: string) { await this.requireActivity(tenantId, activityId); return this.prisma.cancellationRule.findMany({ where: { tenantId, activityId }, orderBy: { hoursBefore: "desc" }, take: 100 }); }
  async createCancellationRule(tenantId: string, activityId: string, dto: CreateCancellationRuleDto) { await this.requireActivity(tenantId, activityId); const result = await this.prisma.cancellationRule.upsert({ where: { activityId_hoursBefore: { activityId, hoursBefore: dto.hoursBefore } }, update: { refundPercent: dto.refundPercent }, create: { tenantId, activityId, ...dto } }); await this.prisma.auditLog.create({ data: { tenantId, action: "CANCELLATION_RULE_UPDATED", entityType: "CancellationRule", entityId: result.id } }); return result; }

  async getById(tenantId: string, id: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, tenantId },
      include: {
        pricePlans: true,
        schedules: { orderBy: { startsAt: "asc" } },
        variants: { orderBy: { name: "asc" } },
        cancellationRules: { orderBy: { hoursBefore: "desc" } },
        bookings: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, reference: true, status: true, customerName: true, totalMinor: true, currency: true, createdAt: true, schedule: { select: { startsAt: true } } } }
      }
    });

    if (!activity) {
      throw new NotFoundException("Activity not found");
    }

    const auditHistory = await this.prisma.auditLog.findMany({ where: { tenantId, entityType: "Activity", entityId: id }, orderBy: { createdAt: "asc" }, take: 100 });
    return { ...activity, auditHistory };
  }

  private requireActivity(tenantId: string, id: string) {
    return this.prisma.activity.findFirst({ where: { id, tenantId }, include: { schedules: true } }).then((activity) => {
      if (!activity) throw new NotFoundException("Activity not found");
      return activity;
    });
  }
}
