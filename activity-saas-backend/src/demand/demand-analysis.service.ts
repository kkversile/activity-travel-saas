import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  BookingStatus,
  DemandIntelligencePolicy,
  DemandOpportunityType,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../common/auth.types";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { DemandWindowDto } from "./demand.dto";
import { DemandCandidate, normalizeScopeText } from "./demand.types";
import { DemandPolicyService } from "./demand-policy.service";

const cancellationStatuses = [
  BookingStatus.CONFIRMED,
  BookingStatus.FULFILLED,
  BookingStatus.REDEEMED,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
];
const searchTypes: DemandOpportunityType[] = [
  DemandOpportunityType.HIGH_DEMAND_LOW_SUPPLY,
  DemandOpportunityType.FREQUENT_SOLD_OUT,
  DemandOpportunityType.PRICE_GAP,
  DemandOpportunityType.COVERAGE_GAP,
];

@Injectable()
export class DemandAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: DemandPolicyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  private dayStart(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  private dayEnd(value: Date) {
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  private dates(
    policy: DemandIntelligencePolicy,
    dto?: DemandWindowDto,
    analysisNow = new Date(),
  ) {
    const end = dto?.windowEnd ? new Date(dto.windowEnd) : analysisNow;
    const start = dto?.windowStart
      ? new Date(dto.windowStart)
      : new Date(end.getTime() - policy.measurementWindowDays * 86400000);
    const horizonEnd = dto?.horizonEnd
      ? new Date(dto.horizonEnd)
      : new Date(end.getTime() + policy.futureHorizonDays * 86400000);
    if (start >= end) throw new BadRequestException("DEMAND_WINDOW_INVALID");
    return {
      start,
      end,
      horizonStart: this.dayStart(end),
      horizonEnd: this.dayEnd(horizonEnd),
    };
  }

  private key(
    type: DemandOpportunityType,
    scope: Record<string, unknown>,
    stableCancellation = false,
  ) {
    const identity = stableCancellation
      ? {
          destinationNormalized: scope.destinationNormalized,
          category: scope.category,
          subType: scope.subType,
        }
      : scope;
    return createHash("sha256")
      .update(JSON.stringify({ type, ...identity }))
      .digest("hex");
  }
  private groupKey(row: any, includeCurrency = false) {
    return JSON.stringify({
      destinationNormalized: row.destinationNormalized,
      category: row.category,
      subType: row.subType,
      serviceDate: new Date(row.serviceDate).toISOString().slice(0, 10),
      durationMin: row.durationMin,
      durationMax: row.durationMax,
      ...(includeCurrency ? { currency: row.currency } : {}),
    });
  }

  private candidate(
    type: DemandOpportunityType,
    group: any,
    metrics: Record<string, unknown>,
    rule: any,
    start: Date,
    end: Date,
    horizonStart: Date,
    horizonEnd: Date,
    action: string,
    currency?: string | null,
    stableCancellation = false,
  ): DemandCandidate {
    const scope: any = {
      destinationNormalized: group.destinationNormalized,
      cityName: group.cityName ?? null,
      stateName: group.stateName ?? null,
      countryName: group.countryName ?? null,
      category: group.category,
      subType: group.subType,
      serviceDateFrom: stableCancellation
        ? null
        : new Date(group.serviceDate ?? horizonStart)
            .toISOString()
            .slice(0, 10),
      serviceDateTo: stableCancellation
        ? null
        : new Date(group.serviceDate ?? horizonStart)
            .toISOString()
            .slice(0, 10),
      durationMin: group.durationMin ?? null,
      durationMax: group.durationMax ?? null,
      currency: currency ?? null,
    };
    return {
      ...scope,
      type,
      metrics,
      sourceTrace: {
        measurementWindow: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        ...(searchTypes.includes(type)
          ? {
              futureHorizon: {
                start: horizonStart.toISOString(),
                end: horizonEnd.toISOString(),
              },
            }
          : {}),
        rule: {
          type: rule.type,
          defaultPriority: rule.defaultPriority,
          thresholds: rule,
        },
        scope,
      },
      recommendedAction: action,
      defaultPriority: rule.defaultPriority,
      opportunityKey: this.key(type, scope, stableCancellation),
    };
  }

  private coverageClass(row: any) {
    if (row.candidateRatePlanCount === 0) return "NO_CANDIDATE_SUPPLY";
    if (row.candidateSessionCount === 0) return "NO_DATED_SUPPLY";
    if (
      Number(
        (row.eligibilityFailureCounts as any)?.INSUFFICIENT_INVENTORY ?? 0,
      ) > 0 ||
      ((row.soldOutSessionIds as string[]) ?? []).length > 0
    )
      return "SOLD_OUT";
    return "OTHER_ELIGIBILITY_GAP";
  }

  private async cancellationCandidates(
    policy: any,
    start: Date,
    end: Date,
    rules: any[],
  ) {
    const rule = rules.find(
      (item) =>
        item.type === DemandOpportunityType.HIGH_CANCELLATIONS && item.enabled,
    );
    if (!rule) return [];
    const bookings: any[] = await this.prisma.booking.findMany({
      where: {
        recordType: "CANONICAL",
        confirmedAt: { not: null },
        serviceDate: { gte: start, lt: end },
        status: { in: cancellationStatuses },
      },
      include: { cancellation: true, operationalSnapshot: true },
    });
    const groups = new Map<string, any>();
    for (const booking of bookings) {
      const snapshot: any = booking.operationalSnapshot?.productSnapshot ?? {};
      const destination = normalizeScopeText(
        snapshot.destination?.city ||
          snapshot.destination?.state ||
          snapshot.destination?.country,
      );
      const category = normalizeScopeText(snapshot.type);
      const subType = normalizeScopeText(snapshot.subType);
      const key = JSON.stringify({ destination, category, subType });
      const group = groups.get(key) ?? {
        destinationNormalized: destination,
        cityName: snapshot.destination?.city ?? null,
        stateName: snapshot.destination?.state ?? null,
        countryName: snapshot.destination?.country ?? null,
        category,
        subType,
        confirmedBookingCount: 0,
        cancellationCount: 0,
        initiators: {},
      };
      group.confirmedBookingCount += 1;
      if (booking.cancellation) {
        group.cancellationCount += 1;
        const initiator = booking.cancellation.initiator ?? "UNKNOWN";
        group.initiators[initiator] = (group.initiators[initiator] ?? 0) + 1;
      }
      groups.set(key, group);
    }
    return [...groups.values()]
      .filter(
        (group) =>
          group.confirmedBookingCount >= rule.minConfirmedBookingCount &&
          group.cancellationCount / group.confirmedBookingCount >=
            rule.minCancellationRate,
      )
      .map((group) =>
        this.candidate(
          DemandOpportunityType.HIGH_CANCELLATIONS,
          group,
          {
            searchCount: 0,
            confirmedBookingCount: group.confirmedBookingCount,
            cancellationCount: group.cancellationCount,
            cancellationRate:
              group.cancellationCount / group.confirmedBookingCount,
            initiatorBreakdown: group.initiators,
          },
          rule,
          start,
          end,
          start,
          end,
          "Review cancellation drivers and service coverage.",
          null,
          true,
        ),
      );
  }

  async candidates(
    policy: any,
    dto?: DemandWindowDto,
    analysisNow = new Date(),
  ) {
    const { start, end, horizonStart, horizonEnd } = this.dates(
      policy,
      dto,
      analysisNow,
    );
    const allObservations: any[] =
      await this.prisma.marketplaceSearchObservation.findMany({
        where: { observedAt: { gte: start, lt: end } },
        orderBy: { observedAt: "asc" },
      });
    const observations = allObservations.filter((row) => {
      const serviceDate = new Date(row.serviceDate);
      return serviceDate >= horizonStart && serviceDate <= horizonEnd;
    });
    const rules: any[] = policy.rules.filter((rule: any) => rule.enabled);
    const byScope = new Map<string, any>();
    for (const row of observations) {
      const key = this.groupKey(row);
      const group = byScope.get(key) ?? {
        destinationNormalized: row.destinationNormalized,
        category: row.category,
        subType: row.subType,
        serviceDate: row.serviceDate,
        durationMin: row.durationMin,
        durationMax: row.durationMax,
        rows: [],
        agents: new Set<string>(),
        soldOutSessions: new Set<string>(),
        soldOutSearchCount: 0,
      };
      group.rows.push(row);
      group.agents.add(row.agentTenantId);
      for (const id of (row.soldOutSessionIds as string[]) ?? [])
        group.soldOutSessions.add(id);
      if (((row.soldOutSessionIds as string[]) ?? []).length)
        group.soldOutSearchCount += 1;
      byScope.set(key, group);
    }
    const candidates: DemandCandidate[] = [];
    for (const group of byScope.values()) {
      const rows = group.rows;
      const searchCount = rows.length;
      const zeroResultCount = rows.filter((row: any) => row.zeroResult).length;
      const zeroResultRate = searchCount ? zeroResultCount / searchCount : 0;
      const averageResultProducts =
        rows.reduce(
          (sum: number, row: any) => sum + row.resultProductCount,
          0,
        ) / Math.max(searchCount, 1);
      const averageResultOffers =
        rows.reduce((sum: number, row: any) => sum + row.resultOfferCount, 0) /
        Math.max(searchCount, 1);
      const coverageClassCounts = rows.reduce(
        (all: Record<string, number>, row: any) => {
          const classification = row.zeroResult
            ? this.coverageClass(row)
            : "RESULTS_AVAILABLE";
          all[classification] = (all[classification] ?? 0) + 1;
          return all;
        },
        {},
      );
      const noCandidateSupplyCount =
        coverageClassCounts.NO_CANDIDATE_SUPPLY ?? 0;
      const noDatedSupplyCount = coverageClassCounts.NO_DATED_SUPPLY ?? 0;
      const noCoverageGapCount = noCandidateSupplyCount + noDatedSupplyCount;
      const base = {
        searchCount,
        uniqueAgentCount: group.agents.size,
        averageResultProducts,
        averageResultOffers,
        zeroResultCount,
        zeroResultRate,
        soldOutSearchCount: group.soldOutSearchCount,
        soldOutSearchRate: searchCount
          ? group.soldOutSearchCount / searchCount
          : 0,
        uniqueSoldOutSessionCount: group.soldOutSessions.size,
        coverageClassCounts,
        noCandidateSupplyCount,
        noDatedSupplyCount,
        coverageGapCount: noCoverageGapCount,
        coverageGapRate: searchCount ? noCoverageGapCount / searchCount : 0,
        candidateRatePlanCount:
          rows.reduce(
            (sum: number, row: any) => sum + row.candidateRatePlanCount,
            0,
          ) / Math.max(searchCount, 1),
        candidateSessionCount:
          rows.reduce(
            (sum: number, row: any) => sum + row.candidateSessionCount,
            0,
          ) / Math.max(searchCount, 1),
        reasonCounts: rows.reduce((all: any, row: any) => {
          for (const [code, count] of Object.entries(
            row.eligibilityFailureCounts as any,
          ))
            all[code] = (all[code] ?? 0) + Number(count);
          return all;
        }, {}),
      };
      for (const rule of rules.filter(
        (item) => item.type !== DemandOpportunityType.PRICE_GAP,
      )) {
        let matches = false;
        let action = "Review supply coverage and availability.";
        if (rule.type === DemandOpportunityType.HIGH_DEMAND_LOW_SUPPLY)
          matches =
            base.searchCount >= rule.minSearchCount &&
            base.uniqueAgentCount >= rule.minUniqueAgentCount &&
            base.averageResultProducts <= rule.maxAverageResultProducts &&
            (rule.minZeroResultRate == null ||
              base.zeroResultRate >= rule.minZeroResultRate);
        if (rule.type === DemandOpportunityType.FREQUENT_SOLD_OUT) {
          matches =
            base.searchCount >= rule.minSearchCount &&
            base.uniqueSoldOutSessionCount >= rule.minSoldOutSessionCount &&
            base.soldOutSearchRate >= rule.minSoldOutRate;
          action = "Review capacity and add supply manually where appropriate.";
        }
        if (rule.type === DemandOpportunityType.COVERAGE_GAP) {
          matches =
            base.searchCount >= rule.minSearchCount &&
            base.uniqueAgentCount >= rule.minUniqueAgentCount &&
            base.coverageGapRate >= rule.minZeroResultRate;
          action =
            "Review destination/category coverage and add supply manually.";
        }
        if (matches)
          candidates.push(
            this.candidate(
              rule.type,
              group,
              base,
              rule,
              start,
              end,
              horizonStart,
              horizonEnd,
              action,
            ),
          );
      }
      const priceCurrencies: string[] = [
        ...new Set<string>(
          rows
            .filter((row: any) => row.priceMax != null && row.currency)
            .map((row: any) => String(row.currency).toUpperCase()),
        ),
      ];
      for (const currency of priceCurrencies) {
        const priceRows = rows.filter(
          (row: any) =>
            row.priceMax != null &&
            String(row.currency).toUpperCase() === currency,
        );
        const missRows = priceRows.filter((row: any) =>
          Boolean((row.priceDiagnostics as any)?.priceCeilingMiss),
        );
        const available = rows.flatMap((row: any) => {
          const byCurrency: any =
            (row.priceDiagnostics as any)?.byCurrency ?? {};
          const entry = byCurrency[currency];
          return entry?.minimum == null ? [] : [Number(entry.minimum)];
        });
        const medians = rows.flatMap((row: any) => {
          const byCurrency: any =
            (row.priceDiagnostics as any)?.byCurrency ?? {};
          const entry = byCurrency[currency];
          return entry?.median == null ? [] : [Number(entry.median)];
        });
        const priceCeilingSearchCount = priceRows.length;
        const priceCeilingMissCount = missRows.length;
        const priceMetrics = {
          ...base,
          currency: String(currency),
          priceCeilingSearchCount,
          priceCeilingMissCount,
          priceCeilingMissRate: priceCeilingSearchCount
            ? priceCeilingMissCount / priceCeilingSearchCount
            : 0,
          averageRequestedCeiling:
            priceRows.reduce(
              (sum: number, row: any) => sum + Number(row.priceMax),
              0,
            ) / Math.max(priceCeilingSearchCount, 1),
          minimumAvailablePrice: available.length
            ? Math.min(...available)
            : null,
          medianAvailablePrice: medians.length
            ? medians.reduce((sum: number, value: number) => sum + value, 0) /
              medians.length
            : null,
        };
        const rule = rules.find(
          (item) => item.type === DemandOpportunityType.PRICE_GAP,
        );
        if (
          rule &&
          priceCeilingSearchCount >= rule.minSearchCount &&
          priceCeilingMissCount >= rule.minPriceCeilingMissCount &&
          priceMetrics.priceCeilingMissRate >= rule.minPriceCeilingMissRate
        )
          candidates.push(
            this.candidate(
              DemandOpportunityType.PRICE_GAP,
              group,
              priceMetrics,
              rule,
              start,
              end,
              horizonStart,
              horizonEnd,
              "Review supply/commercial price positioning.",
              currency,
            ),
          );
      }
    }
    candidates.push(
      ...(await this.cancellationCandidates(policy, start, end, rules)),
    );
    return {
      candidates,
      start,
      end,
      horizonStart,
      horizonEnd,
      observationCount: allObservations.length,
      horizonObservationCount: observations.length,
    };
  }

  async preview(dto?: DemandWindowDto) {
    const policy: any = await this.policies.active();
    if (!policy) throw new ConflictException("DEMAND_POLICY_NOT_ACTIVE");
    const result = await this.candidates(policy, dto);
    return {
      policy: {
        id: policy.id,
        versionNumber: policy.versionNumber,
        name: policy.name,
      },
      observationCount: result.observationCount,
      horizonObservationCount: result.horizonObservationCount,
      window: {
        start: result.start,
        end: result.end,
        horizonStart: result.horizonStart,
        horizonEnd: result.horizonEnd,
      },
      candidates: result.candidates,
    };
  }

  async generate(user: AuthUser, dto?: DemandWindowDto) {
    const policy: any = await this.policies.active();
    if (!policy) throw new ConflictException("DEMAND_POLICY_NOT_ACTIVE");
    const analysisNow = new Date();
    const result = await this.candidates(policy, dto, analysisNow);
    return this.prisma.$transaction(
      async (tx) => {
        const analysis = await tx.demandAnalysisRun.create({
          data: {
            policyId: policy.id,
            windowStart: result.start,
            windowEnd: result.end,
            horizonStart: result.horizonStart,
            horizonEnd: result.horizonEnd,
            generatedById: user.sub,
            candidateCount: result.candidates.length,
            generatedAt: analysisNow,
            summary: {
              observationCount: result.observationCount,
              horizonObservationCount: result.horizonObservationCount,
              candidateTypes: result.candidates.map((item) => item.type),
            },
          },
        });
        const created: any[] = [];
        const suppressed: any[] = [];
        const candidates = [...result.candidates].sort((left, right) =>
          left.opportunityKey.localeCompare(right.opportunityKey),
        );
        for (const candidate of candidates) {
          const advisoryKey = BigInt(
            `0x${createHash("sha256").update(candidate.opportunityKey).digest("hex").slice(0, 15)}`,
          );
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey})`;
          const active = await tx.demandOpportunity.findFirst({
            where: {
              opportunityKey: candidate.opportunityKey,
              status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] },
            },
          });
          if (active) {
            const assessment = await tx.demandOpportunityAssessment.create({
              data: {
                opportunityId: active.id,
                analysisRunId: analysis.id,
                policyId: policy.id,
                windowStart: result.start,
                windowEnd: result.end,
                metrics: candidate.metrics as any,
                sourceTrace: candidate.sourceTrace as any,
                recommendedAction: candidate.recommendedAction,
                generatedAt: analysisNow,
              },
            });
            await tx.demandOpportunity.update({
              where: { id: active.id },
              data: { lastDetectedAt: analysisNow, version: { increment: 1 } },
            });
            await tx.demandOpportunityEvent.create({
              data: {
                opportunityId: active.id,
                eventType: "ASSESSMENT_ADDED",
                actorUserId: user.sub,
                metadata: {
                  analysisRunId: analysis.id,
                  policyId: policy.id,
                  assessmentId: assessment.id,
                },
              },
            });
            created.push({
              id: active.id,
              key: candidate.opportunityKey,
              repeated: true,
            });
            continue;
          }
          const historical = await tx.demandOpportunity.findFirst({
            where: {
              opportunityKey: candidate.opportunityKey,
              status: { in: ["RESOLVED", "DISMISSED"] },
            },
            orderBy: { updatedAt: "desc" },
          });
          if (
            historical &&
            policy.cooldownDays > 0 &&
            historical.updatedAt.getTime() + policy.cooldownDays * 86400000 >
              analysisNow.getTime()
          ) {
            const assessment = await tx.demandOpportunityAssessment.create({
              data: {
                opportunityId: historical.id,
                analysisRunId: analysis.id,
                policyId: policy.id,
                windowStart: result.start,
                windowEnd: result.end,
                metrics: candidate.metrics as any,
                sourceTrace: candidate.sourceTrace as any,
                recommendedAction: candidate.recommendedAction,
                generatedAt: analysisNow,
              },
            });
            await tx.demandOpportunityEvent.create({
              data: {
                opportunityId: historical.id,
                eventType: "ASSESSMENT_ADDED",
                actorUserId: user.sub,
                metadata: {
                  analysisRunId: analysis.id,
                  policyId: policy.id,
                  assessmentId: assessment.id,
                  suppressedByCooldown: true,
                },
              },
            });
            suppressed.push({
              key: candidate.opportunityKey,
              cooldownUntil: new Date(
                historical.updatedAt.getTime() + policy.cooldownDays * 86400000,
              ),
            });
            continue;
          }
          const opportunity: any = await tx.demandOpportunity.create({
            data: {
              opportunityKey: candidate.opportunityKey,
              type: candidate.type,
              source: "SYSTEM",
              priority: candidate.defaultPriority,
              title: candidate.type.replaceAll("_", " "),
              destinationNormalized: candidate.destinationNormalized,
              cityName: candidate.cityName,
              stateName: candidate.stateName,
              countryName: candidate.countryName,
              category: candidate.category,
              subType: candidate.subType,
              serviceDateFrom: candidate.serviceDateFrom
                ? new Date(candidate.serviceDateFrom)
                : null,
              serviceDateTo: candidate.serviceDateTo
                ? new Date(candidate.serviceDateTo)
                : null,
              durationMin: candidate.durationMin,
              durationMax: candidate.durationMax,
              currency: candidate.currency,
              firstDetectedAt: analysisNow,
              lastDetectedAt: analysisNow,
              assessments: {
                create: {
                  analysisRunId: analysis.id,
                  policyId: policy.id,
                  windowStart: result.start,
                  windowEnd: result.end,
                  metrics: candidate.metrics as any,
                  sourceTrace: candidate.sourceTrace as any,
                  recommendedAction: candidate.recommendedAction,
                  generatedAt: analysisNow,
                },
              },
              events: {
                create: {
                  eventType: "OPENED",
                  actorUserId: user.sub,
                  createdAt: analysisNow,
                  metadata: {
                    source: "SYSTEM",
                    policyVersion: policy.versionNumber,
                  },
                },
              },
            },
          });
          await this.outbox.enqueue(tx, {
            eventType: "DEMAND_OPPORTUNITY_OPENED",
            aggregateType: "DemandOpportunity",
            aggregateId: opportunity.id,
            payload: {
              type: opportunity.type,
              opportunityKey: opportunity.opportunityKey,
            },
          });
          created.push({
            id: opportunity.id,
            key: candidate.opportunityKey,
            repeated: false,
          });
        }
        await this.audit.write(tx, {
          actor: user,
          action: "DEMAND_ANALYSIS_GENERATED",
          entityType: "DemandAnalysisRun",
          entityId: analysis.id,
          afterState: { candidateCount: result.candidates.length },
        });
        return { analysis, created, suppressed };
      },
      { timeout: 30000, maxWait: 30000 },
    );
  }
}
