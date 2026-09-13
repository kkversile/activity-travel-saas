import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupplierMetricStatus, SupplierQualityIssueStatus, SupplierQualityMetricCode, SupplierQualityPolicyStatus, SupplierTier } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaptureSnapshotDto, IssueReasonDto, SupplierQualityPolicyDto, TierAssignmentDto, UpdateSupplierQualityPolicyDto } from './supplier-quality.dto';
import { validateRule, SupplierQualityEvaluator } from './supplier-quality-evaluator';
import { SupplierPerformanceService } from './supplier-performance.service';
import { validateMetricClassification } from './quality-metric-registry';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class SupplierQualitySnapshotService {
  constructor(private readonly prisma: PrismaService, private readonly performance: SupplierPerformanceService, private readonly evaluator: SupplierQualityEvaluator, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  async capture(actor: AuthUser, vendorTenantId: string, dto: CaptureSnapshotDto = {}) {
    const end = dto.windowEnd ? new Date(dto.windowEnd) : new Date();
    const requestedStart = dto.windowStart ? new Date(dto.windowStart) : undefined;
    const current = await this.performance.computeCurrent(vendorTenantId, end, requestedStart);
    const start = dto.windowStart ? new Date(dto.windowStart) : current.windowStart;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) throw new BadRequestException('Snapshot window must be valid and ordered');
    const snapshotKey = `${vendorTenantId}:${start.toISOString()}:${end.toISOString()}:${current.policy?.id ?? 'raw'}`;
    const vendor = await this.prisma.tenant.findUnique({ where: { id: vendorTenantId }, select: { kind: true } });
    if (!vendor || vendor.kind !== 'VENDOR') throw new NotFoundException('Vendor tenant not found');
    const existing = await this.prisma.supplierQualitySnapshot.findUnique({ where: { snapshotKey }, include: { metricSnapshots: true, issues: true } });
    if (existing) return existing;
    try {
      return await this.prisma.$transaction(async (tx) => {
      const activePolicy = await tx.supplierQualityPolicy.findFirst({ where: { status: SupplierQualityPolicyStatus.ACTIVE }, select: { id: true } });
      if ((activePolicy?.id ?? null) !== (current.policy?.id ?? null)) throw new ConflictException({ code: 'QUALITY_POLICY_CHANGED', message: 'The active quality policy changed; recalculate and retry' });
      const snapshot = await tx.supplierQualitySnapshot.create({ data: { vendorTenantId, policyId: current.policy?.id ?? null, windowStart: start, windowEnd: end, overallScore: current.overallScore, recommendedTier: current.recommendedTier, currentTierAtCalculation: current.currentTier, metrics: json(current.metrics), snapshotKey } });
      await tx.supplierQualityMetricSnapshot.createMany({ data: current.metrics.map((m) => ({ snapshotId: snapshot.id, metricCode: m.metricCode, dimension: m.dimension as any, rawValue: m.rawValue, numerator: m.numerator, denominator: m.denominator, sampleSize: m.sampleSize, unit: m.unit, status: m.status, score: m.score, sourceTrace: json(m.sourceTrace) })) });
      for (const metric of current.metrics) {
        if (metric.status === SupplierMetricStatus.FAIL || metric.status === SupplierMetricStatus.WARN) await this.openOrUpdateIssue(tx, vendorTenantId, snapshot.id, metric);
        if (metric.status === SupplierMetricStatus.PASS) {
          const open = await tx.supplierQualityIssue.findFirst({ where: { vendorTenantId, metricCode: metric.metricCode, status: { in: [SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED] } } });
          if (open) {
            await tx.supplierQualityIssue.update({ where: { id: open.id }, data: { status: SupplierQualityIssueStatus.RESOLVED, resolvedAt: end, resolvedById: actor.sub, resolutionReason: 'Metric returned within configured threshold', details: json({ ...(open.details as Record<string, unknown>), resolvedBySnapshotId: snapshot.id }) } });
            await this.audit.write(tx, { tenantId: vendorTenantId, actor, action: 'SUPPLIER_QUALITY_ISSUE_AUTO_RESOLVED', entityType: 'SupplierQualityIssue', entityId: open.id, metadata: { metricCode: metric.metricCode, previousStatus: open.status, resolvingSnapshotId: snapshot.id } });
          }
        }
      }
      await this.audit.write(tx, { tenantId: vendorTenantId, actor, action: 'SUPPLIER_QUALITY_SNAPSHOT_CAPTURED', entityType: 'SupplierQualitySnapshot', entityId: snapshot.id, metadata: { policyId: current.policy?.id ?? null, metricCount: current.metrics.length } });
      return tx.supplierQualitySnapshot.findUniqueOrThrow({ where: { id: snapshot.id }, include: { metricSnapshots: true, issues: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.prisma.supplierQualitySnapshot.findUnique({ where: { snapshotKey }, include: { metricSnapshots: true, issues: true } });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private async openOrUpdateIssue(tx: Prisma.TransactionClient, vendorTenantId: string, snapshotId: string, metric: any) {
    const severity = metric.status === SupplierMetricStatus.FAIL ? 'CRITICAL' : 'WARNING';
    const details = json({ status: metric.status, rawValue: metric.rawValue, numerator: metric.numerator, denominator: metric.denominator, sampleSize: metric.sampleSize, sourceTrace: metric.sourceTrace, snapshotId });
    const current = await tx.supplierQualityIssue.findFirst({ where: { vendorTenantId, metricCode: metric.metricCode, status: { in: [SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED] } } });
    if (current) return tx.supplierQualityIssue.update({ where: { id: current.id }, data: { snapshotId, severity: severity as any, details } });
    return tx.supplierQualityIssue.create({ data: { vendorTenantId, snapshotId, metricCode: metric.metricCode, dimension: metric.dimension, severity: severity as any, status: SupplierQualityIssueStatus.OPEN, title: `${String(metric.metricCode).replaceAll('_', ' ')} requires attention`, details } });
  }
}

@Injectable()
export class SupplierQualityPolicyService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  list() { return this.prisma.supplierQualityPolicy.findMany({ include: { metricRules: { orderBy: { rank: 'asc' } }, tierRules: { orderBy: { minimumScore: 'desc' } } }, orderBy: { versionNumber: 'desc' } }); }

  async create(actor: AuthUser, dto: SupplierQualityPolicyDto) {
    this.validatePolicy(dto);
    const policy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplierQualityPolicy.create({ data: { versionNumber: dto.versionNumber, name: dto.name.trim(), measurementWindowDays: dto.measurementWindowDays, shortNoticeDays: dto.shortNoticeDays, lastMinuteStopSellDays: dto.lastMinuteStopSellDays, createdById: actor.sub, metricRules: { create: dto.metricRules.map((r) => ({ ...r, enabled: r.enabled ?? true, rank: r.rank ?? 0 })) }, tierRules: { create: (dto.tierRules ?? []).map((r) => ({ tier: r.tier, minimumScore: r.minimumScore })) } }, include: { metricRules: true, tierRules: true } });
      await this.audit.write(tx, { actor, action: 'SUPPLIER_QUALITY_POLICY_CREATED', entityType: 'SupplierQualityPolicy', entityId: created.id, metadata: { versionNumber: created.versionNumber } });
      return created;
    });
    return policy;
  }

  async update(actor: AuthUser, id: string, dto: UpdateSupplierQualityPolicyDto) {
    this.validatePolicy(dto);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.supplierQualityPolicy.findUnique({ where: { id }, select: { status: true, lockVersion: true } });
      if (!current) throw new NotFoundException('Quality policy not found');
      if (current.status !== SupplierQualityPolicyStatus.DRAFT) throw new ConflictException({ code: 'QUALITY_POLICY_NOT_DRAFT', message: 'Only draft quality policies can be edited' });
      if (current.lockVersion !== dto.expectedLockVersion) throw new ConflictException({ code: 'QUALITY_POLICY_VERSION_MISMATCH', message: 'Quality policy changed; reload before editing' });
      const claimed = await tx.supplierQualityPolicy.updateMany({ where: { id, status: SupplierQualityPolicyStatus.DRAFT, lockVersion: dto.expectedLockVersion }, data: { versionNumber: dto.versionNumber, name: dto.name.trim(), measurementWindowDays: dto.measurementWindowDays, shortNoticeDays: dto.shortNoticeDays, lastMinuteStopSellDays: dto.lastMinuteStopSellDays, lockVersion: { increment: 1 } } });
      if (claimed.count !== 1) throw new ConflictException({ code: 'QUALITY_POLICY_VERSION_MISMATCH', message: 'Quality policy changed; reload before editing' });
      const updated = await tx.supplierQualityPolicy.findUniqueOrThrow({ where: { id } });
      await tx.supplierQualityMetricRule.deleteMany({ where: { policyId: id } });
      await tx.supplierTierRule.deleteMany({ where: { policyId: id } });
      await tx.supplierQualityMetricRule.createMany({ data: dto.metricRules.map((r) => ({ policyId: id, ...r, enabled: r.enabled ?? true, rank: r.rank ?? 0 })) });
      await tx.supplierTierRule.createMany({ data: (dto.tierRules ?? []).map((r) => ({ policyId: id, tier: r.tier, minimumScore: r.minimumScore })) });
      await this.audit.write(tx, { actor, action: 'SUPPLIER_QUALITY_POLICY_UPDATED', entityType: 'SupplierQualityPolicy', entityId: id, metadata: { lockVersion: updated.lockVersion } });
      return tx.supplierQualityPolicy.findUniqueOrThrow({ where: { id }, include: { metricRules: true, tierRules: true } });
    });
  }

  async activate(actor: AuthUser, id: string) {
    try { return await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SupplierQualityPolicy" WHERE "status" = 'ACTIVE' OR "id" = ${id} FOR UPDATE`;
      const policy = await tx.supplierQualityPolicy.findUnique({ where: { id }, include: { metricRules: true, tierRules: true } });
      if (!policy) throw new NotFoundException('Quality policy not found');
      if (policy.status !== SupplierQualityPolicyStatus.DRAFT) throw new ConflictException({ code: 'QUALITY_POLICY_NOT_DRAFT', message: 'Only DRAFT policies can be activated' });
      const existingActive = await tx.supplierQualityPolicy.findFirst({ where: { status: SupplierQualityPolicyStatus.ACTIVE, id: { not: id } }, select: { versionNumber: true } });
      if (existingActive) throw new ConflictException({ code: 'QUALITY_POLICY_ACTIVE_CONFLICT', message: 'Retire the active policy explicitly before activating another' });
      this.validatePolicy({ ...policy, metricRules: policy.metricRules, tierRules: policy.tierRules });
      const active = await tx.supplierQualityPolicy.update({ where: { id }, data: { status: SupplierQualityPolicyStatus.ACTIVE, activatedAt: new Date(), activatedById: actor.sub, retiredAt: null, lockVersion: { increment: 1 } } });
      await this.audit.write(tx, { actor, action: 'SUPPLIER_QUALITY_POLICY_ACTIVATED', entityType: 'SupplierQualityPolicy', entityId: id });
      await this.outbox.enqueue(tx, { eventType: 'SUPPLIER_QUALITY_POLICY_ACTIVATED', aggregateType: 'SupplierQualityPolicy', aggregateId: id, payload: { versionNumber: active.versionNumber } });
      return active;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'QUALITY_POLICY_ACTIVE_CONFLICT', message: 'Retire the active policy explicitly before activating another' });
      throw error;
    }
  }

  async retire(actor: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.supplierQualityPolicy.findUnique({ where: { id } });
      if (!policy) throw new NotFoundException('Quality policy not found');
      if (policy.status !== SupplierQualityPolicyStatus.ACTIVE) throw new ConflictException({ code: 'QUALITY_POLICY_NOT_ACTIVE', message: 'Only ACTIVE policies can be retired' });
      const updated = await tx.supplierQualityPolicy.update({ where: { id }, data: { status: SupplierQualityPolicyStatus.RETIRED, retiredAt: new Date(), lockVersion: { increment: 1 } } });
      await this.audit.write(tx, { actor, action: 'SUPPLIER_QUALITY_POLICY_RETIRED', entityType: 'SupplierQualityPolicy', entityId: id });
      return updated;
    });
  }

  private validatePolicy(dto: { name?: string; metricRules: Array<any>; tierRules?: Array<{ tier: SupplierTier; minimumScore: number }> }) {
    if (dto.name !== undefined && !dto.name.trim()) throw new BadRequestException('Quality policy name is required');
    const seen = new Set<string>();
    for (const rule of dto.metricRules) {
      if (seen.has(rule.metricCode)) throw new BadRequestException('Metric rules must be unique within a policy');
      seen.add(rule.metricCode);
      try { validateMetricClassification(rule); if (rule.enabled !== false) validateRule(rule); } catch (error) { throw new BadRequestException({ code: String(error instanceof Error ? error.message.split(':')[0] : 'QUALITY_RULE_INVALID'), message: 'Quality metric classification or thresholds are invalid' }); }
    }
    if (dto.tierRules?.length) {
      const order = [SupplierTier.ELITE, SupplierTier.PREFERRED, SupplierTier.STANDARD, SupplierTier.WATCHLIST, SupplierTier.RESTRICTED];
      const byTier = new Map(dto.tierRules.map((r) => [r.tier, r.minimumScore]));
      if (dto.tierRules.length !== 5 || order.some((tier) => !byTier.has(tier)) || byTier.get(SupplierTier.RESTRICTED) !== 0 || order.slice(0, -1).some((tier, i) => (byTier.get(tier) as number) <= (byTier.get(order[i + 1]) as number))) throw new BadRequestException('Tier score bands must strictly descend ELITE to RESTRICTED and RESTRICTED must start at 0');
    }
  }
}

