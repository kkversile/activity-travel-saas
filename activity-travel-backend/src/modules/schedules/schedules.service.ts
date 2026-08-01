import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { paginated, parsePaginationQuery } from "../../common/pagination/pagination";
import { BulkGenerateScheduleDto, BulkScheduleStatusDto, CapacityAdjustmentDto, CreateScheduleDto, DuplicateScheduleDto, ScheduleQueryDto, UpdateScheduleDto } from "./dto/schedule.dto";

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ScheduleQueryDto) {
    const parsed = parsePaginationQuery(query, ["startsAt", "endsAt", "createdAt", "capacity"], "startsAt");
    const availabilityFilter = query.availabilityStatus === "INACTIVE" ? { isBookable: false } : query.availabilityStatus === "FULL" ? { isBookable: true, bookedSeats: { gte: this.prisma.activitySchedule.fields.capacity } } : query.availabilityStatus === "AVAILABLE" ? { isBookable: true, bookedSeats: { lt: this.prisma.activitySchedule.fields.capacity } } : {};
    const where = { tenantId, ...(query.destinationId || parsed.search ? { activity: { tenantId, ...(query.destinationId ? { destinationId: query.destinationId } : {}), ...(parsed.search ? { OR: [{ name: { contains: parsed.search, mode: "insensitive" as const } }, { destination: { contains: parsed.search, mode: "insensitive" as const } }] } : {}) } } : {}), ...(query.activityId ? { activityId: query.activityId } : {}), ...(query.variantId ? { variantId: query.variantId } : {}), ...availabilityFilter, ...(query.bookable === undefined ? {} : { isBookable: query.bookable }), ...(query.from || query.to ? { startsAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.activitySchedule.findMany({ where, include: { activity: { select: { id: true, name: true, destination: true } }, variant: { select: { id: true, name: true } }, _count: { select: { bookings: true, blackoutDates: true } } }, orderBy: { [parsed.sortBy]: parsed.sortOrder }, skip: (parsed.page - 1) * parsed.pageSize, take: parsed.pageSize }),
      this.prisma.activitySchedule.count({ where }),
    ]);
    const scheduleIds = data.map((schedule) => schedule.id);
    const holds = scheduleIds.length === 0 ? [] : await this.prisma.booking.findMany({ where: { tenantId, scheduleId: { in: scheduleIds }, status: "HOLD", holdExpiresAt: { gt: new Date() } }, select: { scheduleId: true, passengers: { select: { type: true } } } });
    const heldBySchedule = new Map<string, number>();
    for (const hold of holds) { const seats = hold.passengers.filter((passenger) => passenger.type !== "INFANT").length; heldBySchedule.set(hold.scheduleId, (heldBySchedule.get(hold.scheduleId) ?? 0) + seats); }
    const enriched = data.map((schedule) => { const heldSeats = heldBySchedule.get(schedule.id) ?? 0; return { ...schedule, heldSeats, confirmedSeats: Math.max(0, schedule.bookedSeats - heldSeats), availableSeats: Math.max(0, schedule.capacity - schedule.bookedSeats) }; });
    return paginated(enriched, parsed.page, parsed.pageSize, total);
  }

  async get(tenantId: string, id: string) {
    const result = await this.prisma.activitySchedule.findFirst({ where: { id, tenantId }, include: { activity: true, variant: true, blackoutDates: true } });
    if (!result) throw new NotFoundException("Schedule not found");
    return result;
  }

  async create(tenantId: string, dto: CreateScheduleDto) {
    const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, tenantId }, select: { id: true } });
    if (!activity) throw new NotFoundException("Activity not found");
    if (dto.variantId && !(await this.prisma.activityVariant.findFirst({ where: { id: dto.variantId, activityId: dto.activityId, tenantId }, select: { id: true } }))) throw new NotFoundException("Variant not found for activity");
    const startsAt = new Date(dto.startsAt); const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("Schedule end must be after start");
    const conflict = await this.prisma.activitySchedule.findFirst({ where: { tenantId, activityId: dto.activityId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (conflict) throw new ConflictException("Schedule overlaps an existing departure");
    const result = await this.prisma.activitySchedule.create({ data: { tenantId, activityId: dto.activityId, variantId: dto.variantId, startsAt, endsAt, timezone: dto.timezone ?? "UTC", capacity: dto.capacity, isBookable: dto.isBookable ?? true, cutoffMinutes: dto.cutoffMinutes ?? 0, scheduleType: dto.scheduleType ?? "ONE_TIME" } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SCHEDULE_CREATED", entityType: "ActivitySchedule", entityId: result.id, metadata: { activityId: dto.activityId, startsAt: startsAt.toISOString() } } });
    return result;
  }

  async bulkGenerate(tenantId: string, actorUserId: string | undefined, dto: BulkGenerateScheduleDto) {
    const activity = await this.prisma.activity.findFirst({ where: { id: dto.activityId, tenantId }, select: { id: true } });
    if (!activity) throw new NotFoundException("Activity not found");
    if (dto.variantId && !(await this.prisma.activityVariant.findFirst({ where: { id: dto.variantId, activityId: dto.activityId, tenantId }, select: { id: true } }))) throw new NotFoundException("Variant not found for activity");
    const firstStart = new Date(dto.startsAt); const firstEnd = new Date(dto.endsAt); if (firstEnd <= firstStart) throw new BadRequestException("Schedule end must be after start");
    const maxOccurrences = dto.occurrences ?? 100; const until = dto.until ? new Date(dto.until) : undefined; const duration = firstEnd.getTime() - firstStart.getTime(); const starts: Date[] = [];
    for (let index = 0; index < maxOccurrences; index += 1) { const start = new Date(firstStart); const days = dto.recurrence === "DAILY" ? index * dto.interval : index * dto.interval * 7; start.setUTCDate(start.getUTCDate() + days); if (until && start > until) break; starts.push(start); }
    const recurrenceGroupId = randomUUID(); const conflicts: Array<{ startsAt: string; reason: string }> = []; const candidates: Array<{ startsAt: Date; endsAt: Date }> = [];
    for (const startsAt of starts) { const endsAt = new Date(startsAt.getTime() + duration); const dayStart = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate())); const dayEnd = new Date(dayStart.getTime() + 86_400_000); const blackout = await this.prisma.blackoutDate.findFirst({ where: { tenantId, activityId: dto.activityId, date: { gte: dayStart, lt: dayEnd } } }); const conflict = await this.prisma.activitySchedule.findFirst({ where: { tenantId, activityId: dto.activityId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } }); if (blackout) conflicts.push({ startsAt: startsAt.toISOString(), reason: "BLACKOUT_DATE" }); else if (conflict) conflicts.push({ startsAt: startsAt.toISOString(), reason: "OVERLAPPING_SCHEDULE" }); else candidates.push({ startsAt, endsAt }); }
    if (dto.preview) return { preview: true, recurrenceGroupId, candidates: candidates.map((item) => ({ startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString() })), conflicts };
    const created = await this.prisma.$transaction(async (tx) => { const rows = await Promise.all(candidates.map((item) => tx.activitySchedule.create({ data: { tenantId, activityId: dto.activityId, variantId: dto.variantId, startsAt: item.startsAt, endsAt: item.endsAt, timezone: dto.timezone ?? "UTC", capacity: dto.capacity, isBookable: dto.isBookable ?? true, cutoffMinutes: dto.cutoffMinutes ?? 0, scheduleType: "RECURRING", recurrenceGroupId } }))); await tx.auditLog.create({ data: { tenantId, actorUserId, action: "SCHEDULES_BULK_GENERATED", entityType: "ActivitySchedule", entityId: recurrenceGroupId, metadata: { recurrence: dto.recurrence, interval: dto.interval, requested: starts.length, created: rows.length, conflicts: conflicts.length } } }); return rows; });
    return { preview: false, recurrenceGroupId, created, conflicts };
  }

  async update(tenantId: string, id: string, dto: UpdateScheduleDto) {
    const current = await this.get(tenantId, id);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt; const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    if (endsAt <= startsAt) throw new BadRequestException("Schedule end must be after start");
    if (dto.capacity !== undefined && dto.capacity < current.bookedSeats) throw new BadRequestException("Capacity cannot be lower than booked seats");
    if (dto.variantId && !(await this.prisma.activityVariant.findFirst({ where: { id: dto.variantId, activityId: current.activityId, tenantId }, select: { id: true } }))) throw new NotFoundException("Variant not found for activity");
    const conflict = await this.prisma.activitySchedule.findFirst({ where: { tenantId, activityId: current.activityId, id: { not: id }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
    if (conflict) throw new ConflictException("Schedule overlaps an existing departure");
    const result = await this.prisma.activitySchedule.update({ where: { id }, data: { variantId: dto.variantId, startsAt, endsAt, timezone: dto.timezone, capacity: dto.capacity, isBookable: dto.isBookable, cutoffMinutes: dto.cutoffMinutes } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SCHEDULE_UPDATED", entityType: "ActivitySchedule", entityId: id } });
    return result;
  }

  async adjustCapacity(tenantId: string, actorUserId: string | undefined, id: string, dto: CapacityAdjustmentDto) {
    const current = await this.get(tenantId, id);
    if (!dto.reason.trim()) throw new BadRequestException("Capacity adjustment reason is required");
    if (dto.capacity < current.bookedSeats) throw new BadRequestException("Capacity cannot be lower than booked seats");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.activitySchedule.update({ where: { id }, data: { capacity: dto.capacity } });
      await tx.auditLog.create({ data: { tenantId, actorUserId, action: "SCHEDULE_CAPACITY_ADJUSTED", entityType: "ActivitySchedule", entityId: id, metadata: { previousCapacity: current.capacity, capacity: dto.capacity, reason: dto.reason.trim() } } });
      return updated;
    });
  }

  async bulkStatus(tenantId: string, actorUserId: string | undefined, dto: BulkScheduleStatusDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.activitySchedule.updateMany({ where: { id: { in: dto.ids }, activity: { tenantId }, ...(dto.isBookable ? {} : { bookedSeats: 0 }) }, data: { isBookable: dto.isBookable } });
      await tx.auditLog.create({ data: { tenantId, actorUserId, action: dto.isBookable ? "SCHEDULES_BULK_ACTIVATED" : "SCHEDULES_BULK_DEACTIVATED", entityType: "ActivitySchedule", metadata: { requested: dto.ids.length, updated: updated.count } } });
      return updated.count;
    });
    return { updated: result, requested: dto.ids.length, isBookable: dto.isBookable };
  }

  async duplicate(tenantId: string, actorUserId: string | undefined, id: string, dto: DuplicateScheduleDto) {
    const current = await this.get(tenantId, id);
    const startsAt = new Date(dto.startsAt); const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("Schedule end must be after start");
    const conflict = await this.prisma.activitySchedule.findFirst({ where: { tenantId, activityId: current.activityId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
    if (conflict) throw new ConflictException("Duplicate schedule overlaps an existing departure");
    const duplicate = await this.prisma.activitySchedule.create({ data: { tenantId, activityId: current.activityId, variantId: current.variantId, startsAt, endsAt, timezone: current.timezone, capacity: current.capacity, isBookable: current.isBookable, cutoffMinutes: current.cutoffMinutes, scheduleType: "ONE_TIME" } });
    await this.prisma.auditLog.create({ data: { tenantId, actorUserId, action: "SCHEDULE_DUPLICATED", entityType: "ActivitySchedule", entityId: duplicate.id, metadata: { sourceScheduleId: id } } });
    return duplicate;
  }

  async remove(tenantId: string, id: string) {
    const current = await this.get(tenantId, id);
    if (current.bookedSeats > 0) throw new ConflictException("Schedule with bookings cannot be deleted");
    await this.prisma.activitySchedule.update({ where: { id }, data: { isBookable: false } });
    await this.prisma.auditLog.create({ data: { tenantId, action: "SCHEDULE_ARCHIVED", entityType: "ActivitySchedule", entityId: id } });
    return { success: true };
  }
}
