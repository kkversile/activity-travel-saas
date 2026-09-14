import {
  BookingStatus,
  CancellationFinancialState,
  CancellationInitiator,
  CancellationReasonCategory,
  PrismaClient,
  TenantKind,
  UserRole,
  VendorVerificationStatus,
} from "@prisma/client";
import { validate } from "class-validator";
import { AuditService } from "../src/audit/audit.service";
import { RequestContextService } from "../src/common/request-context.service";
import { DemandAnalysisService } from "../src/demand/demand-analysis.service";
import { DemandObservationService } from "../src/demand/demand-observation.service";
import { DemandOpportunityService } from "../src/demand/demand-opportunity.service";
import { DemandPolicyService } from "../src/demand/demand-policy.service";
import { MarketplaceSearchDto } from "../src/eligibility/eligibility.dto";
import { OutboxService } from "../src/outbox/outbox.service";

const prisma = new PrismaClient();
const fixture = `phase11-2-${Date.now()}`;
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(`FAIL: ${message}`);
};
const date = (days: number) => new Date(Date.now() + days * 86400000);
const day = (days: number) => date(days).toISOString().slice(0, 10);

async function main() {
  const adminRow: any = await prisma.user.findFirst({
    where: { role: { in: [UserRole.ADMIN, UserRole.SUB_ADMIN] } },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      tenantId: true,
    },
  });
  const agent: any = await prisma.tenant.findFirst({
    where: { kind: TenantKind.TRAVEL_AGENT },
    select: { id: true },
  });
  const vendor: any = await prisma.tenant.findFirst({
    where: {
      kind: TenantKind.VENDOR,
      vendorProfile: { verificationStatus: VendorVerificationStatus.VERIFIED },
    },
    select: { id: true },
  });
  const vendorUser: any = await prisma.user.findFirst({
    where: { tenantId: vendor?.id, role: UserRole.VENDOR },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      tenantId: true,
    },
  });
  const source: any = await prisma.booking.findFirst({
    where: { operationalSnapshot: { isNot: null } },
    select: {
      productId: true,
      vendorTenantId: true,
      productRevisionId: true,
      variantId: true,
      ratePlanId: true,
      sessionId: true,
      bookingMode: true,
      serviceTimezone: true,
      agentUserId: true,
      operationalSnapshot: true,
    },
  });
  check(
    adminRow && agent && vendor && vendorUser && source,
    "admin, agent, verified vendor and booking snapshot fixtures required",
  );
  const actor: any = {
    sub: adminRow.id,
    email: adminRow.email,
    fullName: adminRow.fullName,
    role: adminRow.role,
    tenantId: adminRow.tenantId,
  };
  const vendorActor: any = {
    sub: vendorUser.id,
    email: vendorUser.email,
    fullName: vendorUser.fullName,
    role: vendorUser.role,
    tenantId: vendorUser.tenantId,
  };
  const audit = new AuditService(new RequestContextService());
  const outbox = new OutboxService(prisma as any);
  const observations = new DemandObservationService(prisma as any);
  const policies = new DemandPolicyService(prisma as any, audit, outbox);
  const analysis = new DemandAnalysisService(
    prisma as any,
    policies,
    audit,
    outbox,
  );
  const opportunities = new DemandOpportunityService(
    prisma as any,
    audit,
    outbox,
    analysis,
  );
  const before = await Promise.all([
    prisma.marketplaceSearchObservation.count(),
    prisma.demandOpportunity.count(),
    prisma.demandAnalysisRun.count(),
    prisma.demandOpportunityAssessment.count(),
    prisma.demandOpportunityVendorTarget.count(),
    prisma.demandOpportunityEvent.count(),
    prisma.booking.count(),
  ]);
  check(
    (await prisma.demandIntelligencePolicy.count({
      where: { status: "ACTIVE" },
    })) === 0,
    "verifier will not alter an existing active Demand Policy",
  );
  const observationIds: string[] = [];
  const bookingIds: string[] = [];
  const cancellationIds: string[] = [];
  const opportunityIds: string[] = [];
  const targetIds: string[] = [];
  const runIds: string[] = [];
  const policyIds: string[] = [];
  const record = async (scope: string, index: number, extra: any = {}) => {
    const searchAttemptId = `${fixture}-${scope}-${index}`;
    await observations.record(
      { tenantId: agent.id } as any,
      {
        serviceDate: day(3),
        destination: scope,
        category: "ACTIVITY",
        subType: "TREK",
        searchAttemptId,
        travellers: [{ travellerType: "ADULT", quantity: 1 }],
        ...extra.dto,
      } as any,
      {
        candidateRatePlanCount: extra.candidateRatePlanCount ?? 1,
        candidateSessionCount: extra.candidateSessionCount ?? 1,
        eligibleOfferCountBeforePrice: extra.eligibleOfferCountBeforePrice ?? 1,
        resultProductCount: extra.resultProductCount ?? 1,
        resultOfferCount: extra.resultOfferCount ?? 1,
        eligibilityFailureCounts: extra.eligibilityFailureCounts ?? {},
        soldOutSessionIds: extra.soldOutSessionIds ?? [],
        priceDiagnostics: extra.priceDiagnostics ?? {},
      },
    );
    observationIds.push(searchAttemptId);
  };
  const addSnapshot = async (bookingId: string, destination: string) => {
    const s = source.operationalSnapshot;
    await prisma.bookingSnapshot.create({
      data: {
        bookingId,
        productRevisionId: s.productRevisionId,
        scheduleTemplateId: s.scheduleTemplateId,
        sessionId: s.sessionId,
        productSnapshot: {
          ...(s.productSnapshot as any),
          destination: { city: destination },
          type: "ACTIVITY",
          subType: "TREK",
        },
        variantSnapshot: s.variantSnapshot,
        ratePlanSnapshot: s.ratePlanSnapshot,
        sessionSnapshot: s.sessionSnapshot,
        travellerSummary: { ADULT: 1 },
        capacityUnit: s.capacityUnit,
        capacityConsumption: 1,
        bookingMode: s.bookingMode,
        cancellationPolicySnapshot: s.cancellationPolicySnapshot,
        cancellationPolicyFingerprint: `${fixture}-policy`,
        cancellationAcknowledgedAt: new Date(),
        pickupSnapshot: s.pickupSnapshot,
        questionsSnapshot: s.questionsSnapshot,
        bookingAnswers: s.bookingAnswers,
        agentSnapshot: s.agentSnapshot,
        channelSnapshot: s.channelSnapshot,
        confirmationPolicySnapshot: s.confirmationPolicySnapshot,
        fulfilmentPolicySnapshot: s.fulfilmentPolicySnapshot,
      },
    });
  };
  const windowStart = new Date(Date.now() - 3600000);
  const windowEnd = new Date(Date.now() + 3600000);
  const horizonEnd = date(7);
  const checks: Record<string, unknown> = {};
  try {
    await record("Coverage Low", 0, {
      candidateRatePlanCount: 0,
      candidateSessionCount: 0,
      resultProductCount: 0,
      resultOfferCount: 0,
    });
    for (let i = 1; i < 10; i += 1)
      await record("Coverage Low", i, {
        resultProductCount: 1,
        resultOfferCount: 1,
      });
    for (let i = 0; i < 6; i += 1)
      await record("Coverage High", i, {
        candidateRatePlanCount: 0,
        candidateSessionCount: 0,
        resultProductCount: 0,
        resultOfferCount: 0,
      });
    for (let i = 6; i < 10; i += 1)
      await record("Coverage High", i, {
        resultProductCount: 1,
        resultOfferCount: 1,
      });
    await record("Fresh Generation", 0, {
      resultProductCount: 0,
      resultOfferCount: 0,
    });
    await record("Fresh Generation", 1, {
      resultProductCount: 0,
      resultOfferCount: 0,
    });
    const coverageRule: any = {
      type: "COVERAGE_GAP",
      enabled: true,
      defaultPriority: "MEDIUM",
      minSearchCount: 1,
      minUniqueAgentCount: 1,
      minZeroResultRate: 0.5,
    };
    const coverageCandidates: any = await analysis.candidates(
      {
        rules: [coverageRule],
        measurementWindowDays: 30,
        futureHorizonDays: 7,
      },
      {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        horizonEnd: horizonEnd.toISOString(),
      },
    );
    const low = coverageCandidates.candidates.find(
      (item: any) => item.destinationNormalized === "coverage low",
    );
    const high = coverageCandidates.candidates.find(
      (item: any) => item.destinationNormalized === "coverage high",
    );
    check(
      !low &&
        high?.metrics.coverageGapCount === 6 &&
        high.metrics.coverageGapRate === 0.6,
      "coverageGapRate threshold was not enforced",
    );
    checks.coverageRate = {
      tenSearchesOneGap: "no candidate",
      tenSearchesSixGaps: "candidate",
      coverageGapRate: high.metrics.coverageGapRate,
    };
    for (let i = 0; i < 2; i += 1) {
      const booking: any = await prisma.booking.create({
        data: {
          recordType: "CANONICAL",
          bookingCode: `VY-${fixture.replace(/-/g, "").slice(-12)}-C${i}`,
          vendorTenantId: source.vendorTenantId,
          agentTenantId: agent.id,
          agentUserId: source.agentUserId ?? adminRow.id,
          productId: source.productId,
          productRevisionId: source.productRevisionId,
          variantId: source.variantId,
          ratePlanId: source.ratePlanId,
          sessionId: source.sessionId,
          bookingMode: source.bookingMode ?? "INSTANT",
          channel: "PHASE11_2",
          serviceDate: date(-2),
          serviceTimezone: source.serviceTimezone ?? "UTC",
          pax: 1,
          capacityConsumption: 1,
          amount: 100,
          currency: "INR",
          status: i === 0 ? BookingStatus.CANCELLED : BookingStatus.COMPLETED,
          confirmedAt: date(-3),
          idempotencyKey: `${fixture}-booking-${i}`,
          requestFingerprint: `${fixture}-booking-${i}`,
          customerName: "Phase 11.2 cancellation fixture",
        },
      });
      bookingIds.push(booking.id);
      await addSnapshot(booking.id, "Stable Cancellation City");
      if (i === 0) {
        const cancellation: any = await prisma.bookingCancellation.create({
          data: {
            bookingId: booking.id,
            initiator: CancellationInitiator.VENDOR,
            reasonCategory: CancellationReasonCategory.VENDOR_OPERATIONAL,
            reason: "Phase 11.2 cancellation fixture",
            cancelledAt: new Date(),
            serviceTimezone: source.serviceTimezone ?? "UTC",
            serviceDateLocal: day(-2),
            cancellationDateLocal: day(0),
            daysBeforeService: 2,
            bookingAmount: 100,
            currency: "INR",
            cancellationCharge: 0,
            refundEntitlement: 100,
            financialState: CancellationFinancialState.CANCELLED_NO_REFUND,
            calculationSnapshot: { fixture },
          },
        });
        cancellationIds.push(cancellation.id);
      }
    }
    const cancellationRule: any = {
      type: "HIGH_CANCELLATIONS",
      enabled: true,
      defaultPriority: "HIGH",
      minConfirmedBookingCount: 2,
      minCancellationRate: 0.5,
    };
    const firstWindow: any = await analysis.candidates(
      {
        rules: [cancellationRule],
        measurementWindowDays: 30,
        futureHorizonDays: 7,
      },
      {
        windowStart: new Date(Date.now() - 10 * 86400000).toISOString(),
        windowEnd: date(-1).toISOString(),
      },
    );
    const secondWindow: any = await analysis.candidates(
      {
        rules: [cancellationRule],
        measurementWindowDays: 30,
        futureHorizonDays: 7,
      },
      {
        windowStart: new Date(Date.now() - 9 * 86400000).toISOString(),
        windowEnd: new Date().toISOString(),
      },
    );
    const firstCancellation = firstWindow.candidates.find(
      (item: any) => item.type === "HIGH_CANCELLATIONS",
    );
    const secondCancellation = secondWindow.candidates.find(
      (item: any) => item.type === "HIGH_CANCELLATIONS",
    );
    check(
      firstCancellation?.opportunityKey ===
        secondCancellation?.opportunityKey &&
        firstCancellation.serviceDateFrom === null &&
        secondCancellation.serviceDateTo === null,
      "rolling cancellation windows changed workflow identity",
    );
    checks.cancellationKey = {
      sameOpportunityKey: true,
      serviceDateFrom: null,
      serviceDateTo: null,
    };
    const policy: any = await policies.create(actor, {
      name: `Phase 11.2 ${fixture}`,
      measurementWindowDays: 30,
      futureHorizonDays: 7,
      cooldownDays: 2,
      rules: [
        {
          type: "HIGH_DEMAND_LOW_SUPPLY",
          defaultPriority: "HIGH",
          minSearchCount: 2,
          minUniqueAgentCount: 1,
          maxAverageResultProducts: 0,
        },
      ],
    } as any);
    policyIds.push(policy.id);
    await policies.activate(actor, policy.id);
    const generated = await Promise.all([
      analysis.generate(actor, {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        horizonEnd: horizonEnd.toISOString(),
      }),
      analysis.generate(actor, {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        horizonEnd: horizonEnd.toISOString(),
      }),
    ]);
    runIds.push(generated[0].analysis.id, generated[1].analysis.id);
    const freshOpp: any = await prisma.demandOpportunity.findFirst({
      where: {
        destinationNormalized: "fresh generation",
        type: "HIGH_DEMAND_LOW_SUPPLY",
        status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] },
      },
      include: { assessments: true },
    });
    check(
      freshOpp && generated.every((item) => item.analysis.candidateCount === 1),
      "fresh generation did not create the expected candidate in each run",
    );
    const freshAssessments = await prisma.demandOpportunityAssessment.findMany({
      where: { opportunityId: freshOpp.id, analysisRunId: { in: runIds } },
    });
    check(
      freshAssessments.length === 2 &&
        new Set(freshAssessments.map((item) => item.analysisRunId)).size === 2,
      "every concurrent run candidate did not receive an assessment",
    );
    opportunityIds.push(freshOpp.id);
    checks.freshGeneration = { activeOpportunityCount: 1, parallelRuns: 2 };
    checks.assessmentPerRun = {
      runs: 2,
      assessments: freshAssessments.length,
      sameOpportunity: true,
    };
    const duplicateAttempt = observationIds[0];
    await observations.record(
      { tenantId: agent.id } as any,
      {
        serviceDate: day(3),
        destination: "Coverage Low",
        category: "ACTIVITY",
        subType: "TREK",
        searchAttemptId: duplicateAttempt,
        travellers: [{ travellerType: "ADULT", quantity: 1 }],
      } as any,
      {
        candidateRatePlanCount: 0,
        candidateSessionCount: 0,
        eligibleOfferCountBeforePrice: 0,
        resultProductCount: 0,
        resultOfferCount: 0,
        eligibilityFailureCounts: {},
        soldOutSessionIds: [],
        priceDiagnostics: {},
      },
    );
    check(
      (await prisma.marketplaceSearchObservation.count({
        where: { searchAttemptId: duplicateAttempt, agentTenantId: agent.id },
      })) === 1,
      "search retry inflated telemetry",
    );
    const missing = Object.assign(new MarketplaceSearchDto(), {
      serviceDate: day(3),
      travellers: [{ travellerType: "ADULT", quantity: 1 }],
    });
    check(
      (await validate(missing)).some(
        (error) => error.property === "searchAttemptId",
      ),
      "missing searchAttemptId was not rejected",
    );
    checks.searchAttemptId = {
      missingRejected: true,
      retryObservationCount: 1,
    };
    const removedOpp: any = await opportunities.manual(actor, {
      type: "COVERAGE_GAP",
      priority: "LOW",
      title: `Removed ${fixture}`,
      destinationNormalized: "removed",
      reason: "Phase 11.2 removal access proof",
    } as any);
    opportunityIds.push(removedOpp.id);
    const removedTarget: any = await opportunities.target(
      actor,
      removedOpp.id,
      { vendorTenantId: vendor.id },
    );
    targetIds.push(removedTarget.id);
    const viewed = await opportunities.vendorView(vendorActor, removedOpp.id);
    const removed = await opportunities.untarget(
      actor,
      removedOpp.id,
      vendor.id,
      { reason: "Revoke mistaken target" },
    );
    let detailDenied = false;
    let viewDenied = false;
    let respondDenied = false;
    try {
      await opportunities.vendorDetail(vendorActor, removedOpp.id);
    } catch {
      detailDenied = true;
    }
    try {
      await opportunities.vendorView(vendorActor, removedOpp.id);
    } catch {
      viewDenied = true;
    }
    try {
      await opportunities.vendorRespond(vendorActor, removedOpp.id, {
        status: "INTERESTED",
        expectedVersion: viewed.version,
      });
    } catch {
      respondDenied = true;
    }
    const activeAfterRemoval = await opportunities.vendorList(vendorActor);
    const historyAfterRemoval = await opportunities.vendorList(vendorActor, {
      history: true,
    });
    const adminDetail: any = await opportunities.detail(removedOpp.id);
    check(
      removed.status === "REMOVED" &&
        detailDenied &&
        viewDenied &&
        respondDenied &&
        !activeAfterRemoval.some((item: any) => item.id === removedOpp.id) &&
        !historyAfterRemoval.some((item: any) => item.id === removedOpp.id) &&
        adminDetail.targets.some(
          (item: any) =>
            item.status === "REMOVED" &&
            item.removalReason === "Revoke mistaken target",
        ),
      "removed target access or admin history invariant failed",
    );
    checks.removedTarget = {
      activeVisible: false,
      historyVisible: false,
      detailDenied,
      viewDenied,
      respondDenied,
      adminHistoryPreserved: true,
    };
    const retargeted: any = await opportunities.target(actor, removedOpp.id, {
      vendorTenantId: vendor.id,
    });
    const retargetedDetail: any = await opportunities.detail(removedOpp.id);
    check(
      retargeted.status === "TARGETED" &&
        retargeted.targetedById === actor.sub &&
        retargeted.viewedAt === null &&
        retargeted.respondedAt === null &&
        retargeted.removedAt === null &&
        retargetedDetail.events.some(
          (event: any) => event.eventType === "VENDOR_RETARGETED",
        ),
      "retarget did not establish a new target cycle",
    );
    checks.retarget = {
      targetedAtReplaced: true,
      responseFieldsCleared: true,
      provenanceEvent: "VENDOR_RETARGETED",
    };
    const terminal = await opportunities.vendorView(vendorActor, removedOpp.id);
    const response = await opportunities.vendorRespond(
      vendorActor,
      removedOpp.id,
      { status: "INTERESTED", expectedVersion: terminal.version },
    );
    const activeTerminal = await opportunities.vendorList(vendorActor);
    const historyTerminal = await opportunities.vendorList(vendorActor, {
      history: true,
    });
    check(
      response.status === "INTERESTED" &&
        !activeTerminal.some((item: any) => item.id === removedOpp.id) &&
        historyTerminal.some(
          (item: any) =>
            item.id === removedOpp.id && item.status === "INTERESTED",
        ),
      "Vendor Active/History projection is incorrect",
    );
    checks.vendorViews = {
      targetedActive: true,
      viewedActive: true,
      interestedHistory: true,
      removedHidden: true,
    };
    const blankRules: any = [
      {
        type: "HIGH_DEMAND_LOW_SUPPLY",
        defaultPriority: "HIGH",
        minSearchCount: 1,
        minUniqueAgentCount: 1,
        maxAverageResultProducts: 1,
      },
    ];
    let blankRejected = false;
    try {
      await policies.update(actor, policy.id, {
        name: " ",
        expectedLockVersion: 2,
        measurementWindowDays: 30,
        futureHorizonDays: 7,
        cooldownDays: 2,
        rules: blankRules,
      } as any);
    } catch (error: any) {
      blankRejected = String(
        error?.response?.message ?? error?.message,
      ).includes("DEMAND_POLICY_NAME_REQUIRED");
    }
    check(blankRejected, "blank Demand Policy update was accepted");
    const retireRace = await Promise.allSettled([
      policies.retire(actor, policy.id),
      policies.retire(actor, policy.id),
    ]);
    check(
      retireRace.filter((item) => item.status === "fulfilled").length === 1 &&
        (
          await prisma.demandIntelligencePolicy.findUnique({
            where: { id: policy.id },
          })
        )?.status === "RETIRED",
      "policy retirement race was not state-safe",
    );
    checks.policyGovernance = { blankNameRejected: true, retirementWinners: 1 };
    console.log(JSON.stringify({ phase: "11.2", fixture, checks }, null, 2));
  } finally {
    if (opportunityIds.length) {
      await prisma.demandOpportunityEvent
        .deleteMany({ where: { opportunityId: { in: opportunityIds } } })
        .catch(() => undefined);
      await prisma.demandOpportunityVendorTarget
        .deleteMany({ where: { opportunityId: { in: opportunityIds } } })
        .catch(() => undefined);
      await prisma.demandOpportunityAssessment
        .deleteMany({ where: { opportunityId: { in: opportunityIds } } })
        .catch(() => undefined);
      await prisma.demandOpportunity
        .deleteMany({ where: { id: { in: opportunityIds } } })
        .catch(() => undefined);
    }
    if (runIds.length)
      await prisma.demandAnalysisRun
        .deleteMany({ where: { id: { in: runIds } } })
        .catch(() => undefined);
    if (policyIds.length)
      await prisma.demandIntelligencePolicy
        .deleteMany({ where: { id: { in: policyIds } } })
        .catch(() => undefined);
    if (cancellationIds.length)
      await prisma.bookingCancellation
        .deleteMany({ where: { id: { in: cancellationIds } } })
        .catch(() => undefined);
    if (bookingIds.length)
      await prisma.bookingSnapshot
        .deleteMany({ where: { bookingId: { in: bookingIds } } })
        .catch(() => undefined);
    if (bookingIds.length)
      await prisma.booking
        .deleteMany({ where: { id: { in: bookingIds } } })
        .catch(() => undefined);
    if (observationIds.length)
      await prisma.marketplaceSearchObservation
        .deleteMany({ where: { searchAttemptId: { in: observationIds } } })
        .catch(() => undefined);
    const auditIds = [
      ...policyIds,
      ...runIds,
      ...opportunityIds,
      ...targetIds,
      ...cancellationIds,
    ];
    if (auditIds.length)
      await prisma.auditLog
        .deleteMany({ where: { entityId: { in: auditIds } } })
        .catch(() => undefined);
    if (opportunityIds.length)
      await prisma.outboxEvent
        .deleteMany({ where: { aggregateId: { in: opportunityIds } } })
        .catch(() => undefined);
    const after = await Promise.all([
      prisma.marketplaceSearchObservation.count(),
      prisma.demandOpportunity.count(),
      prisma.demandAnalysisRun.count(),
      prisma.demandOpportunityAssessment.count(),
      prisma.demandOpportunityVendorTarget.count(),
      prisma.demandOpportunityEvent.count(),
      prisma.booking.count(),
    ]);
    check(
      after.every((value, index) => value === before[index]),
      `controlled cleanup changed genuine records: before=${before} after=${after}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
