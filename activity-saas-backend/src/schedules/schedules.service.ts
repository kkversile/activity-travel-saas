import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OperatingModel, Prisma, ScheduleStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { requireTenant } from '../common/tenant';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto, MaterializeSessionsDto, RatePlanScheduleDto, ResourceRequirementDto, ScheduleExceptionDto, ScheduleSlotDto, UpdateResourceRequirementDto, UpdateScheduleDto, UpdateScheduleSlotDto } from './schedules.dto';
import { assertTime, isoDate, validateTimezone } from './schedule-utils';
import { SessionMaterializerService } from './session-materializer.service';
import { ScheduleOperationalStateService } from './schedule-operational-state.service';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly materializer: SessionMaterializerService, private readonly operational: ScheduleOperationalStateService) {}

  private readonly include = {
    variant: { include: { product: true } },
    slotTemplates: { where: { archivedAt: null }, orderBy: { rank: 'asc' as const } },
    ratePlanMappings: { where: { active: true }, include: { ratePlan: { select: { id: true, ratePlanCode: true, name: true } } } },
    resourceRequirements: { where: { archivedAt: null }, include: { specificResource: true } },
    exceptions: { where: { archivedAt: null }, orderBy: { serviceDate: 'asc' as const } },
  };

  private conflict() { return new ConflictException('Schedule changed; reload and retry.'); }

  private async ownedSchedule(user: AuthUser, id: string, client: any = this.prisma) {
    const tenantId = requireTenant(user);
    const schedule = await client.scheduleTemplate.findFirst({ where: { id, variant: { product: { tenantId } } }, include: this.include });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  list(user: AuthUser, variantId: string) {
    const tenantId = requireTenant(user);
    return this.prisma.scheduleTemplate.findMany({ where: { variantId, variant: { product: { tenantId } } }, include: this.include, orderBy: { createdAt: 'desc' } });
  }

  async create(user: AuthUser, variantId: string, dto: CreateScheduleDto) {
    const tenantId = requireTenant(user); validateTimezone(dto.timezone);
    const from = isoDate(dto.effectiveFrom); const to = dto.effectiveTo ? isoDate(dto.effectiveTo) : null;
    if (to && to < from) throw new ConflictException('effectiveTo must be on or after effectiveFrom');
    try {
      return await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({ where: { id: variantId, product: { tenantId } } });
      if (!variant) throw new NotFoundException('Product variant not found');
      this.validateSlots(dto.operatingModel, dto.slots ?? [], variant.durationMinutes);
      const schedule = await tx.scheduleTemplate.create({ data: { variantId, scheduleCode: dto.scheduleCode.trim(), name: dto.name.trim(), operatingModel: dto.operatingModel, timezone: dto.timezone, effectiveFrom: from, effectiveTo: to, operatingDays: dto.operatingDays.map((day) => day.toUpperCase()), capacityUnit: dto.capacityUnit, capacityUnitReviewRequired: false, defaultCapacity: dto.defaultCapacity, slotTemplates: dto.slots?.length ? { create: dto.slots.map((slot, index) => this.slotData(slot, index)) } : undefined }, include: { slotTemplates: true } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_CREATED', entityType: 'ScheduleTemplate', entityId: schedule.id, afterState: schedule });
      await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_CREATED', aggregateType: 'ScheduleTemplate', aggregateId: schedule.id, payload: { variantId } });
      return schedule;
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A schedule with this scheduleCode already exists for the variant');
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateScheduleDto) {
    const tenantId = requireTenant(user); const existing = await this.ownedSchedule(user, id);
    if (existing.status === ScheduleStatus.ARCHIVED) throw new ConflictException('Archived schedules are immutable');
    if (dto.expectedVersion == null) throw new ConflictException('Schedule expectedVersion is required');
    const structural = dto.operatingModel !== undefined || dto.timezone !== undefined || dto.effectiveFrom !== undefined || dto.effectiveTo !== undefined || dto.operatingDays !== undefined || dto.capacityUnit !== undefined || dto.defaultCapacity !== undefined;
    if (existing.status === ScheduleStatus.ACTIVE && structural) throw new ConflictException('Deactivate an ACTIVE schedule before changing its operating definition');
    if (dto.timezone) validateTimezone(dto.timezone);
    const from = dto.effectiveFrom ? isoDate(dto.effectiveFrom) : existing.effectiveFrom; const to = dto.effectiveTo ? isoDate(dto.effectiveTo) : existing.effectiveTo;
    if (to && to < from) throw new ConflictException('effectiveTo must be on or after effectiveFrom');
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockSchedule(tx, id, tenantId); if (current.version !== dto.expectedVersion) throw this.conflict();
      const data: any = { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.operatingModel !== undefined ? { operatingModel: dto.operatingModel } : {}), ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}), ...(dto.effectiveFrom !== undefined ? { effectiveFrom: from } : {}), ...(dto.effectiveTo !== undefined ? { effectiveTo: to } : {}), ...(dto.operatingDays !== undefined ? { operatingDays: dto.operatingDays.map((day) => day.toUpperCase()) } : {}), ...(dto.capacityUnit !== undefined ? { capacityUnit: dto.capacityUnit, capacityUnitReviewRequired: false } : {}), ...(dto.defaultCapacity !== undefined ? { defaultCapacity: dto.defaultCapacity } : {}), ...(dto.confirmCapacityUnit ? { capacityUnitReviewRequired: false } : {}), version: { increment: 1 } };
      const result = await tx.scheduleTemplate.updateMany({ where: { id, version: dto.expectedVersion }, data }); if (result.count !== 1) throw this.conflict();
      const saved = await tx.scheduleTemplate.findUniqueOrThrow({ where: { id } });
      await this.audit.write(tx, { actor: user, tenantId, action: dto.capacityUnit !== undefined || dto.confirmCapacityUnit ? 'SCHEDULE_CAPACITY_UNIT_CONFIRMED' : 'SCHEDULE_UPDATED', entityType: 'ScheduleTemplate', entityId: id, beforeState: current, afterState: saved, metadata: dto.capacityUnit !== undefined || dto.confirmCapacityUnit ? { confirmedAt: new Date().toISOString() } : undefined });
      await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_UPDATED', aggregateType: 'ScheduleTemplate', aggregateId: id, payload: { version: saved.version } });
      return saved;
    });
  }

  activate(user: AuthUser, id: string, expectedVersion: number) { return this.changeStatus(user, id, ScheduleStatus.ACTIVE, 'SCHEDULE_ACTIVATED', expectedVersion); }
  deactivate(user: AuthUser, id: string, expectedVersion: number) { return this.changeStatus(user, id, ScheduleStatus.INACTIVE, 'SCHEDULE_DEACTIVATED', expectedVersion); }
  archive(user: AuthUser, id: string, expectedVersion: number) { return this.changeStatus(user, id, ScheduleStatus.ARCHIVED, 'SCHEDULE_ARCHIVED', expectedVersion, true); }

  private async changeStatus(user: AuthUser, id: string, status: ScheduleStatus, action: string, expectedVersion: number, archive = false) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const schedule = await this.lockSchedule(tx, id, tenantId); if (schedule.version !== expectedVersion) throw this.conflict();
      if (schedule.status === ScheduleStatus.ARCHIVED) throw new ConflictException('Archived schedules are immutable');
      if (status === ScheduleStatus.ACTIVE) { this.validateActivation(schedule); await this.validateResourceRequirements(schedule, tenantId, tx); }
      const result = await tx.scheduleTemplate.updateMany({ where: { id, version: expectedVersion }, data: { status, ...(archive ? { archivedAt: new Date() } : { archivedAt: null }), version: { increment: 1 } } }); if (result.count !== 1) throw this.conflict();
      const saved = await tx.scheduleTemplate.findUniqueOrThrow({ where: { id } });
      await this.audit.write(tx, { actor: user, tenantId, action, entityType: 'ScheduleTemplate', entityId: id, beforeState: schedule, afterState: saved });
      await this.outbox.enqueue(tx, { tenantId, eventType: action, aggregateType: 'ScheduleTemplate', aggregateId: id, payload: { status } });
      return saved;
    });
  }

  async addSlot(user: AuthUser, id: string, dto: ScheduleSlotDto) {
    const tenantId = requireTenant(user); if (dto.expectedVersion == null) throw new ConflictException('Schedule expectedVersion is required');
    return this.prisma.$transaction(async (tx) => {
      const schedule = await this.lockSchedule(tx, id, tenantId); this.assertMutable(schedule); if (schedule.version !== dto.expectedVersion) throw this.conflict();
      const slots = await tx.scheduleSlotTemplate.findMany({ where: { scheduleTemplateId: id, archivedAt: null } }); this.validateSlots(schedule.operatingModel, [...slots, dto as any], schedule.variant.durationMinutes);
      const slot = await tx.scheduleSlotTemplate.create({ data: { scheduleTemplateId: id, ...this.slotData(dto, slots.length) } });
      await tx.scheduleTemplate.updateMany({ where: { id, version: dto.expectedVersion }, data: { version: { increment: 1 } } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_SLOT_CREATED', entityType: 'ScheduleSlotTemplate', entityId: slot.id });
      await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_SLOT_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: id, payload: { slotId: slot.id } }); return slot;
    });
  }

  async updateSlot(user: AuthUser, id: string, dto: UpdateScheduleSlotDto) {
    const tenantId = requireTenant(user); if (dto.expectedVersion == null) throw new ConflictException('Schedule expectedVersion is required');
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.scheduleSlotTemplate.findFirst({ where: { id, archivedAt: null, scheduleTemplate: { variant: { product: { tenantId } } } }, include: { scheduleTemplate: { include: { variant: true } } } }); if (!slot) throw new NotFoundException('Schedule slot not found');
      const schedule = await this.lockSchedule(tx, slot.scheduleTemplateId, tenantId); this.assertMutable(schedule); if (schedule.version !== dto.expectedVersion) throw this.conflict();
      const all = await tx.scheduleSlotTemplate.findMany({ where: { scheduleTemplateId: schedule.id, archivedAt: null } }); const proposed = all.map((item: any) => item.id === id ? { ...item, ...dto } : item); this.validateSlots(schedule.operatingModel, proposed, schedule.variant.durationMinutes);
      const saved = await tx.scheduleSlotTemplate.update({ where: { id }, data: { ...(dto.label !== undefined ? { label: dto.label } : {}), ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}), ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}), ...(dto.rank !== undefined ? { rank: dto.rank } : {}), ...(dto.active !== undefined ? { active: dto.active } : {}) } });
      await tx.scheduleTemplate.updateMany({ where: { id: schedule.id, version: dto.expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_SLOT_UPDATED', entityType: 'ScheduleSlotTemplate', entityId: id, beforeState: slot, afterState: saved }); await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_SLOT_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: schedule.id, payload: { slotId: id } }); return saved;
    });
  }

  async archiveSlot(user: AuthUser, id: string, expectedVersion: number) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.scheduleSlotTemplate.findFirst({ where: { id, archivedAt: null, scheduleTemplate: { variant: { product: { tenantId } } } } }); if (!slot) throw new NotFoundException('Schedule slot not found');
      const schedule = await this.lockSchedule(tx, slot.scheduleTemplateId, tenantId); this.assertMutable(schedule); if (schedule.version !== expectedVersion) throw this.conflict(); const remaining = await tx.scheduleSlotTemplate.findMany({ where: { scheduleTemplateId: schedule.id, archivedAt: null, id: { not: id } } }); this.validateSlots(schedule.operatingModel, remaining, schedule.variant.durationMinutes);
      const saved = await tx.scheduleSlotTemplate.update({ where: { id }, data: { active: false, archivedAt: new Date() } }); await tx.scheduleTemplate.updateMany({ where: { id: schedule.id, version: expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_SLOT_ARCHIVED', entityType: 'ScheduleSlotTemplate', entityId: id, beforeState: slot, afterState: saved }); await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_SLOT_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: schedule.id, payload: { slotId: id } }); return saved;
    });
  }

  async mapRatePlan(user: AuthUser, id: string, dto: RatePlanScheduleDto) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const schedule = await this.lockSchedule(tx, id, tenantId); if (schedule.version !== dto.expectedVersion) throw this.conflict(); const plan = await tx.ratePlan.findFirst({ where: { id: dto.ratePlanId, variant: { product: { tenantId } } } }); if (!plan) throw new NotFoundException('Rate plan not found'); if (plan.variantId !== schedule.variantId) throw new ConflictException('Rate plan and schedule must belong to the same variant');
      const mapping = await tx.ratePlanSchedule.upsert({ where: { ratePlanId_scheduleTemplateId: { ratePlanId: plan.id, scheduleTemplateId: id } }, update: { active: true }, create: { ratePlanId: plan.id, scheduleTemplateId: id } }); await tx.scheduleTemplate.updateMany({ where: { id, version: dto.expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: 'RATEPLAN_SCHEDULE_MAPPED', entityType: 'RatePlanSchedule', entityId: mapping.id }); await this.outbox.enqueue(tx, { tenantId, eventType: 'RATEPLAN_SCHEDULE_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: id, payload: { ratePlanId: plan.id, active: true } }); return mapping;
    });
  }

  async unmapRatePlan(user: AuthUser, id: string, ratePlanId: string, expectedVersion: number) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => { const schedule = await this.lockSchedule(tx, id, tenantId); if (schedule.version !== expectedVersion) throw this.conflict(); const mapping = await tx.ratePlanSchedule.findFirst({ where: { scheduleTemplateId: id, ratePlanId, active: true } }); if (!mapping) throw new NotFoundException('Rate plan mapping not found'); const saved = await tx.ratePlanSchedule.update({ where: { id: mapping.id }, data: { active: false } }); await tx.scheduleTemplate.updateMany({ where: { id, version: expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: 'RATEPLAN_SCHEDULE_DEACTIVATED', entityType: 'RatePlanSchedule', entityId: mapping.id }); await this.outbox.enqueue(tx, { tenantId, eventType: 'RATEPLAN_SCHEDULE_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: id, payload: { ratePlanId, active: false } }); return saved; });
  }

  async addException(user: AuthUser, id: string, dto: ScheduleExceptionDto) {
    const tenantId = requireTenant(user); const serviceDate = isoDate(dto.serviceDate);
    return this.prisma.$transaction(async (tx) => { const schedule = await this.lockSchedule(tx, id, tenantId); if (schedule.version !== dto.expectedVersion) throw this.conflict(); if (dto.slotTemplateId && !(await tx.scheduleSlotTemplate.findFirst({ where: { id: dto.slotTemplateId, scheduleTemplateId: id, archivedAt: null } }))) throw new ConflictException('Slot does not belong to schedule'); const exceptionKey = this.operational.exceptionKey(id, serviceDate, dto.slotTemplateId); const previous = await tx.scheduleException.findUnique({ where: { exceptionKey } }); const exception = await this.operational.setException(tx, { scheduleTemplateId: id, serviceDate, slotTemplateId: dto.slotTemplateId, type: dto.type, reason: dto.reason }); await tx.scheduleTemplate.updateMany({ where: { id, version: dto.expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: dto.type === 'BLACKOUT' ? 'SCHEDULE_BLACKOUT_CREATED' : 'SCHEDULE_CLOSED_EXCEPTION_CREATED', entityType: 'ScheduleException', entityId: exception.id, beforeState: previous, afterState: exception }); await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_EXCEPTION_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: id, payload: { exceptionId: exception.id, type: dto.type } }); return exception; });
  }

  async archiveException(user: AuthUser, id: string, expectedVersion?: number) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => { const exception = await tx.scheduleException.findFirst({ where: { id, scheduleTemplate: { variant: { product: { tenantId } } }, archivedAt: null } }); if (!exception) throw new NotFoundException('Schedule exception not found'); const schedule = await this.lockSchedule(tx, exception.scheduleTemplateId, tenantId); if (expectedVersion == null || schedule.version !== expectedVersion) throw this.conflict(); const saved = await tx.scheduleException.update({ where: { id }, data: { archivedAt: new Date() } }); await this.operational.reconcileSessions(tx, schedule.id, exception.serviceDate, exception.slotTemplateId); await tx.scheduleTemplate.updateMany({ where: { id: schedule.id, version: expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_EXCEPTION_ARCHIVED', entityType: 'ScheduleException', entityId: id, beforeState: exception, afterState: saved }); await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_EXCEPTION_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: schedule.id, payload: { exceptionId: id, archived: true } }); return saved; });
  }

  async addRequirement(user: AuthUser, id: string, dto: ResourceRequirementDto) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => { const schedule = await this.lockSchedule(tx, id, tenantId); this.assertMutable(schedule); if (schedule.version !== dto.expectedVersion) throw this.conflict(); await this.validateRequirement(tx, tenantId, dto); const key = `${id}:${dto.resourceType}:${dto.specificResourceId ?? 'ANY'}`; const requirement = await tx.scheduleResourceRequirement.upsert({ where: { requirementKey: key }, update: { quantity: dto.quantity ?? 1, required: dto.required ?? true, active: true, archivedAt: null, version: { increment: 1 } }, create: { scheduleTemplateId: id, resourceType: dto.resourceType, specificResourceId: dto.specificResourceId, quantity: dto.quantity ?? 1, required: dto.required ?? true, requirementKey: key } }); await tx.scheduleTemplate.updateMany({ where: { id, version: dto.expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_RESOURCE_REQUIREMENT_UPDATED', entityType: 'ScheduleResourceRequirement', entityId: requirement.id, afterState: requirement }); await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_RESOURCE_REQUIREMENT_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: id, payload: { requirementId: requirement.id } }); return requirement; });
  }

  async updateRequirement(user: AuthUser, requirementId: string, dto: UpdateResourceRequirementDto) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.scheduleResourceRequirement.findFirst({ where: { id: requirementId, archivedAt: null, scheduleTemplate: { variant: { product: { tenantId } } } } });
      if (!existing) throw new NotFoundException('Resource requirement not found');
      const schedule = await this.lockSchedule(tx, existing.scheduleTemplateId, tenantId); this.assertMutable(schedule); if (schedule.version !== dto.expectedVersion) throw this.conflict();
      const next = { resourceType: dto.resourceType ?? existing.resourceType, specificResourceId: dto.specificResourceId === undefined ? existing.specificResourceId : dto.specificResourceId, quantity: dto.quantity ?? existing.quantity, required: dto.required ?? existing.required };
      await this.validateRequirement(tx, tenantId, next as any);
      const requirementKey = `${existing.scheduleTemplateId}:${next.resourceType}:${next.specificResourceId ?? 'ANY'}`;
      const duplicate = await tx.scheduleResourceRequirement.findFirst({ where: { requirementKey, id: { not: requirementId }, archivedAt: null } }); if (duplicate) throw new ConflictException('RESOURCE_REQUIREMENT_DUPLICATE');
      const saved = await tx.scheduleResourceRequirement.update({ where: { id: requirementId }, data: { resourceType: next.resourceType, specificResourceId: next.specificResourceId, quantity: next.quantity, required: next.required, requirementKey, version: { increment: 1 } } });
      await tx.scheduleTemplate.updateMany({ where: { id: schedule.id, version: dto.expectedVersion }, data: { version: { increment: 1 } } });
      await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_RESOURCE_REQUIREMENT_UPDATED', entityType: 'ScheduleResourceRequirement', entityId: requirementId, beforeState: existing, afterState: saved }); await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_RESOURCE_REQUIREMENT_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: schedule.id, payload: { requirementId } }); return saved;
    });
  }

  async archiveRequirement(user: AuthUser, id: string, expectedVersion: number) {
    const tenantId = requireTenant(user);
    return this.prisma.$transaction(async (tx) => { const requirement = await tx.scheduleResourceRequirement.findFirst({ where: { id, scheduleTemplate: { variant: { product: { tenantId } } }, archivedAt: null } }); if (!requirement) throw new NotFoundException('Resource requirement not found'); const schedule = await this.lockSchedule(tx, requirement.scheduleTemplateId, tenantId); this.assertMutable(schedule); if (schedule.version !== expectedVersion) throw this.conflict(); const saved = await tx.scheduleResourceRequirement.update({ where: { id }, data: { active: false, archivedAt: new Date(), version: { increment: 1 } } }); await tx.scheduleTemplate.updateMany({ where: { id: schedule.id, version: expectedVersion }, data: { version: { increment: 1 } } }); await this.audit.write(tx, { actor: user, tenantId, action: 'SCHEDULE_RESOURCE_REQUIREMENT_ARCHIVED', entityType: 'ScheduleResourceRequirement', entityId: id, beforeState: requirement, afterState: saved }); await this.outbox.enqueue(tx, { tenantId, eventType: 'SCHEDULE_RESOURCE_REQUIREMENT_CHANGED', aggregateType: 'ScheduleTemplate', aggregateId: schedule.id, payload: { requirementId: id, archived: true } }); return saved; });
  }

  materialize(user: AuthUser, id: string, dto: MaterializeSessionsDto) { requireTenant(user); return this.ownedSchedule(user, id).then(() => this.materializer.materialize(id, dto)); }

  private async lockSchedule(tx: any, id: string, tenantId: string) { const rows = await tx.$queryRawUnsafe(`SELECT s.* FROM "ScheduleTemplate" s JOIN "ProductVariant" v ON v."id" = s."variantId" JOIN "Product" p ON p."id" = v."productId" WHERE s."id" = $1 AND p."tenantId" = $2 FOR UPDATE`, id, tenantId) as any[]; if (!rows[0]) throw new NotFoundException('Schedule not found'); return tx.scheduleTemplate.findUniqueOrThrow({ where: { id }, include: { variant: true, slotTemplates: { where: { archivedAt: null }, orderBy: { rank: 'asc' } }, resourceRequirements: { where: { archivedAt: null }, include: { specificResource: true } } } }); }
  private assertMutable(schedule: any) { if (schedule.status === ScheduleStatus.ARCHIVED) throw new ConflictException('Archived schedules are immutable'); if (schedule.status === ScheduleStatus.ACTIVE) throw new ConflictException('Deactivate an ACTIVE schedule before changing its operating definition'); }
  private async validateRequirement(tx: any, tenantId: string, dto: ResourceRequirementDto) { if ((dto.quantity ?? 1) < 1) throw new ConflictException('RESOURCE_REQUIREMENT_QUANTITY_INVALID'); if (dto.specificResourceId) { const resource = await tx.resource.findFirst({ where: { id: dto.specificResourceId, tenantId } }); if (!resource || resource.type !== dto.resourceType || !resource.active || resource.archivedAt) throw new ConflictException('RESOURCE_REQUIREMENT_INVALID'); } }
  private async validateResourceRequirements(schedule: any, tenantId: string, tx: any) { for (const requirement of schedule.resourceRequirements ?? []) await this.validateRequirement(tx, tenantId, requirement); }
  private slotData(slot: ScheduleSlotDto, index: number) { if (slot.startTime) assertTime(slot.startTime, 'startTime'); if (slot.endTime) assertTime(slot.endTime, 'endTime'); return { slotCode: slot.slotCode.trim(), label: slot.label, startTime: slot.startTime, endTime: slot.endTime, rank: slot.rank ?? index }; }
  private validateSlots(model: OperatingModel | undefined, slots: any[], durationMinutes?: number | null) { const active = slots.filter((slot) => slot.active !== false && !slot.archivedAt); if (!model) return; if (model === OperatingModel.FIXED_SLOT && active.length !== 1) throw new ConflictException('FIXED_SLOT requires exactly one active slot'); if (model === OperatingModel.MULTIPLE_SLOTS && active.length < 1) throw new ConflictException('MULTIPLE_SLOTS requires at least one active slot'); if (([OperatingModel.ALL_DAY, OperatingModel.DATE_CAPACITY, OperatingModel.ON_REQUEST_DATE] as OperatingModel[]).includes(model) && active.length) throw new ConflictException(`${model} cannot expose public slots`); if (([OperatingModel.FIXED_SLOT, OperatingModel.MULTIPLE_SLOTS] as OperatingModel[]).includes(model)) for (const slot of active) { assertTime(slot.startTime, 'startTime'); if (slot.endTime) assertTime(slot.endTime, 'endTime'); if (!slot.endTime && durationMinutes == null) throw new ConflictException('SESSION_DURATION_MISSING'); } }
  private validateActivation(schedule: any) { if (!schedule.operatingModel) throw new ConflictException('OPERATING_MODEL_MISSING'); validateTimezone(schedule.timezone); if (!schedule.effectiveFrom || (schedule.effectiveTo && schedule.effectiveTo < schedule.effectiveFrom)) throw new ConflictException('EFFECTIVE_RANGE_INVALID'); if (!schedule.operatingDays.length) throw new ConflictException('OPERATING_DAYS_MISSING'); this.validateSlots(schedule.operatingModel, schedule.slotTemplates, schedule.variant.durationMinutes); if (!schedule.capacityUnit) throw new ConflictException('CAPACITY_UNIT_MISSING'); if (schedule.defaultCapacity != null && schedule.defaultCapacity < 0) throw new ConflictException('DEFAULT_CAPACITY_INVALID'); }
}
