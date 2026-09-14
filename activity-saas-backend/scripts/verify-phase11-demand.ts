import {
  BookingStatus,
  CancellationFinancialState,
  CancellationInitiator,
  CancellationReasonCategory,
  PrismaClient,
  TenantKind,
  UserRole,
  VendorVerificationStatus,
} from '@prisma/client';
import { DemandAnalysisService } from '../src/demand/demand-analysis.service';
import { DemandObservationService } from '../src/demand/demand-observation.service';
import { DemandOpportunityService } from '../src/demand/demand-opportunity.service';
import { DemandPolicyService } from '../src/demand/demand-policy.service';
import { AuditService } from '../src/audit/audit.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { RequestContextService } from '../src/common/request-context.service';

const prisma = new PrismaClient();
const fixture = `phase11-${Date.now()}`;
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

async function main() {
  const actorRow = await prisma.user.findFirst({
    where: { role: { in: [UserRole.ADMIN, UserRole.SUB_ADMIN] } },
    select: { id: true, email: true, fullName: true, role: true, tenantId: true },
  });
  check(actorRow, 'An Admin is required');
  const agent = await prisma.tenant.findFirst({ where: { kind: TenantKind.TRAVEL_AGENT }, select: { id: true } });
  check(agent, 'A Travel Agent tenant is required');
  const vendor = await prisma.tenant.findFirst({
    where: { kind: TenantKind.VENDOR, vendorProfile: { verificationStatus: VendorVerificationStatus.VERIFIED } },
    select: { id: true },
  });
  check(vendor, 'A verified Vendor tenant is required');
  const vendorUser = await prisma.user.findFirst({
    where: { tenantId: vendor!.id, role: UserRole.VENDOR },
    select: { id: true, email: true, fullName: true, role: true, tenantId: true },
  });
  check(vendorUser, 'A Vendor user is required');
  const product = await prisma.product.findFirst({ where: { tenantId: vendor!.id }, select: { id: true } });
  check(product, 'A product for the verified Vendor is required');
  const snapshotSource: any = await prisma.booking.findFirst({
    where: { operationalSnapshot: { isNot: null } },
    select: { productId: true, vendorTenantId: true, agentTenantId: true, productRevisionId: true, variantId: true, ratePlanId: true, sessionId: true, bookingMode: true, serviceTimezone: true, operationalSnapshot: true },
  });
  check(snapshotSource, 'A booking snapshot fixture is required');

  const actor: any = { sub: actorRow!.id, email: actorRow!.email, fullName: actorRow!.fullName, role: actorRow!.role, tenantId: actorRow!.tenantId };
  const vendorActor: any = { sub: vendorUser!.id, email: vendorUser!.email, fullName: vendorUser!.fullName, role: vendorUser!.role, tenantId: vendorUser!.tenantId };
  const observation = new DemandObservationService(prisma as any);
  const audit = new AuditService(new RequestContextService());
  const outbox = new OutboxService(prisma as any);
  const policyService = new DemandPolicyService(prisma as any, audit, outbox);
  const analysis = new DemandAnalysisService(prisma as any, policyService, audit, outbox);
  const opportunities = new DemandOpportunityService(prisma as any, audit, outbox, analysis);
  const before = await Promise.all([
    prisma.marketplaceSearchObservation.count(),
    prisma.demandOpportunity.count(),
    prisma.demandIntelligencePolicy.count({ where: { status: 'ACTIVE' } }),
  ]);
  const businessBefore = await Promise.all([prisma.booking.count(), prisma.inventoryHold.count(), prisma.inventoryAllocation.count()]);
  const policyIds: string[] = [];
  const runIds: string[] = [];
  const opportunityIds: string[] = [];
  const targetIds: string[] = [];
  const bookingIds: string[] = [];
  const cancellationIds: string[] = [];
  const results: Record<string, unknown> = {};
  let policyId: string | undefined;
  const futureServiceDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  try {
    check(before[2] === 0, 'Verifier will not modify an existing active Demand policy');
    const recordObservation = async (scope: string, index: number, diagnostics: Record<string, unknown>) => {
      await observation.record(
        { tenantId: agent!.id } as any,
        {
          serviceDate: futureServiceDate,
          destination: scope,
          category: 'ACTIVITY',
          subType: 'TREK',
          searchAttemptId: `${fixture}-${scope}-${index}`,
          travellers: [{ travellerType: 'ADULT', quantity: 2 }],
          currency: scope === 'Price Gap' ? 'INR' : undefined,
          priceMax: scope === 'Price Gap' ? 1000 : undefined,
        } as any,
        {
          candidateRatePlanCount: Number(diagnostics.candidateRatePlanCount ?? 1),
          candidateSessionCount: Number(diagnostics.candidateSessionCount ?? 1),
          eligibleOfferCountBeforePrice: Number(diagnostics.eligibleOfferCountBeforePrice ?? 1),
          resultProductCount: Number(diagnostics.resultProductCount ?? 0),
          resultOfferCount: Number(diagnostics.resultOfferCount ?? 0),
          eligibilityFailureCounts: (diagnostics.eligibilityFailureCounts ?? {}) as Record<string, number>,
          soldOutSessionIds: (diagnostics.soldOutSessionIds ?? []) as string[],
          priceDiagnostics: (diagnostics.priceDiagnostics ?? {}) as Record<string, unknown>,
        },
      );
    };

    for (let index = 0; index < 12; index += 1) await recordObservation('High Demand', index, { resultProductCount: 1, resultOfferCount: 1 });
    for (let index = 0; index < 4; index += 1) await recordObservation('Sold Out', index, { resultProductCount: 1, resultOfferCount: 0, eligibilityFailureCounts: { INSUFFICIENT_INVENTORY: 1 }, soldOutSessionIds: [`${fixture}-session-${index}`, `${fixture}-shared-session`] });
    for (let index = 0; index < 4; index += 1) await recordObservation('Price Gap', index, { resultProductCount: 1, resultOfferCount: 1, priceDiagnostics: { priceCeilingMiss: true } });
    for (let index = 0; index < 4; index += 1) await recordObservation('Coverage Gap', index, { resultProductCount: 0, resultOfferCount: 0, candidateRatePlanCount: 0, candidateSessionCount: 0 });
    await observation.record(
      { tenantId: agent!.id } as any,
      { serviceDate: futureServiceDate, destination: 'High Demand', category: 'ACTIVITY', searchAttemptId: `${fixture}-High Demand-0`, travellers: [{ travellerType: 'ADULT', quantity: 2 }] } as any,
      { candidateRatePlanCount: 1, candidateSessionCount: 1, eligibleOfferCountBeforePrice: 1, resultProductCount: 1, resultOfferCount: 1, eligibilityFailureCounts: {}, soldOutSessionIds: [], priceDiagnostics: {} },
    );
    const observedFixtureCount = await prisma.marketplaceSearchObservation.count({ where: { searchAttemptId: { startsWith: fixture } } });
    check(observedFixtureCount === 24, 'Search retry inflated observation count');
    results.observationDedupe = { deliberateSearches: 24, persisted: observedFixtureCount, retryInflated: false };

    const cancellationBooking: any = await prisma.booking.create({
      data: {
        recordType: 'CANONICAL',
        bookingCode: `VY-${fixture.replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase()}`,
        vendorTenantId: snapshotSource.vendorTenantId,
        agentTenantId: agent!.id,
        agentUserId: actorRow!.id,
        productId: snapshotSource.productId,
        productRevisionId: snapshotSource.productRevisionId,
        variantId: snapshotSource.variantId,
        ratePlanId: snapshotSource.ratePlanId,
        sessionId: snapshotSource.sessionId,
        bookingMode: snapshotSource.bookingMode,
        channel: 'PHASE11_VERIFIER',
        serviceDate: new Date(Date.now() - 86400000),
        serviceTimezone: 'Asia/Kolkata',
        pax: 1,
        capacityConsumption: 1,
        amount: 100,
        currency: 'INR',
        status: BookingStatus.CANCELLED,
        confirmedAt: new Date(Date.now() - 2 * 86400000),
        customerName: 'Phase 11 controlled cancellation',
        idempotencyKey: `${fixture}-booking`,
        requestFingerprint: `${fixture}-fingerprint`,
      },
    });
    bookingIds.push(cancellationBooking.id);
    const sourceSnapshot = snapshotSource.operationalSnapshot;
    await prisma.bookingSnapshot.create({
      data: {
        bookingId: cancellationBooking.id,
        productRevisionId: sourceSnapshot.productRevisionId,
        scheduleTemplateId: sourceSnapshot.scheduleTemplateId,
        sessionId: sourceSnapshot.sessionId,
        productSnapshot: { ...(sourceSnapshot.productSnapshot as any), destination: { city: 'Phase 11 Cancellation City' }, type: 'ACTIVITY', subType: 'CANCELLATION' },
        variantSnapshot: sourceSnapshot.variantSnapshot,
        ratePlanSnapshot: sourceSnapshot.ratePlanSnapshot,
        sessionSnapshot: sourceSnapshot.sessionSnapshot,
        travellerSummary: { ADULT: 1 },
        capacityUnit: sourceSnapshot.capacityUnit,
        capacityConsumption: 1,
        bookingMode: sourceSnapshot.bookingMode,
        cancellationPolicySnapshot: sourceSnapshot.cancellationPolicySnapshot,
        cancellationPolicyFingerprint: `${fixture}-policy`,
        cancellationAcknowledgedAt: new Date(),
        pickupSnapshot: sourceSnapshot.pickupSnapshot,
        questionsSnapshot: sourceSnapshot.questionsSnapshot,
        bookingAnswers: sourceSnapshot.bookingAnswers,
        agentSnapshot: sourceSnapshot.agentSnapshot,
        channelSnapshot: sourceSnapshot.channelSnapshot,
        confirmationPolicySnapshot: sourceSnapshot.confirmationPolicySnapshot,
        fulfilmentPolicySnapshot: sourceSnapshot.fulfilmentPolicySnapshot,
      },
    });
    const cancellation: any = await prisma.bookingCancellation.create({
      data: {
        bookingId: cancellationBooking.id,
        initiator: CancellationInitiator.VENDOR,
        reasonCategory: CancellationReasonCategory.VENDOR_OPERATIONAL,
        reason: 'Phase 11 controlled cancellation',
        cancelledAt: new Date(),
        serviceTimezone: 'Asia/Kolkata',
        serviceDateLocal: new Date().toISOString().slice(0, 10),
        cancellationDateLocal: new Date().toISOString().slice(0, 10),
        daysBeforeService: 1,
        bookingAmount: 100,
        currency: 'INR',
        cancellationCharge: 0,
        refundEntitlement: 100,
        financialState: CancellationFinancialState.CANCELLED_NO_REFUND,
        calculationSnapshot: { fixture },
      },
    });
    cancellationIds.push(cancellation.id);

    const policy: any = await policyService.create(actor, {
      name: `Phase 11 verifier ${fixture}`,
      measurementWindowDays: 30,
      futureHorizonDays: 7,
      cooldownDays: 2,
      rules: [
        { type: 'HIGH_DEMAND_LOW_SUPPLY', defaultPriority: 'HIGH', minSearchCount: 10, minUniqueAgentCount: 1, maxAverageResultProducts: 2 },
        { type: 'FREQUENT_SOLD_OUT', defaultPriority: 'HIGH', minSearchCount: 4, minSoldOutSessionCount: 2, minSoldOutRate: 1 },
        { type: 'HIGH_CANCELLATIONS', defaultPriority: 'HIGH', minConfirmedBookingCount: 1, minCancellationRate: 1 },
        { type: 'PRICE_GAP', defaultPriority: 'MEDIUM', minSearchCount: 4, minPriceCeilingMissCount: 4, minPriceCeilingMissRate: 1 },
        { type: 'COVERAGE_GAP', defaultPriority: 'MEDIUM', minSearchCount: 4, minUniqueAgentCount: 1, minZeroResultRate: 1 },
      ],
    } as any);
    policyId = policy.id;
    policyIds.push(policy.id);
    await policyService.activate(actor, policy.id);
    const activePolicy = await policyService.active();
    check(activePolicy?.id === policy.id, 'Policy did not activate');
    const phase11Candidates: any = await analysis.candidates(activePolicy);
    results.policy = { activePolicyPresentBefore: false, oneActiveAfterActivation: true, ruleCount: activePolicy?.rules.length };

    const generated: any = await analysis.generate(actor);
    runIds.push(generated.analysis.id);
    for (const item of generated.created) if (item.id && !opportunityIds.includes(item.id)) opportunityIds.push(item.id);
    const generatedTypes = new Set<string>();
    for (const id of opportunityIds) generatedTypes.add((await prisma.demandOpportunity.findUniqueOrThrow({ where: { id }, select: { type: true } })).type);
    const expectedTypes = ['HIGH_DEMAND_LOW_SUPPLY', 'FREQUENT_SOLD_OUT', 'HIGH_CANCELLATIONS', 'PRICE_GAP', 'COVERAGE_GAP'];
    check(expectedTypes.every((type) => generatedTypes.has(type)), `Not all five signal types generated: ${[...generatedTypes].join(', ')}`);
    results.signals = { expected: expectedTypes, generated: [...generatedTypes].sort(), explainable: true };

    const highDemand = await prisma.demandOpportunity.findFirstOrThrow({ where: { id: { in: opportunityIds }, type: 'HIGH_DEMAND_LOW_SUPPLY', status: 'OPEN' } });
    const assessment: any = await prisma.demandOpportunityAssessment.findFirst({ where: { opportunityId: highDemand.id }, orderBy: { generatedAt: 'desc' } });
    check(assessment?.sourceTrace && assessment?.metrics, 'Opportunity evidence is not immutable/explainable');
    const target: any = await opportunities.target(actor, highDemand.id, { vendorTenantId: vendor!.id });
    targetIds.push(target.id);
    const viewed: any = await opportunities.vendorView(vendorActor, highDemand.id);
    await opportunities.vendorRespond(vendorActor, highDemand.id, { status: 'INTERESTED', expectedVersion: viewed.version, responseNote: 'Phase 11 controlled response' });
    const vendorProjection: any = await opportunities.vendorDetail(vendorActor, highDemand.id);
    check(vendorProjection.status === 'INTERESTED' && !JSON.stringify(vendorProjection).includes(agent!.id), 'Vendor projection exposed agent data or response failed');
    results.targeting = { verifiedVendorTargeted: true, vendorViewed: true, vendorResponded: 'INTERESTED', agentDataRedacted: true };

    const resolved = await opportunities.resolve(actor, highDemand.id, { expectedVersion: highDemand.version, resolutionType: 'NO_ACTION', reason: 'Phase 11 cooldown proof' });
    check(resolved.status === 'RESOLVED', 'Opportunity did not resolve');
    const rerun: any = await analysis.generate(actor);
    runIds.push(rerun.analysis.id);
    for (const item of rerun.created) if (item.id && !opportunityIds.includes(item.id)) opportunityIds.push(item.id);
    check(rerun.suppressed.some((item: any) => item.key === highDemand.opportunityKey), 'Resolved opportunity was not suppressed by cooldown');
    results.cooldown = { resolved: true, suppressedOnRerun: true };

    const concurrentRuns = await Promise.all([analysis.generate(actor), analysis.generate(actor)]);
    for (const run of concurrentRuns) {
      runIds.push(run.analysis.id);
      for (const item of run.created) if (item.id && !opportunityIds.includes(item.id)) opportunityIds.push(item.id);
    }
    const activeKeys: any[] = await prisma.$queryRawUnsafe(`SELECT "opportunityKey", COUNT(*)::int AS count FROM "DemandOpportunity" WHERE "status" IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') GROUP BY "opportunityKey" HAVING COUNT(*) > 1`);
    check(activeKeys.length === 0, 'Concurrent generation created duplicate active opportunity keys');
    results.concurrency = { parallelRuns: 2, duplicateActiveKeys: 0 };

    const businessDuring = await Promise.all([prisma.booking.count(), prisma.inventoryHold.count(), prisma.inventoryAllocation.count()]);
    check(businessDuring[0] === businessBefore[0] + 1 && businessDuring[1] === businessBefore[1] && businessDuring[2] === businessBefore[2], 'Demand generation changed Booking/Hold/Allocation state');
    results.noHistoricalBackfill = (await prisma.marketplaceSearchObservation.count({ where: { searchAttemptId: { startsWith: fixture } } })) === 24;
    results.noBusinessMutation = true;
    check(results.noHistoricalBackfill, 'Controlled observations were not persisted exactly once');
    console.log(JSON.stringify({ phase: '11', fixture, before: { observations: before[0], opportunities: before[1], activePolicies: before[2], bookings: businessBefore[0], holds: businessBefore[1], allocations: businessBefore[2] }, checks: results }, null, 2));
  } finally {
    if (opportunityIds.length) {
      await prisma.demandOpportunityEvent.deleteMany({ where: { opportunityId: { in: opportunityIds } } });
      await prisma.demandOpportunityVendorTarget.deleteMany({ where: { opportunityId: { in: opportunityIds } } });
      await prisma.demandOpportunityAssessment.deleteMany({ where: { opportunityId: { in: opportunityIds } } });
      await prisma.demandOpportunity.deleteMany({ where: { id: { in: opportunityIds } } });
    }
    if (runIds.length) await prisma.demandAnalysisRun.deleteMany({ where: { id: { in: runIds } } });
    if (policyIds.length) await prisma.demandIntelligencePolicy.deleteMany({ where: { id: { in: policyIds } } });
    if (cancellationIds.length) await prisma.bookingCancellation.deleteMany({ where: { id: { in: cancellationIds } } });
    if (bookingIds.length) await prisma.bookingSnapshot.deleteMany({ where: { bookingId: { in: bookingIds } } });
    if (bookingIds.length) await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.marketplaceSearchObservation.deleteMany({ where: { searchAttemptId: { startsWith: fixture } } });
    const auditIds = [...policyIds, ...runIds, ...opportunityIds, ...targetIds, ...cancellationIds];
    if (auditIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: auditIds } } });
    const aggregateIds = [...policyIds, ...opportunityIds];
    if (aggregateIds.length) await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
    const after = await Promise.all([
      prisma.marketplaceSearchObservation.count(),
      prisma.demandOpportunity.count(),
      prisma.demandIntelligencePolicy.count({ where: { status: 'ACTIVE' } }),
      prisma.booking.count(),
      prisma.inventoryHold.count(),
      prisma.inventoryAllocation.count(),
    ]);
    check(after[0] === before[0] && after[1] === before[1] && after[2] === before[2] && after[3] === businessBefore[0] && after[4] === businessBefore[1] && after[5] === businessBefore[2], 'Controlled Phase 11 cleanup changed genuine records');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
