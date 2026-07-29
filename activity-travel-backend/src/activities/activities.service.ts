import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateActivityDto, CreateBlackoutDto, CreateCancellationRuleDto, CreateCategoryDto, CreateDestinationDto, CreatePricePlanDto, CreateRecurringScheduleDto, CreateScheduleDto, CreateVariantDto, UpdateActivityDto } from "./dto/activity.dto";

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, options: { page?: number; pageSize?: number; search?: string; status?: ActivityStatus } = {}) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    return this.prisma.activity.findMany({
      where: {
        tenantId,
        status: options.status ?? ActivityStatus.PUBLISHED,
        ...(options.search ? { OR: [{ name: { contains: options.search, mode: "insensitive" } }, { destination: { contains: options.search, mode: "insensitive" } }] } : {})
      },
      include: {
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
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
  }

  async create(tenantId: string, dto: CreateActivityDto) {
    const { images, ...data } = dto;
    return this.prisma.activity.create({ data: { ...data, tenantId, images: images ? { create: images.map((url, sortOrder) => ({ url, sortOrder })) } : undefined }, include: { images: true, pricePlans: true, schedules: true } });
  }

  async update(tenantId: string, id: string, dto: UpdateActivityDto) {
    await this.requireActivity(tenantId, id);
    const { images, ...data } = dto;
    return this.prisma.activity.update({ where: { id }, data: { ...data, ...(images ? { images: { deleteMany: {}, create: images.map((url, sortOrder) => ({ url, sortOrder })) } } : {}) }, include: { images: true, pricePlans: true, schedules: true } });
  }

  async publish(tenantId: string, id: string, status: ActivityStatus) {
    await this.requireActivity(tenantId, id);
    return this.prisma.activity.update({ where: { id }, data: { status } });
  }

  async createSchedule(tenantId: string, activityId: string, dto: CreateScheduleDto) {
    await this.requireActivity(tenantId, activityId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("Schedule end must be after start");
    return this.prisma.activitySchedule.create({ data: { activityId, startsAt, endsAt, capacity: dto.capacity, isBookable: dto.isBookable ?? true, cutoffMinutes: dto.cutoffMinutes ?? 0 } });
  }

  async createPricePlan(tenantId: string, activityId: string, dto: CreatePricePlanDto) {
    await this.requireActivity(tenantId, activityId);
    return this.prisma.pricePlan.create({ data: { activityId, ...dto } });
  }

  async availability(tenantId: string, activityId: string) {
    const activity = await this.requireActivity(tenantId, activityId);
    return activity.schedules.map((schedule) => ({ ...schedule, availableSeats: Math.max(0, schedule.capacity - schedule.bookedSeats), holdSeats: 0 }));
  }

  async addBlackout(tenantId: string, scheduleId: string, dto: CreateBlackoutDto) {
    const schedule = await this.prisma.activitySchedule.findFirst({ where: { id: scheduleId, activity: { tenantId } } });
    if (!schedule) throw new NotFoundException("Schedule not found");
    return this.prisma.scheduleBlackout.create({ data: { scheduleId, date: new Date(dto.date), reason: dto.reason } });
  }

  async createRecurringSchedule(tenantId: string, activityId: string, dto: CreateRecurringScheduleDto) {
    await this.requireActivity(tenantId, activityId);
    if (new Date(dto.endsOn) < new Date(dto.startsOn) || dto.weekdays.some((day) => day < 0 || day > 6)) throw new BadRequestException("Invalid recurrence window");
    return this.prisma.recurringSchedule.create({ data: { activityId, startsOn: new Date(dto.startsOn), endsOn: new Date(dto.endsOn), weekdays: dto.weekdays, startTime: dto.startTime, durationMinutes: dto.durationMinutes, capacity: dto.capacity } });
  }

  async generateRecurringDepartures(tenantId: string, recurringId: string) {
    const recurring = await this.prisma.recurringSchedule.findFirst({ where: { id: recurringId, activity: { tenantId } } });
    if (!recurring) throw new NotFoundException("Recurring schedule not found");
    const blackouts = await this.prisma.scheduleBlackout.findMany({ where: { schedule: { activityId: recurring.activityId }, date: { gte: recurring.startsOn, lte: recurring.endsOn } } });
    const blackoutDays = new Set(blackouts.map((item) => item.date.toISOString().slice(0, 10)));
    const created: string[] = [];
    for (let cursor = new Date(recurring.startsOn); cursor <= recurring.endsOn; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (!recurring.weekdays.includes(cursor.getUTCDay()) || blackoutDays.has(cursor.toISOString().slice(0, 10))) continue;
      const [hour, minute] = recurring.startTime.split(":").map(Number);
      const startsAt = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), hour, minute));
      const existing = await this.prisma.activitySchedule.findFirst({ where: { activityId: recurring.activityId, startsAt } });
      if (!existing) { const schedule = await this.prisma.activitySchedule.create({ data: { activityId: recurring.activityId, startsAt, endsAt: new Date(startsAt.getTime() + recurring.durationMinutes * 60000), capacity: recurring.capacity } }); created.push(schedule.id); }
    }
    return { createdCount: created.length, scheduleIds: created };
  }

  listCategories(tenantId: string) { return this.prisma.category.findMany({ where: { tenantId }, orderBy: { name: "asc" } }); }
  createCategory(tenantId: string, dto: CreateCategoryDto) { return this.prisma.category.create({ data: { tenantId, ...dto } }); }
  listDestinations(tenantId: string) { return this.prisma.destination.findMany({ where: { tenantId }, orderBy: { name: "asc" } }); }
  createDestination(tenantId: string, dto: CreateDestinationDto) { return this.prisma.destination.create({ data: { tenantId, ...dto } }); }
  listVariants(tenantId: string, activityId: string) { return this.prisma.activityVariant.findMany({ where: { activityId, activity: { tenantId } }, orderBy: { name: "asc" } }); }
  async createVariant(tenantId: string, activityId: string, dto: CreateVariantDto) { await this.requireActivity(tenantId, activityId); return this.prisma.activityVariant.create({ data: { activityId, ...dto } }); }
  async listCancellationRules(tenantId: string, activityId: string) { await this.requireActivity(tenantId, activityId); return this.prisma.cancellationRule.findMany({ where: { activityId }, orderBy: { hoursBefore: "desc" } }); }
  async createCancellationRule(tenantId: string, activityId: string, dto: CreateCancellationRuleDto) { await this.requireActivity(tenantId, activityId); return this.prisma.cancellationRule.upsert({ where: { activityId_hoursBefore: { activityId, hoursBefore: dto.hoursBefore } }, update: { refundPercent: dto.refundPercent }, create: { activityId, ...dto } }); }

  async getById(tenantId: string, id: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, tenantId },
      include: {
        pricePlans: true,
        schedules: { orderBy: { startsAt: "asc" } }
      }
    });

    if (!activity) {
      throw new NotFoundException("Activity not found");
    }

    return activity;
  }

  private requireActivity(tenantId: string, id: string) {
    return this.prisma.activity.findFirst({ where: { id, tenantId }, include: { schedules: true } }).then((activity) => {
      if (!activity) throw new NotFoundException("Activity not found");
      return activity;
    });
  }
}