@Injectable()
export class SupplierTierService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService) {}
  async assign(actor: AuthUser, vendorTenantId: string, dto: TierAssignmentDto) {
    if (!dto.reason.trim()) throw new BadRequestException('Tier change reason is required');
    try { return await this.prisma.$transaction(async (tx) => {
      if (tx.$queryRaw) await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${vendorTenantId} FOR UPDATE`;
      const vendor = tx.tenant?.findUnique ? await tx.tenant.findUnique({ where: { id: vendorTenantId }, select: { kind: true } }) : { kind: 'VENDOR' as const };
      if (!vendor || vendor.kind !== 'VENDOR') throw new NotFoundException('Vendor tenant not found');
      if (dto.sourceSnapshotId) {
        const source = await tx.supplierQualitySnapshot.findUnique({ where: { id: dto.sourceSnapshotId }, select: { vendorTenantId: true } });
        if (!source || source.vendorTenantId !== vendorTenantId) throw new ConflictException({ code: 'QUALITY_TIER_SNAPSHOT_VENDOR_MISMATCH', message: 'Tier evidence belongs to another Vendor' });
      }
      const current = await tx.supplierTierAssignment.findFirst({ where: { vendorTenantId, effectiveTo: null }, orderBy: { effectiveFrom: 'desc' } });
      const now = new Date();
      if (current) await tx.supplierTierAssignment.update({ where: { id: current.id }, data: { effectiveTo: now } });
      const next = await tx.supplierTierAssignment.create({ data: { vendorTenantId, tier: dto.tier, sourceSnapshotId: dto.sourceSnapshotId, reason: dto.reason.trim(), assignedById: actor.sub, assignedAt: now, effectiveFrom: now } });
      await this.audit.write(tx, { tenantId: vendorTenantId, actor, action: 'SUPPLIER_TIER_CHANGED', entityType: 'SupplierTierAssignment', entityId: next.id, reason: dto.reason, beforeState: current, afterState: next });
      await this.outbox.enqueue(tx, { tenantId: vendorTenantId, eventType: 'SUPPLIER_TIER_CHANGED', aggregateType: 'SupplierTierAssignment', aggregateId: next.id, payload: { vendorTenantId, previousTier: current?.tier ?? null, tier: dto.tier } });
      return next;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException({ code: 'QUALITY_TIER_ASSIGNMENT_CONFLICT', message: 'Tier assignment changed concurrently; reload and retry' });
      throw error;
    }
  }
}

@Injectable()
export class SupplierQualityIssueService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  list(vendorTenantId?: string) { return this.prisma.supplierQualityIssue.findMany({ where: { ...(vendorTenantId ? { vendorTenantId } : {}), status: { in: [SupplierQualityIssueStatus.OPEN, SupplierQualityIssueStatus.ACKNOWLEDGED] } }, include: { vendorTenant: { select: { id: true, name: true } }, snapshot: { select: { id: true, generatedAt: true, overallScore: true } } }, orderBy: [{ severity: 'desc' }, { openedAt: 'desc' }] }); }
  async transition(actor: AuthUser, id: string, action: 'acknowledge' | 'resolve' | 'dismiss', dto?: IssueReasonDto) {
    if (action !== 'acknowledge' && !dto?.reason?.trim()) throw new BadRequestException('A reason is required');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SupplierQualityIssue" WHERE "id" = ${id} FOR UPDATE`;
      const issue = await tx.supplierQualityIssue.findUnique({ where: { id } });
      if (!issue) throw new NotFoundException('Quality issue not found');
      if (action === 'acknowledge' && issue.status === SupplierQualityIssueStatus.ACKNOWLEDGED) return issue;
      const allowed = issue.status === SupplierQualityIssueStatus.OPEN || (issue.status === SupplierQualityIssueStatus.ACKNOWLEDGED && action !== 'acknowledge');
      if (!allowed) throw new ConflictException({ code: 'QUALITY_ISSUE_INVALID_TRANSITION', message: 'Quality issue is already terminal' });
      const status = action === 'acknowledge' ? SupplierQualityIssueStatus.ACKNOWLEDGED : action === 'resolve' ? SupplierQualityIssueStatus.RESOLVED : SupplierQualityIssueStatus.DISMISSED;
      const updated = await tx.supplierQualityIssue.update({ where: { id }, data: action === 'acknowledge' ? { status, acknowledgedAt: new Date(), acknowledgedById: actor.sub } : { status, resolvedAt: new Date(), resolvedById: actor.sub, resolutionReason: dto?.reason?.trim() } });
      await this.audit.write(tx, { tenantId: issue.vendorTenantId, actor, action: `SUPPLIER_QUALITY_ISSUE_${action.toUpperCase()}`, entityType: 'SupplierQualityIssue', entityId: id, reason: dto?.reason });
      return updated;
    });
  }
}
