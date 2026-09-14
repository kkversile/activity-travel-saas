import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DemandOpportunityStatus,
  DemandTargetStatus,
  TenantKind,
  UserRole,
  VendorVerificationStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../common/auth.types";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  DemandListQueryDto,
  ManualDemandOpportunityDto,
  OpportunityPatchDto,
  OpportunityRemovalDto,
  OpportunityResolveDto,
  OpportunityTargetDto,
  VendorOpportunityListQueryDto,
  VendorOpportunityResponseDto,
} from "./demand.dto";
import { DemandAnalysisService } from "./demand-analysis.service";
import { normalizeScopeText } from "./demand.types";

@Injectable()
export class DemandOpportunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly analysis: DemandAnalysisService,
  ) {}

  async overview() {
    const openWhere = {
      status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] } as any,
    };
    const [
      open,
      highDemand,
      soldOut,
      coverage,
      cancellation,
      priceGap,
      targeted,
      firstObservation,
    ] = await Promise.all([
      this.prisma.demandOpportunity.count({ where: openWhere }),
      this.prisma.demandOpportunity.count({
        where: { ...openWhere, type: "HIGH_DEMAND_LOW_SUPPLY" },
      }),
      this.prisma.demandOpportunity.count({
        where: { ...openWhere, type: "FREQUENT_SOLD_OUT" },
      }),
      this.prisma.demandOpportunity.count({
        where: { ...openWhere, type: "COVERAGE_GAP" },
      }),
      this.prisma.demandOpportunity.count({
        where: { ...openWhere, type: "HIGH_CANCELLATIONS" },
      }),
      this.prisma.demandOpportunity.count({
        where: { ...openWhere, type: "PRICE_GAP" },
      }),
      this.prisma.demandOpportunityVendorTarget.count({
        where: {
          status: { in: ["TARGETED", "VIEWED", "INTERESTED", "ACTION_TAKEN"] },
        },
      }),
      this.prisma.marketplaceSearchObservation.findFirst({
        orderBy: { observedAt: "asc" },
        select: { observedAt: true },
      }),
    ]);
    return {
      openOpportunities: open,
      highDemandLowSupply: highDemand,
      soldOutOpportunities: soldOut,
      coverageGaps: coverage,
      cancellationIssues: cancellation,
      priceGapReviews: priceGap,
      targetedVendors: targeted,
      observationsAvailableSince: firstObservation?.observedAt ?? null,
    };
  }

  private where(query: DemandListQueryDto): any {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.priority) where.priority = query.priority;
    if (query.destination)
      where.destinationNormalized = {
        contains: normalizeScopeText(query.destination) ?? "",
        mode: "insensitive",
      };
    if (query.category)
      where.category = {
        contains: query.category.trim().toLowerCase(),
        mode: "insensitive",
      };
    if (query.serviceDateFrom || query.serviceDateTo)
      where.serviceDateFrom = {
        ...(query.serviceDateFrom
          ? { gte: new Date(query.serviceDateFrom) }
          : {}),
        ...(query.serviceDateTo ? { lte: new Date(query.serviceDateTo) } : {}),
      };
    if (query.ownerUserId) where.ownerUserId = query.ownerUserId;
    if (query.vendorTenantId)
      where.targets = {
        some: {
          vendorTenantId: query.vendorTenantId,
          status: { not: DemandTargetStatus.REMOVED },
        },
      };
    if (query.search)
      where.OR = [
        { title: { contains: query.search.trim(), mode: "insensitive" } },
        {
          opportunityKey: {
            contains: query.search.trim(),
            mode: "insensitive",
          },
        },
      ];
    return where;
  }

  async list(query: DemandListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.where(query);
    const [items, total] = await Promise.all([
      this.prisma.demandOpportunity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ownerUser: { select: { id: true, fullName: true, email: true } },
          targets: { select: { vendorTenantId: true, status: true } },
          assessments: {
            orderBy: { generatedAt: "desc" },
            take: 1,
            select: {
              metrics: true,
              sourceTrace: true,
              recommendedAction: true,
            },
          },
        },
        orderBy: [{ priority: "desc" }, { lastDetectedAt: "desc" }],
      }),
      this.prisma.demandOpportunity.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async detail(id: string) {
    const opportunity: any = await this.prisma.demandOpportunity.findUnique({
      where: { id },
      include: {
        ownerUser: { select: { id: true, fullName: true, email: true } },
        assessments: { orderBy: { generatedAt: "desc" } },
        targets: {
          include: {
            vendorTenant: { select: { id: true, name: true, slug: true } },
            removedBy: { select: { id: true, fullName: true } },
          },
        },
        events: {
          orderBy: { createdAt: "asc" },
          include: {
            actor: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    if (!opportunity)
      throw new NotFoundException("Demand opportunity not found");
    return opportunity;
  }

  async manual(user: AuthUser, dto: ManualDemandOpportunityDto) {
    const reason = dto.reason.trim();
    if (!reason) throw new ConflictException("DEMAND_REASON_REQUIRED");
    const scope: any = {
      destinationNormalized: normalizeScopeText(
        dto.destinationNormalized ?? dto.cityName,
      ),
      cityName: dto.cityName ?? null,
      stateName: dto.stateName ?? null,
      countryName: dto.countryName ?? null,
      category: normalizeScopeText(dto.category),
      subType: normalizeScopeText(dto.subType),
      serviceDateFrom: dto.serviceDateFrom ?? null,
      serviceDateTo: dto.serviceDateTo ?? null,
      durationMin: dto.durationMin ?? null,
      durationMax: dto.durationMax ?? null,
      currency: dto.currency ?? null,
    };
    const opportunityKey = `manual:${dto.type}:${JSON.stringify(scope)}`;
    return this.prisma.$transaction(async (tx) => {
      const opportunity: any = await tx.demandOpportunity.create({
        data: {
          opportunityKey,
          type: dto.type,
          source: "MANUAL",
          status: "OPEN",
          priority: dto.priority,
          title: dto.title?.trim() || `Manual ${dto.type.replaceAll("_", " ")}`,
          ...scope,
          serviceDateFrom: scope.serviceDateFrom
            ? new Date(scope.serviceDateFrom)
            : null,
          serviceDateTo: scope.serviceDateTo
            ? new Date(scope.serviceDateTo)
            : null,
          events: {
            create: {
              eventType: "OPENED",
              actorUserId: user.sub,
              reason,
              metadata: { source: "MANUAL" },
            },
          },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        action: "DEMAND_OPPORTUNITY_MANUAL_CREATED",
        entityType: "DemandOpportunity",
        entityId: opportunity.id,
        reason,
        afterState: { type: dto.type, source: "MANUAL" },
      });
      await this.outbox.enqueue(tx, {
        eventType: "DEMAND_OPPORTUNITY_OPENED",
        aggregateType: "DemandOpportunity",
        aggregateId: opportunity.id,
        payload: { type: opportunity.type, opportunityKey: opportunity.opportunityKey, source: "MANUAL" },
      });
      return opportunity;
    });
  }

  private async mutate(
    user: AuthUser,
    id: string,
    expectedVersion: number,
    nextStatus: DemandOpportunityStatus,
    eventType: string,
    reason?: string,
    extra: any = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current: any = await tx.demandOpportunity.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException("Demand opportunity not found");
      if (current.version !== expectedVersion)
        throw new ConflictException("DEMAND_OPPORTUNITY_VERSION_CONFLICT");
      const allowed: Record<string, string[]> = {
        OPEN: ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "DISMISSED"],
        ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED", "DISMISSED"],
        IN_PROGRESS: ["RESOLVED", "DISMISSED"],
      };
      if (!allowed[current.status]?.includes(nextStatus))
        throw new ConflictException("DEMAND_OPPORTUNITY_INVALID_TRANSITION");
      const updated: any = await tx.demandOpportunity.update({
        where: { id, version: expectedVersion },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          ...(nextStatus === "RESOLVED"
            ? { resolvedAt: new Date(), ...extra }
            : {}),
        },
      });
      await tx.demandOpportunityEvent.create({
        data: {
          opportunityId: id,
          eventType,
          actorUserId: user.sub,
          reason: reason?.trim() || null,
          metadata: { from: current.status, to: nextStatus },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        action: `DEMAND_OPPORTUNITY_${eventType}`,
        entityType: "DemandOpportunity",
        entityId: id,
        reason,
        beforeState: current,
        afterState: updated,
      });
      if (eventType === "RESOLVED")
        await this.outbox.enqueue(tx, {
          eventType: "DEMAND_OPPORTUNITY_RESOLVED",
          aggregateType: "DemandOpportunity",
          aggregateId: id,
          payload: { resolutionType: extra.resolutionType },
        });
      return updated;
    });
  }

  acknowledge(user: AuthUser, id: string, dto: any) {
    return this.mutate(
      user,
      id,
      dto.expectedVersion,
      "ACKNOWLEDGED",
      "ACKNOWLEDGED",
      dto.reason,
    );
  }
  start(user: AuthUser, id: string, dto: any) {
    return this.mutate(
      user,
      id,
      dto.expectedVersion,
      "IN_PROGRESS",
      "STARTED",
      dto.reason,
    );
  }
  resolve(user: AuthUser, id: string, dto: OpportunityResolveDto) {
    return this.mutate(
      user,
      id,
      dto.expectedVersion,
      "RESOLVED",
      "RESOLVED",
      dto.reason,
      { resolutionType: dto.resolutionType, resolutionReason: dto.reason },
    );
  }
  dismiss(user: AuthUser, id: string, dto: any) {
    if (!dto.reason?.trim())
      throw new ConflictException("DEMAND_REASON_REQUIRED");
    return this.mutate(
      user,
      id,
      dto.expectedVersion,
      "DISMISSED",
      "DISMISSED",
      dto.reason,
    );
  }

  async patch(user: AuthUser, id: string, dto: OpportunityPatchDto) {
    return this.prisma.$transaction(async (tx) => {
      const current: any = await tx.demandOpportunity.findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException("Demand opportunity not found");
      if (current.version !== dto.expectedVersion)
        throw new ConflictException("DEMAND_OPPORTUNITY_VERSION_CONFLICT");
      if (current.status === "RESOLVED" || current.status === "DISMISSED")
        throw new ConflictException("DEMAND_OPPORTUNITY_IMMUTABLE");
      const data: any = { version: { increment: 1 } };
      if (dto.priority && dto.priority !== current.priority) {
        if (!dto.reason?.trim())
          throw new ConflictException("DEMAND_REASON_REQUIRED");
        data.priority = dto.priority;
        await tx.demandOpportunityEvent.create({
          data: {
            opportunityId: id,
            eventType: "PRIORITY_CHANGED",
            actorUserId: user.sub,
            reason: dto.reason,
            metadata: { from: current.priority, to: dto.priority },
          },
        });
      }
      if (dto.ownerUserId !== undefined) {
        if (dto.ownerUserId) {
          const owner = await tx.user.findUnique({
            where: { id: dto.ownerUserId },
            select: { id: true, active: true, role: true, tenantId: true },
          });
          if (
            !owner?.active ||
            !([UserRole.ADMIN, UserRole.SUB_ADMIN] as string[]).includes(
              owner.role,
            ) ||
            owner.tenantId
          )
            throw new ConflictException("DEMAND_OWNER_PLATFORM_USER_REQUIRED");
        }
        data.ownerUserId = dto.ownerUserId || null;
        await tx.demandOpportunityEvent.create({
          data: {
            opportunityId: id,
            eventType: "OWNER_CHANGED",
            actorUserId: user.sub,
            reason: dto.reason?.trim() || null,
            metadata: { ownerUserId: dto.ownerUserId || null },
          },
        });
      }
      const updated = await tx.demandOpportunity.update({
        where: { id, version: dto.expectedVersion },
        data,
      });
      await this.audit.write(tx, {
        actor: user,
        action: "DEMAND_OPPORTUNITY_UPDATED",
        entityType: "DemandOpportunity",
        entityId: id,
        reason: dto.reason,
        beforeState: current,
        afterState: updated,
      });
      return updated;
    });
  }

  async target(user: AuthUser, id: string, dto: OpportunityTargetDto) {
    return this.prisma.$transaction(async (tx) => {
      const vendor: any = await tx.tenant.findUnique({ where: { id: dto.vendorTenantId }, include: { vendorProfile: true } });
      if (!vendor || vendor.kind !== TenantKind.VENDOR) throw new ConflictException("DEMAND_TARGET_VENDOR_REQUIRED");
      if (vendor.vendorProfile?.verificationStatus !== VendorVerificationStatus.VERIFIED) throw new ConflictException("DEMAND_TARGET_VENDOR_NOT_VERIFIED");
      const opportunity: any = await tx.demandOpportunity.findUnique({
        where: { id },
      });
      if (!opportunity)
        throw new NotFoundException("Demand opportunity not found");
      if (["RESOLVED", "DISMISSED"].includes(opportunity.status))
        throw new ConflictException("DEMAND_OPPORTUNITY_CLOSED");
      const existing: any = await tx.demandOpportunityVendorTarget.findUnique({
        where: {
          opportunityId_vendorTenantId: {
            opportunityId: id,
            vendorTenantId: dto.vendorTenantId,
          },
        },
      });
      if (existing && existing.status !== DemandTargetStatus.REMOVED)
        return existing;
      const now = new Date();
      const target: any = existing
        ? await tx.demandOpportunityVendorTarget.update({
            where: { id: existing.id },
            data: {
              status: "TARGETED",
              targetedById: user.sub,
              targetedAt: now,
              version: { increment: 1 },
              viewedAt: null,
              respondedById: null,
              respondedAt: null,
              responseNote: null,
              removedAt: null,
              removedById: null,
              removalReason: null,
            },
          })
        : await tx.demandOpportunityVendorTarget.create({
            data: {
              opportunityId: id,
              vendorTenantId: dto.vendorTenantId,
              targetedById: user.sub,
              targetedAt: now,
            },
          });
      await tx.demandOpportunityEvent.create({
        data: {
          opportunityId: id,
          eventType: existing ? "VENDOR_RETARGETED" : "VENDOR_TARGETED",
          actorUserId: user.sub,
          metadata: { vendorTenantId: dto.vendorTenantId, targetId: target.id },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        action: existing
          ? "DEMAND_OPPORTUNITY_VENDOR_RETARGETED"
          : "DEMAND_OPPORTUNITY_VENDOR_TARGETED",
        entityType: "DemandOpportunityVendorTarget",
        entityId: target.id,
        afterState: { opportunityId: id, vendorTenantId: dto.vendorTenantId },
      });
      await this.outbox.enqueue(tx, {
        tenantId: dto.vendorTenantId,
        eventType: "DEMAND_OPPORTUNITY_TARGETED",
        aggregateType: "DemandOpportunity",
        aggregateId: id,
        payload: { targetId: target.id },
      });
      return target;
    });
  }

  async untarget(
    user: AuthUser,
    id: string,
    vendorTenantId: string,
    dto: OpportunityRemovalDto,
  ) {
    const reason = dto.reason?.trim();
    if (!reason) throw new ConflictException("DEMAND_REMOVAL_REASON_REQUIRED");
    return this.prisma.$transaction(async (tx) => {
      const target: any = await tx.demandOpportunityVendorTarget.findUnique({
        where: {
          opportunityId_vendorTenantId: { opportunityId: id, vendorTenantId },
        },
      });
      if (!target) throw new NotFoundException("Demand target not found");
      if (target.status === DemandTargetStatus.REMOVED) return target;
      if (
        ![DemandTargetStatus.TARGETED, DemandTargetStatus.VIEWED].includes(
          target.status,
        )
      )
        throw new ConflictException("DEMAND_TARGET_RESPONSE_HISTORY_LOCKED");
      const changed = await tx.demandOpportunityVendorTarget.updateMany({
        where: { id: target.id, version: target.version },
        data: {
          status: "REMOVED",
          version: { increment: 1 },
          removedAt: new Date(),
          removedById: user.sub,
          removalReason: reason,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException("DEMAND_TARGET_VERSION_CONFLICT");
      const updated = await tx.demandOpportunityVendorTarget.findUniqueOrThrow({
        where: { id: target.id },
      });
      await tx.demandOpportunityEvent.create({
        data: {
          opportunityId: id,
          eventType: "VENDOR_UNTARGETED",
          actorUserId: user.sub,
          reason,
          metadata: { vendorTenantId, targetId: target.id },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        action: "DEMAND_OPPORTUNITY_VENDOR_UNTARGETED",
        entityType: "DemandOpportunityVendorTarget",
        entityId: target.id,
        reason,
        beforeState: target,
        afterState: updated,
      });
      return updated;
    });
  }

  candidates(_id: string) {
    return this.prisma.tenant.findMany({
      where: {
        kind: TenantKind.VENDOR,
        vendorProfile: {
          verificationStatus: VendorVerificationStatus.VERIFIED,
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        vendorProfile: { select: { verificationStatus: true } },
        products: {
          where: { status: "LIVE" },
          select: {
            id: true,
            currentRevision: {
              select: {
                cityName: true,
                type: true,
                subType: true,
                subCategory: true,
              },
            },
          },
          take: 10,
        },
      },
      orderBy: { name: "asc" },
    });
  }
  owners() {
    return this.prisma.user.findMany({
      where: {
        active: true,
        role: { in: [UserRole.ADMIN, UserRole.SUB_ADMIN] },
        tenantId: null,
      },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: "asc" },
    });
  }

  private async vendorTarget(user: AuthUser, id: string) {
    if (!user.tenantId)
      throw new ForbiddenException("Vendor tenant is required");
    const target: any = await this.prisma.demandOpportunityVendorTarget.findFirst({
        where: { opportunityId: id, vendorTenantId: user.tenantId, status: { not: DemandTargetStatus.REMOVED } },
        include: {
          opportunity: {
            include: {
              assessments: { orderBy: { generatedAt: "desc" }, take: 1 },
            },
          },
        },
      });
    if (!target)
      throw new ForbiddenException(
        "This Opportunity was not targeted to your Vendor",
      );
    return target;
  }

  async vendorList(user: AuthUser, query: VendorOpportunityListQueryDto = {}) {
    const where: any = { vendorTenantId: user.tenantId!, status: { in: query.history ? [DemandTargetStatus.INTERESTED, DemandTargetStatus.DECLINED, DemandTargetStatus.ACTION_TAKEN] : [DemandTargetStatus.TARGETED, DemandTargetStatus.VIEWED] } };
    const rows: any[] =
      await this.prisma.demandOpportunityVendorTarget.findMany({
        where,
        include: {
          opportunity: {
            include: {
              assessments: { orderBy: { generatedAt: "desc" }, take: 1 },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
    return rows.map((row) => ({
      id: row.opportunity.id,
      targetId: row.id,
      status: row.status,
      version: row.version,
      responseNote: row.responseNote,
      destination: row.opportunity.destinationNormalized,
      category: row.opportunity.category,
      serviceDateFrom: row.opportunity.serviceDateFrom,
      serviceDateTo: row.opportunity.serviceDateTo,
      type: row.opportunity.type,
      priority: row.opportunity.priority,
      title: row.opportunity.title,
      source: row.opportunity.source,
      metrics: this.vendorMetrics(row.opportunity.assessments[0]?.metrics),
      recommendedAction: row.opportunity.assessments[0]?.recommendedAction,
    }));
  }

  async vendorDetail(user: AuthUser, id: string) {
    const target = await this.vendorTarget(user, id);
    const opportunity: any = target.opportunity;
    return {
      id: opportunity.id,
      targetId: target.id,
      status: target.status,
      version: target.version,
      responseNote: target.responseNote,
      destination: opportunity.destinationNormalized,
      category: opportunity.category,
      serviceDateFrom: opportunity.serviceDateFrom,
      serviceDateTo: opportunity.serviceDateTo,
      type: opportunity.type,
      priority: opportunity.priority,
      title: opportunity.title,
      source: opportunity.source,
      metrics: this.vendorMetrics(opportunity.assessments[0]?.metrics),
      recommendedAction: opportunity.assessments[0]?.recommendedAction,
    };
  }
  private vendorMetrics(metrics: any) {
    if (!metrics) return {};
    const allowed = [
      "searchCount",
      "uniqueAgentCount",
      "averageResultProducts",
      "zeroResultRate",
      "soldOutSearchCount",
      "soldOutSearchRate",
      "uniqueSoldOutSessionCount",
      "confirmedBookingCount",
      "cancellationCount",
      "cancellationRate",
      "priceCeilingSearchCount",
      "priceCeilingMissCount",
      "priceCeilingMissRate",
      "averageRequestedCeiling",
      "minimumAvailablePrice",
      "medianAvailablePrice",
    ];
    return Object.fromEntries(
      allowed
        .filter((key) => metrics[key] !== undefined)
        .map((key) => [key, metrics[key]]),
    );
  }

  async vendorView(user: AuthUser, id: string) {
    const target: any = await this.vendorTarget(user, id);
    if (target.status !== DemandTargetStatus.TARGETED)
      return this.vendorDetail(user, id);
    return this.prisma
      .$transaction(async (tx) => {
        const changed = await tx.demandOpportunityVendorTarget.updateMany({
          where: {
            id: target.id,
            version: target.version,
            status: DemandTargetStatus.TARGETED,
          },
          data: {
            status: "VIEWED",
            version: { increment: 1 },
            viewedAt: new Date(),
          },
        });
        if (changed.count !== 1) return null;
        const updated: any =
          await tx.demandOpportunityVendorTarget.findUniqueOrThrow({
            where: { id: target.id },
          });
        await tx.demandOpportunityEvent.create({
          data: {
            opportunityId: id,
            eventType: "VENDOR_VIEWED",
            actorUserId: user.sub,
            metadata: { targetId: target.id },
          },
        });
        return updated;
      })
      .then(() => this.vendorDetail(user, id));
  }

  async vendorRespond(
    user: AuthUser,
    id: string,
    dto: VendorOpportunityResponseDto,
  ) {
    if (
      ![DemandTargetStatus.INTERESTED, DemandTargetStatus.DECLINED].includes(
        dto.status as any,
      )
    )
      throw new ConflictException("DEMAND_VENDOR_RESPONSE_INVALID");
    return this.prisma.$transaction(async (tx) => {
      if (!user.tenantId)
        throw new ForbiddenException("Vendor tenant is required");
      const target: any = await tx.demandOpportunityVendorTarget.findFirst({
        where: { opportunityId: id, vendorTenantId: user.tenantId, status: { not: DemandTargetStatus.REMOVED } },
      });
      if (!target)
        throw new ForbiddenException(
          "This Opportunity was not targeted to your Vendor",
        );
      if (target.version !== dto.expectedVersion)
        throw new ConflictException("DEMAND_VENDOR_RESPONSE_VERSION_CONFLICT");
      if (
        ![DemandTargetStatus.TARGETED, DemandTargetStatus.VIEWED].includes(
          target.status,
        )
      )
        throw new ConflictException("DEMAND_VENDOR_RESPONSE_TERMINAL");
      const eventType =
        dto.status === DemandTargetStatus.INTERESTED
          ? "VENDOR_INTERESTED"
          : "VENDOR_DECLINED";
      const result = await tx.demandOpportunityVendorTarget.updateMany({
        where: {
          id: target.id,
          version: dto.expectedVersion,
          status: {
            in: [DemandTargetStatus.TARGETED, DemandTargetStatus.VIEWED],
          },
        },
        data: {
          status: dto.status,
          version: { increment: 1 },
          respondedById: user.sub,
          respondedAt: new Date(),
          responseNote: dto.responseNote?.trim() || null,
        },
      });
      if (result.count !== 1)
        throw new ConflictException("DEMAND_VENDOR_RESPONSE_VERSION_CONFLICT");
      const updated = await tx.demandOpportunityVendorTarget.findUniqueOrThrow({
        where: { id: target.id },
      });
      await tx.demandOpportunityEvent.create({
        data: {
          opportunityId: id,
          eventType,
          actorUserId: user.sub,
          note: dto.responseNote?.trim() || null,
          metadata: { vendorTenantId: user.tenantId, targetId: target.id },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId: user.tenantId,
        action: `DEMAND_OPPORTUNITY_${eventType}`,
        entityType: "DemandOpportunityVendorTarget",
        entityId: target.id,
        reason: dto.responseNote,
      });
      await this.outbox.enqueue(tx, {
        tenantId: user.tenantId,
        eventType: `DEMAND_OPPORTUNITY_${eventType}`,
        aggregateType: "DemandOpportunity",
        aggregateId: id,
        payload: { targetId: target.id, status: dto.status },
      });
      return updated;
    });
  }
}
