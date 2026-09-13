import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import {
  FinancialEventStatus,
  FinancialEventType,
  PaymentCollectionMode,
  PayoutAttemptStatus,
  PayoutRecordType,
  PayoutStatus,
  Prisma,
  SettlementAllocationStatus,
  SettlementBatchStatus,
  SettlementEligibilityTrigger,
  SettlementHoldScope,
  SettlementHoldStatus,
  UserRole,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../common/auth.types";
import { requireTenant } from "../common/tenant";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CancellationResolutionDto,
  FailPayoutDto,
  FinanceConfigurationDto,
  ReconcilePayoutDto,
  ReleasePayoutDto,
  SettlementBatchDto,
  SettlementHoldDto,
  SettlementPreviewDto,
  VendorAdjustmentDto,
  VendorSettlementPolicyDto,
} from "./finance.dto";

const settlementTypes = [
  FinancialEventType.BOOKING_CONFIRMED,
  FinancialEventType.VENDOR_ADJUSTMENT,
];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  configuration() {
    return this.prisma.financeConfiguration.findUniqueOrThrow({
      where: { id: "default" },
    });
  }
  async updateConfiguration(user: AuthUser, dto: FinanceConfigurationDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "FinanceConfiguration" WHERE "id" = 'default' FOR UPDATE`,
        );
        const current = await tx.financeConfiguration.findUnique({
          where: { id: "default" },
        });
        if (!current || dto.expectedVersion !== current.version)
          throw new ConflictException("FINANCE_CONFIGURATION_VERSION_MISMATCH");
        const baseCurrency = this.requireCurrency(
          dto.baseCurrency ?? current.baseCurrency,
        );
        const updated = await tx.financeConfiguration.update({
          where: { id: "default" },
          data: {
            paymentCollectionMode: dto.paymentCollectionMode,
            baseCurrency,
            version: { increment: 1 },
            updatedById: user.sub,
          },
        });
        await this.audit.write(tx, {
          actor: user,
          action: "FINANCE_CONFIGURATION_UPDATED",
          entityType: "FinanceConfiguration",
          entityId: "default",
          beforeState: current,
          afterState: updated,
        });
        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }
  policies() {
    return this.prisma.vendorSettlementPolicy.findMany({
      orderBy: { createdAt: "asc" },
    });
  }
  async updatePolicy(
    user: AuthUser,
    vendorTenantId: string,
    dto: VendorSettlementPolicyDto,
  ) {
    if (
      dto.cycleMode === "WEEKLY" &&
      (dto.weeklyDay === undefined || dto.weeklyDay < 0 || dto.weeklyDay > 6)
    )
      throw new ConflictException("SETTLEMENT_WEEKLY_DAY_INVALID");
    if (dto.cycleMode !== "WEEKLY" && dto.weeklyDay !== undefined)
      throw new ConflictException("SETTLEMENT_WEEKLY_DAY_NOT_ALLOWED");
    return this.prisma.$transaction(
      async (tx) => {
        await this.vendorIn(tx, vendorTenantId);
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "VendorSettlementPolicy" WHERE "vendorTenantId" = $1 FOR UPDATE`,
          vendorTenantId,
        );
        const existing = await tx.vendorSettlementPolicy.findUnique({
          where: { vendorTenantId },
        });
        if (
          existing &&
          (dto.expectedVersion === undefined ||
            dto.expectedVersion !== existing.version)
        )
          throw new ConflictException("SETTLEMENT_POLICY_VERSION_MISMATCH");
        const active = dto.active ?? existing?.active ?? false;
        const reviewRequired =
          dto.reviewRequired ?? existing?.reviewRequired ?? true;
        if (active && reviewRequired)
          throw new ConflictException("SETTLEMENT_POLICY_REVIEW_REQUIRED");
        const result = await tx.vendorSettlementPolicy.upsert({
          where: { vendorTenantId },
          update: {
            cycleMode: dto.cycleMode,
            eligibilityTrigger: dto.eligibilityTrigger,
            settlementDelayDays: dto.settlementDelayDays,
            weeklyDay: dto.weeklyDay ?? null,
            active,
            reviewRequired,
            version: { increment: 1 },
          },
          create: {
            vendorTenantId,
            cycleMode: dto.cycleMode,
            eligibilityTrigger: dto.eligibilityTrigger,
            settlementDelayDays: dto.settlementDelayDays,
            weeklyDay: dto.weeklyDay ?? null,
            active,
            reviewRequired,
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId: vendorTenantId,
          action: "SETTLEMENT_POLICY_UPDATED",
          entityType: "VendorSettlementPolicy",
          entityId: result.id,
          beforeState: existing,
          afterState: result,
        });
        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }

  async preview(user: AuthUser, dto: SettlementPreviewDto) {
    return this.buildPreview(this.prisma, user, dto);
  }

  private async buildPreview(
    client: any,
    user: AuthUser,
    dto: SettlementPreviewDto,
  ) {
    const vendorTenantId = this.scopeVendor(user, dto.vendorTenantId);
    const currency = this.requireCurrency(dto.currency);
    const config = await client.financeConfiguration.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
    const policy = await client.vendorSettlementPolicy.findUnique({
      where: { vendorTenantId },
    });
    const events: any[] = await client.financialEvent.findMany({
      where: {
        vendorTenantId,
        type: { in: settlementTypes },
        status: FinancialEventStatus.POSTED,
        currency,
        ...(dto.periodFrom || dto.periodTo
          ? {
              occurredAt: {
                ...(dto.periodFrom ? { gte: new Date(dto.periodFrom) } : {}),
                ...(dto.periodTo ? { lte: new Date(dto.periodTo) } : {}),
              },
            }
          : {}),
      },
      include: {
        booking: {
          include: {
            economicsSnapshot: true,
            cancellation: {
              include: { refund: true, vendorSettlementResolution: true },
            },
            events: true,
            redemption: true,
          },
        },
        settlementAllocations: true,
      },
      orderBy: { occurredAt: "asc" },
    });
    const holds: any[] = await client.settlementHold.findMany({
      where: { vendorTenantId, status: SettlementHoldStatus.ACTIVE },
    });
    const eligibleLines: any[] = [];
    const blocked: any[] = [];
    const alreadyAllocated: any[] = [];
    const open = events.filter((event) => {
      if (
        event.settlementAllocations?.some((a: any) =>
          [
            SettlementAllocationStatus.ALLOCATED,
            SettlementAllocationStatus.SETTLED,
          ].includes(a.status),
        )
      ) {
        alreadyAllocated.push({
          eventId: event.id,
          bookingId: event.bookingId,
        });
        return false;
      }
      return true;
    });
    const byBooking = new Map<string, { base?: any; adjustments: any[] }>();
    const standalone: any[] = [];
    for (const event of open) {
      if (event.bookingId) {
        const group = byBooking.get(event.bookingId) ?? { adjustments: [] };
        if (event.type === FinancialEventType.BOOKING_CONFIRMED)
          group.base = event;
        else group.adjustments.push(event);
        byBooking.set(event.bookingId, group);
      } else standalone.push(event);
    }
    for (const [bookingId, group] of byBooking) {
      const booking = group.base?.booking ?? group.adjustments[0]?.booking;
      const source = [group.base, ...group.adjustments].filter(Boolean);
      const reasons = this.scopeHoldReasons(
        holds,
        vendorTenantId,
        bookingId,
        source.map((event: any) => event.id),
      );
      reasons.push(
        ...this.blockReasons(
          group.base ?? group.adjustments[0],
          booking,
          policy,
        ),
      );
      if (reasons.length) {
        for (const event of source)
          blocked.push({
            eventId: event.id,
            bookingId,
            reasonCodes: [...new Set(reasons)],
            explanation: this.explanation(group.base ?? event, booking, policy),
          });
        continue;
      }
      if (group.base) {
        if (!booking?.economicsSnapshot || group.base.vendorAmount === null) {
          blocked.push({
            eventId: group.base.id,
            bookingId,
            reasonCodes: ["ECONOMICS_SNAPSHOT_MISSING"],
          });
          continue;
        }
        const line = this.bookingLine(group.base, group.adjustments, booking);
        eligibleLines.push(line);
      } else
        eligibleLines.push(
          this.adjustmentLine(group.adjustments, bookingId, booking),
        );
    }
    for (const event of standalone) {
      const reasons = this.scopeHoldReasons(holds, vendorTenantId, null, [
        event.id,
      ]);
      reasons.push(...this.blockReasons(event, null, policy));
      if (reasons.length)
        blocked.push({ eventId: event.id, reasonCodes: [...new Set(reasons)] });
      else eligibleLines.push(this.adjustmentLine([event], null, null));
    }
    const totals = eligibleLines.reduce(
      (a, line) => ({
        grossBookingValue: a.grossBookingValue.plus(line.grossBookingValue),
        vendorBasePayable: a.vendorBasePayable.plus(line.vendorPayableBase),
        adjustmentTotal: a.adjustmentTotal.plus(line.adjustmentAmount),
        netPayable: a.netPayable.plus(line.netVendorPayable),
      }),
      {
        grossBookingValue: this.zero(),
        vendorBasePayable: this.zero(),
        adjustmentTotal: this.zero(),
        netPayable: this.zero(),
      },
    );
    const response: any = {
      vendorTenantId,
      currency,
      paymentCollectionMode: config.paymentCollectionMode,
      policy,
      eligibleLines: eligibleLines.map(this.publicLine),
      blocked,
      alreadyAllocated,
      totals: this.moneyObject(totals),
      eligible: eligibleLines.length > 0 && totals.netPayable.gte(0),
      generatedAt: new Date().toISOString(),
    };
    response.batchReasonCodes = totals.netPayable.lt(0)
      ? ["NEGATIVE_NET_PAYABLE"]
      : [];
    response.previewFingerprint = this.fingerprint({
      vendorTenantId,
      currency,
      policyVersion: policy?.version ?? null,
      eligibleLines: response.eligibleLines,
      blocked,
      alreadyAllocated,
      totals: response.totals,
    });
    return this.isVendor(user)
      ? this.vendorPreviewProjection(response)
      : response;
  }

  private bookingLine(base: any, adjustments: any[], booking: any) {
    const adjustmentAmount = adjustments.reduce(
      (sum, event) =>
        sum.plus(this.decimal(event.vendorAmount ?? event.amount)),
      this.zero(),
    );
    const baseAmount = this.decimal(base.vendorAmount);
    return {
      bookingId: booking.id,
      lineType: "BOOKING",
      currency: base.currency,
      sourceEventIds: [base.id, ...adjustments.map((event) => event.id)],
      grossBookingValue: this.decimal(booking.amount),
      vendorPayableBase: baseAmount,
      adjustmentAmount,
      netVendorPayable: baseAmount.plus(adjustmentAmount),
      taxInformational: this.decimal((base.components ?? {}).taxAmount),
      components: this.vendorComponents(base, booking),
      explanation: this.explanation(base, booking, null),
    };
  }
  private adjustmentLine(
    events: any[],
    bookingId: string | null,
    booking: any,
  ) {
    const adjustmentAmount = events.reduce(
      (sum, event) =>
        sum.plus(this.decimal(event.vendorAmount ?? event.amount)),
      this.zero(),
    );
    return {
      bookingId,
      lineType: "ADJUSTMENT",
      currency: events[0].currency,
      sourceEventIds: events.map((event) => event.id),
      grossBookingValue: this.zero(),
      vendorPayableBase: this.zero(),
      adjustmentAmount,
      netVendorPayable: adjustmentAmount,
      taxInformational: this.zero(),
      components: {
        adjustmentCount: events.length,
        references: events.map((event) => event.reference).filter(Boolean),
        bookingValue: booking ? String(booking.amount) : null,
      },
      explanation: {
        reason: "VENDOR_ADJUSTMENT",
        sourceEventIds: events.map((event) => event.id),
      },
    };
  }

  async createBatch(user: AuthUser, dto: SettlementBatchDto) {
    if (!dto.expectedPreviewFingerprint)
      throw new ConflictException("SETTLEMENT_PREVIEW_FINGERPRINT_REQUIRED");
    const currency = this.requireCurrency(dto.currency);
    const vendorTenantId = this.scopeVendor(user, dto.vendorTenantId);
    const initial: any = await this.buildPreview(this.prisma, user, {
      ...dto,
      currency,
    });
    if (initial.previewFingerprint !== dto.expectedPreviewFingerprint)
      throw new ConflictException("SETTLEMENT_PREVIEW_STALE");
    const allIds: string[] = initial.eligibleLines.flatMap(
      (line: any) => line.sourceEventIds,
    );
    const selected: string[] = dto.selectedSourceEventIds?.length
      ? [...new Set(dto.selectedSourceEventIds)]
      : allIds;
    if (!selected.length || selected.some((id) => !allIds.includes(id)))
      throw new ConflictException("SETTLEMENT_SELECTED_EVENTS_NOT_ELIGIBLE");
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRawUnsafe(
            `SELECT "id" FROM "FinancialEvent" WHERE "id" = ANY($1::text[]) FOR UPDATE`,
            selected,
          );
          const bookingIds = initial.eligibleLines
            .filter(
              (line: any) =>
                selected.some((id) => line.sourceEventIds.includes(id)) &&
                line.bookingId,
            )
            .map((line: any) => line.bookingId);
          for (const bookingId of [...new Set(bookingIds)])
            await tx.$queryRawUnsafe(
              `SELECT "id" FROM "Booking" WHERE "id" = $1 FOR UPDATE`,
              bookingId,
            );
          await tx.$queryRawUnsafe(
            `SELECT "id" FROM "FinanceConfiguration" WHERE "id" = 'default' FOR UPDATE`,
          );
          await tx.$queryRawUnsafe(
            `SELECT "id" FROM "VendorSettlementPolicy" WHERE "vendorTenantId" = $1 FOR UPDATE`,
            vendorTenantId,
          );
          const authoritative: any = await this.buildPreview(tx, user, {
            ...dto,
            currency,
          });
          if (
            authoritative.previewFingerprint !== dto.expectedPreviewFingerprint
          )
            throw new ConflictException("SETTLEMENT_PREVIEW_STALE");
          const selectedPreview = this.selectPreview(authoritative, selected);
          if (!selectedPreview.eligibleLines.length)
            throw new ConflictException("SETTLEMENT_NO_ELIGIBLE_EVENTS");
          const net = this.decimal(selectedPreview.totals.netPayable);
          if (net.lt(0)) throw new ConflictException("NEGATIVE_NET_PAYABLE");
          const config = await tx.financeConfiguration.findUniqueOrThrow({
            where: { id: "default" },
          });
          const policy = await tx.vendorSettlementPolicy.findUnique({
            where: { vendorTenantId },
          });
          const status = net.eq(0)
            ? SettlementBatchStatus.CLOSED_NO_PAYOUT
            : config.paymentCollectionMode ===
                PaymentCollectionMode.VOYA_COLLECTS
              ? SettlementBatchStatus.READY_FOR_PAYOUT
              : SettlementBatchStatus.PAYOUT_BLOCKED;
          const batch: any = await tx.settlementBatch.create({
            data: {
              batchCode: `SET-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
              vendorTenantId,
              currency,
              policySnapshot: (policy ?? {
                vendorTenantId,
                reviewRequired: true,
              }) as any,
              periodFrom: dto.periodFrom ? new Date(dto.periodFrom) : null,
              periodTo: dto.periodTo ? new Date(dto.periodTo) : null,
              status,
              grossBookingValue: this.decimal(
                selectedPreview.totals.grossBookingValue,
              ),
              vendorBasePayable: this.decimal(
                selectedPreview.totals.vendorBasePayable,
              ),
              adjustmentTotal: this.decimal(
                selectedPreview.totals.adjustmentTotal,
              ),
              netPayable: net,
              eventCount: selected.length,
              lineCount: selectedPreview.eligibleLines.length,
              previewFingerprint: selectedPreview.previewFingerprint,
              createdById: user.sub,
            },
          });
          for (const line of selectedPreview.eligibleLines) {
            const created: any = await tx.settlementLine.create({
              data: {
                batchId: batch.id,
                bookingId: line.bookingId,
                lineType: line.lineType,
                currency,
                grossBookingValue: this.decimal(line.grossBookingValue),
                vendorPayableBase: this.decimal(line.vendorPayableBase),
                adjustmentAmount: this.decimal(line.adjustmentAmount),
                netVendorPayable: this.decimal(line.netVendorPayable),
                taxInformational: this.decimal(line.taxInformational),
                components: line.components as any,
              },
            });
            for (const eventId of line.sourceEventIds) {
              await tx.settlementEventAllocation.create({
                data: {
                  batchId: batch.id,
                  lineId: created.id,
                  financialEventId: eventId,
                  status:
                    status === SettlementBatchStatus.CLOSED_NO_PAYOUT
                      ? SettlementAllocationStatus.SETTLED
                      : SettlementAllocationStatus.ALLOCATED,
                },
              });
            }
          }
          await tx.financialEvent.create({
            data: {
              eventKey: `settlement-batch:${batch.id}`,
              vendorTenantId,
              type: FinancialEventType.SETTLEMENT_BATCH_CREATED,
              status: FinancialEventStatus.POSTED,
              currency,
              amount: net,
              vendorAmount: net,
              settlementBatchId: batch.id,
              components: {
                batchCode: batch.batchCode,
                lineCount: batch.lineCount,
                eventCount: batch.eventCount,
              },
              actorUserId: user.sub,
              occurredAt: new Date(),
            },
          });
          if (status === SettlementBatchStatus.READY_FOR_PAYOUT)
            await tx.payout.create({
              data: {
                tenantId: vendorTenantId,
                recordType: PayoutRecordType.CANONICAL,
                settlementBatchId: batch.id,
                amount: net,
                status: PayoutStatus.READY_TO_RELEASE,
                dueDate: new Date(),
                currency,
              },
            });
          await this.audit.write(tx, {
            actor: user,
            tenantId: vendorTenantId,
            action: "SETTLEMENT_BATCH_CREATED",
            entityType: "SettlementBatch",
            entityId: batch.id,
            metadata: { netPayable: net.toString(), status },
          });
          await this.outbox.enqueue(tx, {
            tenantId: vendorTenantId,
            eventType: "SETTLEMENT_BATCH_CREATED",
            aggregateType: "SettlementBatch",
            aggregateId: batch.id,
            payload: {
              batchCode: batch.batchCode,
              amount: net.toString(),
              status,
            },
          });
          return tx.settlementBatch.findUnique({
            where: { id: batch.id },
            include: { lines: true, payout: true, financialEvents: true },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
          maxWait: 30000,
        },
      );
    } catch (error: any) {
      if (error?.code === "P2002")
        throw new ConflictException("SETTLEMENT_EVENT_ALREADY_ALLOCATED");
      throw error;
    }
  }

  async adjustment(user: AuthUser, dto: VendorAdjustmentDto) {
    const amount = this.signed(dto.signedAmount);
    const reason = dto.reason?.trim();
    const reference = dto.reference?.trim();
    if (!reason || !reference)
      throw new ConflictException("ADJUSTMENT_REASON_AND_REFERENCE_REQUIRED");
    return this.prisma.$transaction(
      async (tx) => {
        const vendor = await this.vendorIn(tx, dto.vendorTenantId);
        let booking: any = null;
        if (dto.bookingId) {
          booking = await tx.booking.findFirst({
            where: { id: dto.bookingId, vendorTenantId: vendor.id },
          });
          if (!booking) throw new NotFoundException("Booking not found");
        }
        const config = await tx.financeConfiguration.findUnique({
          where: { id: "default" },
        });
        const currency = this.requireCurrency(
          dto.currency ?? booking?.currency ?? config?.baseCurrency,
        );
        if (booking && currency !== String(booking.currency).toUpperCase())
          throw new ConflictException("ADJUSTMENT_CURRENCY_MUST_MATCH_BOOKING");
        const event = await tx.financialEvent.create({
          data: {
            eventKey: `vendor-adjustment:${randomUUID()}`,
            bookingId: dto.bookingId ?? null,
            vendorTenantId: vendor.id,
            agentTenantId: booking?.agentTenantId ?? null,
            type: FinancialEventType.VENDOR_ADJUSTMENT,
            status: FinancialEventStatus.POSTED,
            currency,
            amount,
            vendorAmount: amount,
            components: {
              adjustmentKind: "MANUAL",
              signedAmount: amount.toString(),
            },
            reason,
            reference,
            actorUserId: user.sub,
            occurredAt: new Date(),
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId: vendor.id,
          action: "VENDOR_ADJUSTMENT_CREATED",
          entityType: "FinancialEvent",
          entityId: event.id,
          reason,
          metadata: { signedAmount: amount.toString(), reference },
        });
        return event;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }

  async resolveCancellation(
    user: AuthUser,
    cancellationId: string,
    dto: CancellationResolutionDto,
  ) {
    const final = this.nonNegative(dto.finalVendorPayable);
    if (!dto.reason?.trim() || !dto.reference?.trim())
      throw new ConflictException(
        "CANCELLATION_RESOLUTION_REASON_AND_REFERENCE_REQUIRED",
      );
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "BookingCancellation" WHERE "id" = $1 FOR UPDATE`,
          cancellationId,
        );
        const cancellation: any = await tx.bookingCancellation.findUnique({
          where: { id: cancellationId },
          include: {
            booking: { include: { economicsSnapshot: true } },
            vendorSettlementResolution: true,
          },
        });
        if (!cancellation)
          throw new NotFoundException("Cancellation not found");
        if (
          !cancellation.booking.economicsSnapshot?.vendorPayable &&
          cancellation.booking.economicsSnapshot?.vendorPayable !== 0
        )
          throw new ConflictException("ECONOMICS_SNAPSHOT_MISSING");
        const original = new Prisma.Decimal(
          cancellation.booking.economicsSnapshot.vendorPayable,
        );
        if (final.gt(original))
          throw new ConflictException("FINAL_VENDOR_PAYABLE_EXCEEDS_ORIGINAL");
        if (cancellation.vendorSettlementResolution) {
          if (
            new Prisma.Decimal(
              cancellation.vendorSettlementResolution.finalVendorPayable,
            ).eq(final) &&
            cancellation.vendorSettlementResolution.reference === dto.reference
          )
            return cancellation.vendorSettlementResolution;
          throw new ConflictException(
            "CANCELLATION_SETTLEMENT_RESOLUTION_IMMUTABLE",
          );
        }
        const delta = final.minus(original);
        const event: any = await tx.financialEvent.create({
          data: {
            eventKey: `cancellation-vendor-adjustment:${cancellationId}`,
            bookingId: cancellation.bookingId,
            vendorTenantId: cancellation.booking.vendorTenantId,
            agentTenantId: cancellation.booking.agentTenantId,
            cancellationId,
            type: FinancialEventType.VENDOR_ADJUSTMENT,
            status: FinancialEventStatus.POSTED,
            currency: cancellation.booking.currency,
            amount: delta,
            vendorAmount: delta,
            components: {
              adjustmentKind: "CANCELLATION_VENDOR_LIABILITY",
              originalVendorPayable: original.toString(),
              finalVendorPayable: final.toString(),
              signedDelta: delta.toString(),
              economicsSnapshotId: cancellation.booking.economicsSnapshot.id,
            },
            reason: dto.reason.trim(),
            reference: dto.reference.trim(),
            actorUserId: user.sub,
            occurredAt: new Date(),
          },
        });
        const resolution =
          await tx.cancellationVendorSettlementResolution.create({
            data: {
              cancellationId,
              bookingId: cancellation.bookingId,
              vendorTenantId: cancellation.booking.vendorTenantId,
              originalVendorPayable: original,
              finalVendorPayable: final,
              vendorAdjustmentAmount: delta,
              financialEventId: event.id,
              reason: dto.reason.trim(),
              reference: dto.reference.trim(),
              resolvedById: user.sub,
            },
          });
        await this.audit.write(tx, {
          actor: user,
          tenantId: cancellation.booking.vendorTenantId,
          action: "CANCELLATION_VENDOR_SETTLEMENT_RESOLVED",
          entityType: "BookingCancellation",
          entityId: cancellationId,
          reason: dto.reason,
          afterState: resolution,
        });
        return resolution;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }

  async createHold(user: AuthUser, dto: SettlementHoldDto) {
    const reason = dto.reason?.trim();
    if (!reason) throw new ConflictException("SETTLEMENT_HOLD_REASON_REQUIRED");
    const populated = [
      dto.vendorTenantId,
      dto.bookingId,
      dto.financialEventId,
    ].filter(Boolean);
    if (
      dto.scope === SettlementHoldScope.VENDOR
        ? populated.length !== 1 || !dto.vendorTenantId
        : dto.scope === SettlementHoldScope.BOOKING
          ? populated.length !== 1 || !dto.bookingId
          : populated.length !== 1 || !dto.financialEventId
    )
      throw new ConflictException("SETTLEMENT_HOLD_SCOPE_SHAPE_INVALID");
    return this.prisma.$transaction(
      async (tx) => {
        let vendorTenantId = dto.vendorTenantId;
        if (dto.bookingId) {
          const booking = await tx.booking.findUnique({
            where: { id: dto.bookingId },
            select: { vendorTenantId: true },
          });
          if (!booking) throw new NotFoundException("Booking not found");
          vendorTenantId = booking.vendorTenantId;
        }
        if (dto.financialEventId) {
          const event = await tx.financialEvent.findUnique({
            where: { id: dto.financialEventId },
            select: { vendorTenantId: true },
          });
          if (!event) throw new NotFoundException("Financial event not found");
          vendorTenantId = event.vendorTenantId;
        }
        await this.vendorIn(tx, vendorTenantId!);
        const hold = await tx.settlementHold.create({
          data: {
            scope: dto.scope,
            vendorTenantId: vendorTenantId!,
            bookingId: dto.bookingId ?? null,
            financialEventId: dto.financialEventId ?? null,
            reason,
            reference: dto.reference?.trim() || null,
            createdById: user.sub,
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId: vendorTenantId,
          action: "SETTLEMENT_HOLD_CREATED",
          entityType: "SettlementHold",
          entityId: hold.id,
          reason,
          metadata: { scope: dto.scope },
        });
        return hold;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }
  async releaseHold(user: AuthUser, id: string, reason?: string) {
    const releaseReason = reason?.trim();
    if (!releaseReason)
      throw new ConflictException("SETTLEMENT_HOLD_RELEASE_REASON_REQUIRED");
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "SettlementHold" WHERE "id" = $1 FOR UPDATE`,
          id,
        );
        const hold = await tx.settlementHold.findUnique({ where: { id } });
        if (!hold) throw new NotFoundException("Settlement hold not found");
        if (hold.status === SettlementHoldStatus.RELEASED) return hold;
        const result = await tx.settlementHold.update({
          where: { id },
          data: {
            status: SettlementHoldStatus.RELEASED,
            releasedAt: new Date(),
            releasedById: user.sub,
            releaseReason,
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId: hold.vendorTenantId,
          action: "SETTLEMENT_HOLD_RELEASED",
          entityType: "SettlementHold",
          entityId: id,
          reason: releaseReason,
        });
        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }

  async reEvaluatePayoutReadiness(user: AuthUser, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "SettlementBatch" WHERE "id" = $1 FOR UPDATE`,
          id,
        );
        const batch: any = await tx.settlementBatch.findUnique({
          where: { id },
          include: { payout: true },
        });
        if (!batch) throw new NotFoundException("Settlement batch not found");
        if (
          batch.status !== SettlementBatchStatus.PAYOUT_BLOCKED ||
          !this.decimal(batch.netPayable).gt(0)
        )
          throw new ConflictException("SETTLEMENT_BATCH_NOT_REEVALUABLE");
        if (batch.payout) return batch;
        const config = await tx.financeConfiguration.findUniqueOrThrow({
          where: { id: "default" },
        });
        if (
          config.paymentCollectionMode !== PaymentCollectionMode.VOYA_COLLECTS
        )
          throw new ConflictException("PAYOUT_BLOCKED_COLLECTION_MODEL");
        const updated: any = await tx.settlementBatch.update({
          where: { id },
          data: {
            status: SettlementBatchStatus.READY_FOR_PAYOUT,
            version: { increment: 1 },
          },
        });
        await tx.payout.create({
          data: {
            tenantId: batch.vendorTenantId,
            recordType: PayoutRecordType.CANONICAL,
            settlementBatchId: id,
            amount: batch.netPayable,
            status: PayoutStatus.READY_TO_RELEASE,
            dueDate: new Date(),
            currency: batch.currency,
          },
        });
        await this.audit.write(tx, {
          actor: user,
          tenantId: batch.vendorTenantId,
          action: "SETTLEMENT_BATCH_PAYOUT_READINESS_REEVALUATED",
          entityType: "SettlementBatch",
          entityId: id,
          afterState: updated,
        });
        await this.outbox.enqueue(tx, {
          tenantId: batch.vendorTenantId,
          eventType: "SETTLEMENT_BATCH_READY_FOR_PAYOUT",
          aggregateType: "SettlementBatch",
          aggregateId: id,
          payload: { netPayable: batch.netPayable.toString() },
        });
        return tx.settlementBatch.findUnique({
          where: { id },
          include: { payout: true, lines: true },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }

  async recordRelease(user: AuthUser, id: string, dto: ReleasePayoutDto) {
    const reference = dto.externalReference?.trim();
    if (!reference)
      throw new ConflictException("PAYOUT_EXTERNAL_REFERENCE_REQUIRED");
    const note = dto.note?.trim() || undefined;
    return this.payoutTransition(user, id, async (tx: any, payout: any) => {
      if (payout.status === PayoutStatus.RELEASED) {
        if (payout.reference === reference) return payout;
        throw new ConflictException(
          "PAYOUT_ALREADY_RELEASED_DIFFERENT_REFERENCE",
        );
      }
      if (payout.status !== PayoutStatus.READY_TO_RELEASE)
        throw new ConflictException(`PAYOUT_NOT_READY:${payout.status}`);
      const config = await tx.financeConfiguration.findUnique({
        where: { id: "default" },
      });
      if (config?.paymentCollectionMode !== PaymentCollectionMode.VOYA_COLLECTS)
        throw new ConflictException(
          "PAYMENT_COLLECTION_MODEL_NOT_VOYA_COLLECTS",
        );
      const attempt = await this.nextAttempt(
        tx,
        payout,
        PayoutAttemptStatus.RELEASE_RECORDED,
        reference,
        undefined,
        user.sub,
      );
      const updated = await tx.payout.update({
        where: { id },
        data: {
          status: PayoutStatus.RELEASED,
          reference,
          releasedAt: new Date(),
          releasedById: user.sub,
          version: { increment: 1 },
        },
      });
      await tx.settlementBatch.update({
        where: { id: payout.settlementBatchId },
        data: {
          status: SettlementBatchStatus.RELEASED,
          releasedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.settlementEventAllocation.updateMany({
        where: {
          batchId: payout.settlementBatchId,
          status: SettlementAllocationStatus.ALLOCATED,
        },
        data: {
          status: SettlementAllocationStatus.SETTLED,
          releasedAt: new Date(),
        },
      });
      await tx.financialEvent.create({
        data: {
          eventKey: `payout-released:${id}:${attempt.id}`,
          vendorTenantId: payout.tenantId,
          settlementBatchId: payout.settlementBatchId,
          payoutId: id,
          type: FinancialEventType.PAYOUT_RELEASED,
          status: FinancialEventStatus.POSTED,
          currency: payout.currency,
          amount: payout.amount,
          vendorAmount: payout.amount,
          components: { externalReference: reference, note: note ?? null },
          reference,
          actorUserId: user.sub,
          occurredAt: new Date(),
        },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId: payout.tenantId,
        action: "PAYOUT_RELEASE_RECORDED",
        entityType: "Payout",
        entityId: id,
        metadata: {
          externalReference: reference,
          note: note ?? null,
          attemptId: attempt.id,
        },
      });
      await this.outbox.enqueue(tx, {
        tenantId: payout.tenantId,
        eventType: "PAYOUT_RELEASE_RECORDED",
        aggregateType: "Payout",
        aggregateId: id,
        payload: {
          externalReference: reference,
          amount: payout.amount.toString(),
          currency: payout.currency,
        },
      });
      return updated;
    });
  }
  async recordFailure(user: AuthUser, id: string, dto: FailPayoutDto) {
    const reason = dto.failureReason?.trim();
    if (!reason) throw new ConflictException("PAYOUT_FAILURE_REASON_REQUIRED");
    const reference = dto.reference?.trim() || undefined;
    const note = dto.note?.trim() || undefined;
    return this.payoutTransition(user, id, async (tx: any, payout: any) => {
      if (
        payout.recordType !== PayoutRecordType.CANONICAL ||
        payout.status !== PayoutStatus.READY_TO_RELEASE
      )
        throw new ConflictException("PAYOUT_NOT_READY_FOR_FAILURE_RECORD");
      const attempt = await this.nextAttempt(
        tx,
        payout,
        PayoutAttemptStatus.FAILED,
        reference,
        reason,
        user.sub,
      );
      const updated = await tx.payout.update({
        where: { id },
        data: {
          status: PayoutStatus.RELEASE_FAILED,
          failureReason: reason,
          version: { increment: 1 },
        },
      });
      await tx.settlementBatch.update({
        where: { id: payout.settlementBatchId },
        data: {
          status: SettlementBatchStatus.RECONCILIATION_REQUIRED,
          version: { increment: 1 },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId: payout.tenantId,
        action: "PAYOUT_RELEASE_FAILED",
        entityType: "Payout",
        entityId: id,
        reason,
        metadata: {
          attemptId: attempt.id,
          reference: reference ?? null,
          note: note ?? null,
        },
      });
      await this.outbox.enqueue(tx, {
        tenantId: payout.tenantId,
        eventType: "PAYOUT_RELEASE_FAILED",
        aggregateType: "Payout",
        aggregateId: id,
        payload: {
          reason,
          reference: reference ?? null,
          amount: payout.amount.toString(),
          currency: payout.currency,
        },
      });
      return updated;
    });
  }
  async retry(user: AuthUser, id: string) {
    return this.payoutTransition(user, id, async (tx: any, payout: any) => {
      if (payout.recordType !== PayoutRecordType.CANONICAL)
        throw new ConflictException("CANONICAL_PAYOUT_REQUIRED");
      if (payout.status !== PayoutStatus.RELEASE_FAILED)
        throw new ConflictException("PAYOUT_NOT_FAILED");
      const result = await tx.payout.update({
        where: { id },
        data: {
          status: PayoutStatus.READY_TO_RELEASE,
          failureReason: null,
          version: { increment: 1 },
        },
      });
      await tx.settlementBatch.update({
        where: { id: payout.settlementBatchId },
        data: {
          status: SettlementBatchStatus.READY_FOR_PAYOUT,
          version: { increment: 1 },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId: payout.tenantId,
        action: "PAYOUT_RETRY_READY",
        entityType: "Payout",
        entityId: id,
      });
      await this.outbox.enqueue(tx, {
        tenantId: payout.tenantId,
        eventType: "PAYOUT_RETRY_READY",
        aggregateType: "Payout",
        aggregateId: id,
        payload: {
          payoutId: id,
          amount: payout.amount.toString(),
          currency: payout.currency,
        },
      });
      return result;
    });
  }
  async reconcile(user: AuthUser, id: string, dto: ReconcilePayoutDto) {
    const reference = dto.reconciliationReference?.trim();
    if (!reference)
      throw new ConflictException("PAYOUT_RECONCILIATION_REFERENCE_REQUIRED");
    const confirmed = this.nonNegative(dto.confirmedAmount);
    const note = dto.note?.trim() || undefined;
    return this.payoutTransition(user, id, async (tx: any, payout: any) => {
      if (payout.recordType !== PayoutRecordType.CANONICAL)
        throw new ConflictException("CANONICAL_PAYOUT_REQUIRED");
      if (payout.status === PayoutStatus.RECONCILED) {
        if (
          confirmed.eq(payout.reconciledAmount) &&
          payout.reconciliationReference === reference
        )
          return payout;
        throw new ConflictException("PAYOUT_RECONCILIATION_IMMUTABLE");
      }
      if (
        ![PayoutStatus.RELEASED, PayoutStatus.RECONCILIATION_REQUIRED].includes(
          payout.status,
        )
      )
        throw new ConflictException("PAYOUT_NOT_RECONCILABLE");
      const matches = confirmed.eq(payout.amount);
      const result = await tx.payout.update({
        where: { id },
        data: {
          status: matches
            ? PayoutStatus.RECONCILED
            : PayoutStatus.RECONCILIATION_REQUIRED,
          reconciledAt: matches ? new Date() : null,
          reconciledById: user.sub,
          reconciledAmount: confirmed,
          reconciliationReference: reference,
          reconciliationNote: note ?? null,
          version: { increment: 1 },
        },
      });
      await tx.settlementBatch.update({
        where: { id: payout.settlementBatchId },
        data: {
          status: matches
            ? SettlementBatchStatus.RECONCILED
            : SettlementBatchStatus.RECONCILIATION_REQUIRED,
          reconciledAt: matches ? new Date() : null,
          version: { increment: 1 },
        },
      });
      await this.audit.write(tx, {
        actor: user,
        tenantId: payout.tenantId,
        action: matches
          ? "PAYOUT_RECONCILED"
          : "PAYOUT_RECONCILIATION_REQUIRED",
        entityType: "Payout",
        entityId: id,
        reason: note,
        metadata: {
          confirmedAmount: confirmed.toString(),
          expectedAmount: payout.amount.toString(),
          reference,
        },
      });
      const eventType = matches
        ? "PAYOUT_RECONCILED"
        : "PAYOUT_RECONCILIATION_REQUIRED";
      await this.outbox.enqueue(tx, {
        tenantId: payout.tenantId,
        eventType,
        aggregateType: "Payout",
        aggregateId: id,
        payload: {
          confirmedAmount: confirmed.toString(),
          expectedAmount: payout.amount.toString(),
          reference,
          currency: payout.currency,
        },
      });
      return result;
    });
  }

  listBatches(vendorTenantId?: string) {
    return this.prisma.settlementBatch.findMany({
      where: vendorTenantId ? { vendorTenantId } : {},
      include: { lines: true, payout: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
  holds() {
    return this.prisma.settlementHold.findMany({
      where: { status: SettlementHoldStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
  batch(id: string) {
    return this.prisma.settlementBatch.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { include: { allocations: true } },
        payout: true,
        financialEvents: true,
      },
    });
  }
  events(vendorTenantId?: string) {
    return this.prisma.financialEvent.findMany({
      where: vendorTenantId ? { vendorTenantId } : {},
      orderBy: { occurredAt: "desc" },
      take: 500,
    });
  }
  payouts(vendorTenantId?: string) {
    return this.prisma.payout.findMany({
      where: {
        recordType: PayoutRecordType.CANONICAL,
        ...(vendorTenantId ? { tenantId: vendorTenantId } : {}),
      },
      include: { settlementBatch: true, attempts: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async vendorSettlements(user: AuthUser) {
    const vendorTenantId = requireTenant(user);
    const [batches, payouts, legacyPayouts] = await Promise.all([
      this.prisma.settlementBatch.findMany({
        where: { vendorTenantId },
        include: { lines: true, payout: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payout.findMany({
        where: {
          tenantId: vendorTenantId,
          recordType: PayoutRecordType.CANONICAL,
        },
        include: { settlementBatch: true, attempts: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payout.findMany({
        where: {
          tenantId: vendorTenantId,
          recordType: PayoutRecordType.LEGACY,
        },
        orderBy: { dueDate: "desc" },
      }),
    ]);
    return {
      batches: batches.map((b: any) => ({
        ...b,
        lines: b.lines.map(this.publicLine),
      })),
      payouts,
      legacyPayouts,
    };
  }

  private async payoutTransition(
    user: AuthUser,
    id: string,
    work: (tx: any, payout: any) => Promise<any>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "Payout" WHERE "id" = $1 FOR UPDATE`,
          id,
        );
        const payout = await tx.payout.findUnique({ where: { id } });
        if (!payout) throw new NotFoundException("Payout not found");
        return work(tx, payout);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 30000,
      },
    );
  }
  private async nextAttempt(
    tx: any,
    payout: any,
    status: PayoutAttemptStatus,
    reference?: string,
    failureReason?: string,
    actorUserId = "system",
  ) {
    const last = await tx.payoutAttempt.findFirst({
      where: { payoutId: payout.id },
      orderBy: { attemptNumber: "desc" },
    });
    return tx.payoutAttempt.create({
      data: {
        payoutId: payout.id,
        attemptNumber: (last?.attemptNumber ?? 0) + 1,
        status,
        amount: payout.amount,
        currency: payout.currency,
        externalReference: reference ?? null,
        failureReason: failureReason ?? null,
        actorUserId,
        occurredAt: new Date(),
      },
    });
  }
  private blockReasons(event: any, booking: any, policy: any): string[] {
    const reasons: string[] = [];
    if (!policy) reasons.push("SETTLEMENT_POLICY_MISSING");
    else {
      if (policy.reviewRequired)
        reasons.push("SETTLEMENT_POLICY_REVIEW_REQUIRED");
      if (!policy.active) reasons.push("SETTLEMENT_POLICY_INACTIVE");
      if (
        policy.cycleMode === "WEEKLY" &&
        (policy.weeklyDay === null || policy.weeklyDay === undefined)
      )
        reasons.push("SETTLEMENT_POLICY_INVALID");
    }
    if (booking) {
      const trigger = policy?.eligibilityTrigger;
      if (trigger === SettlementEligibilityTrigger.SERVICE_COMPLETED) {
        const completion = booking.events
          ?.filter((e: any) => e.eventType === "BOOKING_COMPLETED")
          .sort(
            (a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt),
          )[0];
        if (!completion) reasons.push("SERVICE_NOT_COMPLETED");
        else this.delayReason(reasons, completion.createdAt, policy, event);
      }
      if (trigger === SettlementEligibilityTrigger.SERVICE_REDEEMED) {
        if (!booking.redemption) reasons.push("SERVICE_NOT_REDEEMED");
        else
          this.delayReason(
            reasons,
            booking.redemption.redeemedAt,
            policy,
            event,
          );
      }
      if (trigger === SettlementEligibilityTrigger.BOOKING_CONFIRMED) {
        if (!booking.confirmedAt) reasons.push("BOOKING_NOT_CONFIRMED");
        else this.delayReason(reasons, booking.confirmedAt, policy, event);
      }
      const refundStatus = booking.cancellation?.refund?.status;
      if (
        refundStatus === "PENDING" ||
        booking.cancellation?.financialState === "REFUND_PENDING"
      )
        reasons.push("REFUND_PENDING");
      if (
        refundStatus === "FAILED" ||
        booking.cancellation?.financialState === "REFUND_FAILED"
      )
        reasons.push("REFUND_FAILED");
      if (
        booking.status === "CANCELLED" &&
        !booking.cancellation?.vendorSettlementResolution
      )
        reasons.push("CANCELLATION_VENDOR_LIABILITY_UNRESOLVED");
    } else if (policy)
      this.delayReason(reasons, event.occurredAt, policy, event);
    return reasons;
  }
  private delayReason(
    reasons: string[],
    triggerAt: any,
    policy: any,
    event: any,
  ) {
    if (!triggerAt || !policy?.settlementDelayDays) return;
    const eligibleAt = new Date(
      new Date(triggerAt).getTime() + policy.settlementDelayDays * 86400000,
    );
    event._settlementTiming = {
      triggerAt: new Date(triggerAt).toISOString(),
      eligibleAt: eligibleAt.toISOString(),
    };
    if (new Date() < eligibleAt) reasons.push("SETTLEMENT_DELAY_NOT_REACHED");
  }
  private scopeHoldReasons(
    holds: any[],
    vendorTenantId: string,
    bookingId: string | null,
    eventIds: string[],
  ) {
    const reasons: string[] = [];
    if (
      holds.some(
        (hold) =>
          hold.scope === SettlementHoldScope.VENDOR &&
          hold.vendorTenantId === vendorTenantId,
      )
    )
      reasons.push("SETTLEMENT_VENDOR_HOLD");
    if (
      bookingId &&
      holds.some(
        (hold) =>
          hold.scope === SettlementHoldScope.BOOKING &&
          hold.bookingId === bookingId,
      )
    )
      reasons.push("SETTLEMENT_BOOKING_HOLD");
    if (
      eventIds.some((id) =>
        holds.some(
          (hold) =>
            hold.scope === SettlementHoldScope.FINANCIAL_EVENT &&
            hold.financialEventId === id,
        ),
      )
    )
      reasons.push("SETTLEMENT_EVENT_HOLD");
    return reasons;
  }
  private explanation(event: any, booking: any, policy: any) {
    return {
      eventId: event?.id ?? null,
      bookingId: booking?.id ?? null,
      policyVersion: policy?.version ?? null,
      triggerAt: event?._settlementTiming?.triggerAt ?? null,
      eligibleAt: event?._settlementTiming?.eligibleAt ?? null,
    };
  }
  private selectPreview(preview: any, selected: string[]) {
    const selectedSet = new Set(selected);
    const lines = preview.eligibleLines.filter((line: any) =>
      line.sourceEventIds.some((id: string) => selectedSet.has(id)),
    );
    if (
      lines.some(
        (line: any) =>
          line.sourceEventIds.some((id: string) => selectedSet.has(id)) &&
          line.sourceEventIds.some((id: string) => !selectedSet.has(id)),
      )
    )
      throw new ConflictException("SETTLEMENT_SELECTED_LINE_INCOMPLETE");
    const totals = lines.reduce(
      (a: any, line: any) => ({
        grossBookingValue: a.grossBookingValue.plus(
          this.decimal(line.grossBookingValue),
        ),
        vendorBasePayable: a.vendorBasePayable.plus(
          this.decimal(line.vendorPayableBase),
        ),
        adjustmentTotal: a.adjustmentTotal.plus(
          this.decimal(line.adjustmentAmount),
        ),
        netPayable: a.netPayable.plus(this.decimal(line.netVendorPayable)),
      }),
      {
        grossBookingValue: this.zero(),
        vendorBasePayable: this.zero(),
        adjustmentTotal: this.zero(),
        netPayable: this.zero(),
      },
    );
    const result = {
      ...preview,
      eligibleLines: lines,
      totals: this.moneyObject(totals),
      blocked: [],
      alreadyAllocated: [],
    };
    return {
      ...result,
      previewFingerprint: this.fingerprint({
        vendorTenantId: result.vendorTenantId,
        currency: result.currency,
        policyVersion: result.policy?.version ?? null,
        eligibleLines: result.eligibleLines,
        blocked: result.blocked,
        alreadyAllocated: result.alreadyAllocated,
        totals: result.totals,
      }),
    };
  }
  private addStandalone(grouped: Map<string, any>, event: any) {
    const key = `event:${event.id}`;
    grouped.set(key, {
      bookingId: null,
      lineType: "ADJUSTMENT",
      currency: event.currency,
      sourceEventIds: [event.id],
      grossBookingValue: this.zero(),
      vendorPayableBase: this.zero(),
      adjustmentAmount: this.decimal(event.vendorAmount ?? event.amount),
      taxInformational: this.zero(),
      components: {
        adjustment: true,
        reason: event.reason,
        reference: event.reference,
      },
    });
  }
  private vendorComponents(event: any, booking: any) {
    const c = event.components ?? {};
    return {
      bookingValue: String(booking.amount),
      supplierGrossBasis: c.supplierGrossBasis ?? null,
      supplierCommission: c.supplierCommission ?? null,
      baseVendorPayable: String(event.vendorAmount ?? c.vendorPayable ?? 0),
      taxInformational: c.taxAmount ?? null,
      promotionAmount: c.promotionAmount ?? null,
      promotionFunder: c.promotionFunder ?? null,
    };
  }
  private publicLine(line: any) {
    return {
      ...line,
      grossBookingValue: String(line.grossBookingValue),
      vendorPayableBase: String(line.vendorPayableBase),
      adjustmentAmount: String(line.adjustmentAmount),
      netVendorPayable: String(line.netVendorPayable ?? 0),
      taxInformational: String(line.taxInformational),
    };
  }
  private vendorPreviewProjection(response: any) {
    return {
      ...response,
      eligibleLines: response.eligibleLines.map((line: any) => ({
        ...line,
        components: {
          bookingValue: line.components.bookingValue,
          baseVendorPayable: line.components.baseVendorPayable,
          taxInformational: line.components.taxInformational,
          promotionAmount: line.components.promotionAmount,
          promotionFunder: line.components.promotionFunder,
        },
      })),
    };
  }
  private moneyObject(value: any) {
    return Object.fromEntries(
      Object.entries(value).map(([key, amount]) => [key, String(amount)]),
    );
  }
  private requireCurrency(value: string) {
    const currency = String(value ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new ConflictException("SETTLEMENT_CURRENCY_REQUIRED");
    return currency;
  }
  private decimal(value: any) {
    return value === null || value === undefined || value === ""
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(String(value));
  }
  private zero() {
    return new Prisma.Decimal(0);
  }
  private nonNegative(value: string) {
    const amount = this.decimal(value);
    if (!amount || amount.lt(0))
      throw new ConflictException("AMOUNT_MUST_BE_NON_NEGATIVE");
    return amount;
  }
  private signed(value: string) {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value))
      throw new ConflictException("SIGNED_AMOUNT_INVALID");
    return new Prisma.Decimal(value);
  }
  private fingerprint(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  private isVendor(user: AuthUser) {
    return user.role === UserRole.VENDOR;
  }
  private scopeVendor(user: AuthUser, requested?: string) {
    if (this.isVendor(user)) return requireTenant(user);
    if (!requested) throw new ConflictException("vendorTenantId is required");
    return requested;
  }
  private async vendorIn(client: any, id: string) {
    const vendor = await client.tenant.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException("Vendor tenant not found");
    return vendor;
  }
  private async vendor(id: string) {
    const vendor = await this.prisma.tenant.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException("Vendor tenant not found");
    return vendor;
  }
}
