import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DemandIntelligencePolicyStatus,
  DemandOpportunityType,
  Prisma,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../common/auth.types";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateDemandPolicyDto,
  DemandPolicyRuleDto,
  UpdateDemandPolicyDto,
} from "./demand.dto";

@Injectable()
export class DemandPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  private validateRules(rules: DemandPolicyRuleDto[]) {
    if (!Array.isArray(rules) || !rules.length)
      throw new BadRequestException("DEMAND_POLICY_RULES_REQUIRED");
    const seen = new Set<string>();
    for (const rule of rules) {
      if (seen.has(rule.type))
        throw new BadRequestException("DEMAND_POLICY_DUPLICATE_RULE");
      seen.add(rule.type);
      const required: Record<string, string[]> = {
        HIGH_DEMAND_LOW_SUPPLY: [
          "minSearchCount",
          "minUniqueAgentCount",
          "maxAverageResultProducts",
        ],
        FREQUENT_SOLD_OUT: [
          "minSearchCount",
          "minSoldOutSessionCount",
          "minSoldOutRate",
        ],
        HIGH_CANCELLATIONS: ["minConfirmedBookingCount", "minCancellationRate"],
        PRICE_GAP: [
          "minSearchCount",
          "minPriceCeilingMissCount",
          "minPriceCeilingMissRate",
        ],
        COVERAGE_GAP: [
          "minSearchCount",
          "minUniqueAgentCount",
          "minZeroResultRate",
        ],
      };
      for (const field of required[rule.type])
        if ((rule as any)[field] == null)
          throw new BadRequestException(
            `DEMAND_POLICY_${rule.type}_${field.toUpperCase()}_REQUIRED`,
          );
      for (const [key, value] of Object.entries(rule))
        if (
          key !== "type" &&
          key !== "defaultPriority" &&
          key !== "enabled" &&
          value != null &&
          typeof value === "number" &&
          value < 0
        )
          throw new BadRequestException("DEMAND_POLICY_THRESHOLD_NEGATIVE");
      for (const key of [
        "minZeroResultRate",
        "minSoldOutRate",
        "minCancellationRate",
        "minPriceCeilingMissRate",
      ]) {
        const value = (rule as any)[key];
        if (value != null && (value < 0 || value > 1))
          throw new BadRequestException("DEMAND_POLICY_RATE_OUT_OF_RANGE");
      }
    }
  }

  private ruleData(rule: DemandPolicyRuleDto) {
    return {
      type: rule.type,
      enabled: rule.enabled ?? true,
      defaultPriority: rule.defaultPriority,
      minSearchCount: rule.minSearchCount,
      minUniqueAgentCount: rule.minUniqueAgentCount,
      maxAverageResultProducts: rule.maxAverageResultProducts,
      minZeroResultRate: rule.minZeroResultRate,
      minSoldOutSessionCount: rule.minSoldOutSessionCount,
      minSoldOutRate: rule.minSoldOutRate,
      minConfirmedBookingCount: rule.minConfirmedBookingCount,
      minCancellationRate: rule.minCancellationRate,
      minPriceCeilingMissCount: rule.minPriceCeilingMissCount,
      minPriceCeilingMissRate: rule.minPriceCeilingMissRate,
    };
  }

  active() {
    return this.prisma.demandIntelligencePolicy.findFirst({
      where: { status: DemandIntelligencePolicyStatus.ACTIVE },
      include: { rules: true },
      orderBy: { versionNumber: "desc" },
    });
  }
  list() {
    return this.prisma.demandIntelligencePolicy.findMany({
      include: { rules: true, _count: { select: { analysisRuns: true } } },
      orderBy: { versionNumber: "desc" },
    });
  }

  async create(user: AuthUser, dto: CreateDemandPolicyDto) {
    this.validateRules(dto.rules);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("DEMAND_POLICY_NAME_REQUIRED");
    const latest = await this.prisma.demandIntelligencePolicy.aggregate({
      _max: { versionNumber: true },
    });
    const versionNumber = (latest._max.versionNumber ?? 0) + 1;
    const created = await this.prisma.$transaction(async (tx) => {
      const policy = await tx.demandIntelligencePolicy.create({
        data: {
          versionNumber,
          status: "DRAFT",
          name,
          measurementWindowDays: dto.measurementWindowDays,
          futureHorizonDays: dto.futureHorizonDays,
          cooldownDays: dto.cooldownDays,
          createdById: user.sub,
          rules: { create: dto.rules.map((rule) => this.ruleData(rule)) },
        },
        include: { rules: true },
      });
      await this.audit.write(tx, {
        actor: user,
        action: "DEMAND_POLICY_CREATED",
        entityType: "DemandIntelligencePolicy",
        entityId: policy.id,
        reason: name,
        afterState: policy,
      });
      return policy;
    });
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateDemandPolicyDto) {
    this.validateRules(dto.rules);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("DEMAND_POLICY_NAME_REQUIRED");
    const existing: any = await this.prisma.demandIntelligencePolicy.findUnique(
      { where: { id }, include: { rules: true } },
    );
    if (!existing) throw new NotFoundException("Demand policy not found");
    if (existing.status !== "DRAFT")
      throw new ConflictException("DEMAND_POLICY_IMMUTABLE");
    if (existing.lockVersion !== dto.expectedLockVersion)
      throw new ConflictException("DEMAND_POLICY_VERSION_CONFLICT");
    return this.prisma.$transaction(async (tx) => {
      const before = existing;
      await tx.demandOpportunityRule.deleteMany({ where: { policyId: id } });
      const policy = await tx.demandIntelligencePolicy.update({
        where: { id, lockVersion: dto.expectedLockVersion },
        data: {
          name,
          measurementWindowDays: dto.measurementWindowDays,
          futureHorizonDays: dto.futureHorizonDays,
          cooldownDays: dto.cooldownDays,
          lockVersion: { increment: 1 },
          rules: { create: dto.rules.map((rule) => this.ruleData(rule)) },
        },
        include: { rules: true },
      });
      await this.audit.write(tx, {
        actor: user,
        action: "DEMAND_POLICY_UPDATED",
        entityType: "DemandIntelligencePolicy",
        entityId: id,
        beforeState: before,
        afterState: policy,
      });
      return policy;
    });
  }

  async activate(user: AuthUser, id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const policy: any = await tx.demandIntelligencePolicy.findUnique({
          where: { id },
          include: { rules: true },
        });
        if (!policy) throw new NotFoundException("Demand policy not found");
        if (policy.status !== "DRAFT")
          throw new ConflictException("DEMAND_POLICY_NOT_DRAFT");
        this.validateRules(policy.rules as any);
        const active = await tx.demandIntelligencePolicy.findFirst({
          where: { status: "ACTIVE" },
        });
        if (active) throw new ConflictException("DEMAND_ACTIVE_POLICY_EXISTS");
        const updated = await tx.demandIntelligencePolicy.update({
          where: { id, status: "DRAFT" },
          data: {
            status: "ACTIVE",
            activatedById: user.sub,
            activatedAt: new Date(),
            lockVersion: { increment: 1 },
          },
        });
        await this.audit.write(tx, {
          actor: user,
          action: "DEMAND_POLICY_ACTIVATED",
          entityType: "DemandIntelligencePolicy",
          entityId: id,
          afterState: updated,
        });
        await this.outbox.enqueue(tx, {
          eventType: "DEMAND_POLICY_ACTIVATED",
          aggregateType: "DemandIntelligencePolicy",
          aggregateId: id,
          payload: { versionNumber: updated.versionNumber },
        });
        return updated;
      });
    } catch (error: any) {
      if (error?.code === "P2002")
        throw new ConflictException("DEMAND_ACTIVE_POLICY_EXISTS");
      throw error;
    }
  }

  async retire(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const policy: any = await tx.demandIntelligencePolicy.findUnique({ where: { id } });
      if (!policy) throw new NotFoundException("Demand policy not found");
      if (policy.status !== DemandIntelligencePolicyStatus.ACTIVE) throw new ConflictException("DEMAND_POLICY_NOT_ACTIVE");
      const changed = await tx.demandIntelligencePolicy.updateMany({ where: { id, status: DemandIntelligencePolicyStatus.ACTIVE }, data: { status: DemandIntelligencePolicyStatus.RETIRED, retiredAt: new Date(), lockVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("DEMAND_POLICY_NOT_ACTIVE");
      const updated = await tx.demandIntelligencePolicy.findUniqueOrThrow({ where: { id } });
      await this.audit.write(tx, {
        actor: user,
        action: "DEMAND_POLICY_RETIRED",
        entityType: "DemandIntelligencePolicy",
        entityId: id,
        beforeState: policy,
        afterState: updated,
      });
      return updated;
    });
  }
}
