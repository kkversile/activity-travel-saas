import {
  PaymentCollectionMode,
  PayoutStatus,
  Prisma,
  SettlementBatchStatus,
  SettlementHoldScope,
  UserRole,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { AuditService } from "../src/audit/audit.service";
import { RequestContextService } from "../src/common/request-context.service";
import { AuthUser } from "../src/common/auth.types";
import { OutboxService } from "../src/outbox/outbox.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { FinanceService } from "../src/finance/finance.service";

const prefix = `phase9-${randomUUID()}`;
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(`FAIL: ${message}`);
};
const auth = (user: any) =>
  ({
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    organizationRole: user.organizationRole,
  }) as AuthUser;

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const finance = new FinanceService(
    prisma,
    new AuditService(new RequestContextService()),
    new OutboxService(prisma),
  );
  const eventIds: string[] = [];
  const holdIds: string[] = [];
  const batchIds: string[] = [];
  const payoutIds: string[] = [];
  let previousMode: PaymentCollectionMode = PaymentCollectionMode.UNCONFIGURED;
  let previousPolicy: any = null;
  let vendorTenantId = "";
  let report: any;
  try {
    const adminUser = await prisma.user.findFirstOrThrow({
      where: { role: UserRole.ADMIN },
    });
    const vendorUser = await prisma.user.findUniqueOrThrow({
      where: { email: "vendor@voya.demo" },
    });
    vendorTenantId = vendorUser.tenantId!;
    const otherVendor = await prisma.tenant.findFirstOrThrow({
      where: { kind: "VENDOR", id: { not: vendorTenantId } },
    });
    const admin = auth(adminUser);
    const vendor = auth(vendorUser);
    const legacyBefore = await prisma.payout.count({
      where: { recordType: "LEGACY" },
    });
    const configuration: any = await finance.configuration();
    previousMode = configuration.paymentCollectionMode;
    assert(
      configuration.id === "default" &&
        configuration.paymentCollectionMode ===
          PaymentCollectionMode.UNCONFIGURED,
      "finance configuration starts as explicit UNCONFIGURED",
    );
    previousPolicy = await prisma.vendorSettlementPolicy.findUnique({
      where: { vendorTenantId: vendorUser.tenantId! },
    });
    if (previousPolicy)
      await prisma.vendorSettlementPolicy.update({
        where: { vendorTenantId: vendorUser.tenantId! },
        data: {
          cycleMode: "MANUAL",
          eligibilityTrigger: "BOOKING_CONFIRMED",
          settlementDelayDays: 0,
          weeklyDay: null,
          active: true,
          reviewRequired: false,
        },
      });
    else
      await prisma.vendorSettlementPolicy.create({
        data: {
          vendorTenantId: vendorUser.tenantId!,
          cycleMode: "MANUAL",
          eligibilityTrigger: "BOOKING_CONFIRMED",
          settlementDelayDays: 0,
          active: true,
          reviewRequired: false,
        },
      });
    const realBooking: any = await prisma.booking.findFirst({
      where: {
        recordType: "CANONICAL",
        status: "CONFIRMED",
        vendorTenantId: vendorUser.tenantId!,
        economicsSnapshot: { isNot: null },
        financialEvents: {
          some: {
            type: "BOOKING_CONFIRMED",
            status: "POSTED",
            vendorAmount: { not: null },
          },
        },
      },
      include: {
        economicsSnapshot: true,
        financialEvents: {
          where: { type: "BOOKING_CONFIRMED", status: "POSTED" },
          include: { settlementAllocations: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    assert(
      realBooking?.economicsSnapshot?.vendorPayable !== null &&
        realBooking?.economicsSnapshot?.vendorPayable !== undefined,
      "real canonical Booking economics snapshot has vendorPayable",
    );
    const openBase = realBooking.financialEvents.find(
      (event: any) =>
        event.vendorAmount !== null &&
        !event.settlementAllocations.some((allocation: any) =>
          ["ALLOCATED", "SETTLED"].includes(allocation.status),
        ),
    );
    assert(
      openBase,
      "real Booking confirmed event is available for settlement projection",
    );
    const economicsBefore = JSON.stringify(realBooking.economicsSnapshot);
    const linkedAdjustment: any = await finance.adjustment(admin, {
      vendorTenantId: vendorUser.tenantId!,
      bookingId: realBooking.id,
      signedAmount: "-1.00",
      reason: prefix,
      reference: `${prefix}-booking-adjustment`,
      currency: realBooking.currency,
    });
    eventIds.push(linkedAdjustment.id);
    const realPreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: realBooking.currency,
    });
    const realLine = realPreview.eligibleLines.find(
      (line: any) =>
        line.bookingId === realBooking.id &&
        line.sourceEventIds.includes(linkedAdjustment.id),
    );
    console.log(
      "Phase 9.1 real Booking projection:",
      JSON.stringify(
        {
          bookingId: realBooking.id,
          baseEventId: openBase.id,
          adjustmentEventId: linkedAdjustment.id,
          line: realLine,
          blocked: realPreview.blocked
            .filter((row: any) => row.bookingId === realBooking.id)
            .map((row: any) => ({
              eventId: row.eventId,
              reasonCodes: row.reasonCodes,
            })),
        },
        null,
        2,
      ),
    );
    assert(
      realLine &&
        realLine.sourceEventIds.includes(openBase.id) &&
        new Prisma.Decimal(realLine.adjustmentAmount).eq(-1),
      "real Booking-linked adjustment changes the settlement line",
    );
    const economicsAfter = await prisma.bookingEconomicsSnapshot.findUnique({
      where: { bookingId: realBooking.id },
    });
    assert(
      JSON.stringify(economicsAfter) === economicsBefore,
      "Booking economics snapshot remains immutable during settlement projection",
    );
    const adjustment: any = await finance.adjustment(admin, {
      vendorTenantId: vendorUser.tenantId!,
      signedAmount: "125.50",
      reason: prefix,
      reference: `${prefix}-adjustment`,
      currency: "GBP",
    });
    eventIds.push(adjustment.id);
    const hold: any = await finance.createHold(admin, {
      scope: SettlementHoldScope.FINANCIAL_EVENT,
      financialEventId: adjustment.id,
      reason: `${prefix}-hold`,
      reference: prefix,
    });
    holdIds.push(hold.id);
    const heldPreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "GBP",
    });
    assert(
      heldPreview.blocked.some(
        (row: any) =>
          row.eventId === adjustment.id &&
          row.reasonCodes.includes("SETTLEMENT_EVENT_HOLD"),
      ),
      "active financial-event hold blocks settlement",
    );
    await finance.releaseHold(admin, hold.id, `${prefix}-released`);
    const releasedPreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "GBP",
    });
    assert(
      releasedPreview.eligibleLines.some((row: any) =>
        row.sourceEventIds.includes(adjustment.id),
      ),
      "released hold makes event eligible",
    );
    await finance
      .adjustment(admin, {
        vendorTenantId: vendorUser.tenantId!,
        signedAmount: "-200.00",
        reason: prefix,
        reference: `${prefix}-negative`,
        currency: "USD",
      })
      .then((row: any) => eventIds.push(row.id));
    const negativePreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "USD",
    });
    assert(
      negativePreview.batchReasonCodes.includes("NEGATIVE_NET_PAYABLE") &&
        negativePreview.eligible === false,
      "negative net payable is blocked at batch level while the signed line remains open",
    );
    const zero: any = await finance.adjustment(admin, {
      vendorTenantId: vendorUser.tenantId!,
      signedAmount: "0",
      reason: prefix,
      reference: `${prefix}-zero`,
      currency: "EUR",
    });
    eventIds.push(zero.id);
    await prisma.financeConfiguration.update({
      where: { id: "default" },
      data: {
        paymentCollectionMode: PaymentCollectionMode.VOYA_COLLECTS,
        updatedById: admin.sub,
      },
    });
    const raceEvent: any = await finance.adjustment(admin, {
      vendorTenantId: vendorUser.tenantId!,
      signedAmount: "50.00",
      reason: prefix,
      reference: `${prefix}-race`,
      currency: "GBP",
    });
    eventIds.push(raceEvent.id);
    const racePreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "GBP",
    });
    const raceResults = await Promise.allSettled([
      finance.createBatch(admin, {
        vendorTenantId: vendorUser.tenantId!,
        currency: "GBP",
        expectedPreviewFingerprint: racePreview.previewFingerprint,
      }),
      finance.createBatch(admin, {
        vendorTenantId: vendorUser.tenantId!,
        currency: "GBP",
        expectedPreviewFingerprint: racePreview.previewFingerprint,
      }),
    ]);
    const successes = raceResults.filter((r: any) => r.status === "fulfilled");
    const failures = raceResults.filter((r: any) => r.status === "rejected");
    assert(
      successes.length === 1 && failures.length === 1,
      "double batch race allocates a source event once",
    );
    const raceBatch: any = (successes[0] as any).value;
    batchIds.push(raceBatch.id);
    const payoutEvent: any = await finance.adjustment(admin, {
      vendorTenantId: vendorUser.tenantId!,
      signedAmount: "75.00",
      reason: prefix,
      reference: `${prefix}-payout`,
      currency: "GBP",
    });
    eventIds.push(payoutEvent.id);
    const payoutPreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "GBP",
    });
    const payoutBatch: any = await finance.createBatch(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "GBP",
      expectedPreviewFingerprint: payoutPreview.previewFingerprint,
    });
    batchIds.push(payoutBatch.id);
    const payout = await prisma.payout.findUniqueOrThrow({
      where: { settlementBatchId: payoutBatch.id },
    });
    payoutIds.push(payout.id);
    assert(
      payout.status === PayoutStatus.READY_TO_RELEASE,
      "VOYA_COLLECTS creates a ready canonical payout",
    );
    const released: any = await finance.recordRelease(admin, payout.id, {
      externalReference: `${prefix}-bank-record`,
    });
    assert(
      released.status === PayoutStatus.RELEASED,
      "release is recorded without moving money",
    );
    const reconciled: any = await finance.reconcile(admin, payout.id, {
      confirmedAmount: "75.00",
      reconciliationReference: `${prefix}-reconcile`,
    });
    assert(
      reconciled.status === PayoutStatus.RECONCILED,
      "matching payout amount reconciles",
    );
    const retryEvent: any = await finance.adjustment(admin, {
      vendorTenantId: vendorUser.tenantId!,
      signedAmount: "80.00",
      reason: prefix,
      reference: `${prefix}-retry`,
      currency: "GBP",
    });
    eventIds.push(retryEvent.id);
    const retryPreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "GBP",
    });
    const retryBatch: any = await finance.createBatch(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "GBP",
      expectedPreviewFingerprint: retryPreview.previewFingerprint,
    });
    batchIds.push(retryBatch.id);
    const retryPayout = await prisma.payout.findUniqueOrThrow({
      where: { settlementBatchId: retryBatch.id },
    });
    payoutIds.push(retryPayout.id);
    const failed: any = await finance.recordFailure(admin, retryPayout.id, {
      failureReason: `${prefix}-provider-failure`,
    });
    assert(
      failed.status === PayoutStatus.RELEASE_FAILED,
      "payout failure is explicit",
    );
    const ready: any = await finance.retry(admin, retryPayout.id);
    assert(
      ready.status === PayoutStatus.READY_TO_RELEASE,
      "failed payout can be retried",
    );
    const zeroPreview: any = await finance.preview(admin, {
      vendorTenantId: vendorUser.tenantId!,
      currency: "EUR",
    });
    const zeroBatch: any = await finance
      .createBatch(admin, {
        vendorTenantId: vendorUser.tenantId!,
        currency: "EUR",
        expectedPreviewFingerprint: zeroPreview.previewFingerprint,
      })
      .catch((error) => {
        throw error;
      });
    batchIds.push(zeroBatch.id);
    assert(
      zeroBatch.status === SettlementBatchStatus.CLOSED_NO_PAYOUT,
      "zero net settlement closes without a payout",
    );
    const vendorView: any = await finance.vendorSettlements(vendor);
    assert(
      vendorView.batches.every(
        (row: any) => row.vendorTenantId === vendorUser.tenantId,
      ),
      "vendor settlement view is tenant scoped",
    );
    const deniedPreview: any = await finance.preview(vendor, {
      vendorTenantId: otherVendor.id,
      currency: "INR",
    });
    assert(
      deniedPreview.vendorTenantId === vendorUser.tenantId,
      "vendor cannot select another tenant in preview",
    );
    const legacyAfter = await prisma.payout.count({
      where: { recordType: "LEGACY" },
    });
    assert(legacyAfter === legacyBefore, "legacy payout history is preserved");
    report = {
      passing: true,
      prefix,
      checks: {
        realBookingEconomics: "PASS",
        bookingLinkedAdjustment: "PASS",
        reconciliation: "PASS",
        immutableEconomicsProjection: "PASS",
        holdRelease: "PASS",
        doubleBatchRace: "PASS",
        zeroAndNegativeNet: "PASS",
        payoutReleaseFailureRetry: "PASS",
        tenantIsolation: "PASS",
        legacyPreservation: "PASS",
      },
      realBookingId: realBooking.id,
      legacyPayoutsBefore: legacyBefore,
      legacyPayoutsAfter: legacyAfter,
      createdBatches: batchIds.length,
    };
  } finally {
    await prisma.financeConfiguration
      .update({
        where: { id: "default" },
        data: { paymentCollectionMode: previousMode },
      })
      .catch(() => undefined);
    if (batchIds.length || payoutIds.length)
      await prisma
        .$executeRawUnsafe(
          `DELETE FROM "OutboxEvent" WHERE "aggregateId" = ANY($1::text[])`,
          [...batchIds, ...payoutIds],
        )
        .catch(() => undefined);
    if (payoutIds.length) {
      await prisma.financialEvent
        .deleteMany({ where: { payoutId: { in: payoutIds } } })
        .catch(() => undefined);
      await prisma.payoutAttempt
        .deleteMany({ where: { payoutId: { in: payoutIds } } })
        .catch(() => undefined);
      await prisma.payout
        .deleteMany({ where: { id: { in: payoutIds } } })
        .catch(() => undefined);
    }
    if (batchIds.length) {
      await prisma.financialEvent
        .deleteMany({ where: { settlementBatchId: { in: batchIds } } })
        .catch(() => undefined);
      await prisma.settlementEventAllocation
        .deleteMany({ where: { batchId: { in: batchIds } } })
        .catch(() => undefined);
      await prisma.settlementLine
        .deleteMany({ where: { batchId: { in: batchIds } } })
        .catch(() => undefined);
      await prisma.settlementBatch
        .deleteMany({ where: { id: { in: batchIds } } })
        .catch(() => undefined);
    }
    if (holdIds.length)
      await prisma.settlementHold
        .deleteMany({ where: { id: { in: holdIds } } })
        .catch(() => undefined);
    if (eventIds.length)
      await prisma.financialEvent
        .deleteMany({ where: { id: { in: eventIds } } })
        .catch(() => undefined);
    if (previousPolicy)
      await prisma.vendorSettlementPolicy
        .update({
          where: { vendorTenantId: previousPolicy.vendorTenantId },
          data: {
            cycleMode: previousPolicy.cycleMode,
            eligibilityTrigger: previousPolicy.eligibilityTrigger,
            settlementDelayDays: previousPolicy.settlementDelayDays,
            weeklyDay: previousPolicy.weeklyDay,
            active: previousPolicy.active,
            reviewRequired: previousPolicy.reviewRequired,
            version: previousPolicy.version,
          },
        })
        .catch(() => undefined);
    else if (vendorTenantId)
      await prisma.vendorSettlementPolicy
        .deleteMany({ where: { vendorTenantId } })
        .catch(() => undefined);
    await prisma.auditLog
      .deleteMany({ where: { reason: { contains: prefix } } })
      .catch(() => undefined);
    await prisma.$disconnect();
    if (report) console.log(JSON.stringify(report, null, 2));
  }
}
main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
