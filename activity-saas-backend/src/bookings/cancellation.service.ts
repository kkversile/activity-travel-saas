import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingRecordType, BookingStatus, CancellationFinancialState, CancellationInitiator, CancellationReasonCategory, FinancialEventStatus, FinancialEventType, Prisma, RefundStatus, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.types';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryReservationService, ReservationTx } from '../inventory/inventory-reservation.service';
import { AdminCancellationListQueryDto, AgentCancellationDto, FinancialResolutionDto, OperationalCancellationDto, RefundConfirmDto, RefundFailDto } from './cancellation.dto';
import { fingerprint } from './booking-fingerprint';

const bookingInclude: any = { operationalSnapshot: true, economicsSnapshot: true, travellers: { orderBy: { sequence: 'asc' } }, events: { orderBy: { createdAt: 'asc' } }, inventoryHolds: true, inventoryAllocations: true, vendorTenant: { select: { id: true, name: true } }, agentTenant: { select: { id: true, name: true } }, product: { select: { id: true, productCode: true } }, ratePlan: { select: { id: true, ratePlanCode: true, name: true } }, cancellation: { include: { refund: true, financialEvents: true } } };

@Injectable()
export class CancellationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly inventory: InventoryReservationService) {}

  async agentPreview(user: AuthUser, bookingId: string) {
    const tenantId = this.requireAgent(user);
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, agentTenantId: tenantId }, include: bookingInclude });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.previewProjection(booking, CancellationInitiator.AGENT);
  }

  async vendorPreview(user: AuthUser, bookingId: string) {
    const tenantId = this.requireVendor(user);
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, vendorTenantId: tenantId }, include: bookingInclude });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.previewProjection(booking, CancellationInitiator.VENDOR);
  }

  async adminPreview(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.previewProjection(booking, CancellationInitiator.ADMIN);
  }

  async agentCancel(user: AuthUser, bookingId: string, dto: AgentCancellationDto, idempotencyKey: string) {
    const agentTenantId = this.requireAgent(user);
    if (!idempotencyKey?.trim()) throw new ConflictException('Idempotency-Key is required');
    if (!dto.reason?.trim()) throw new ConflictException('Cancellation reason is required');
    if (!dto.acknowledged) throw new ConflictException('CANCELLATION_ACK_REQUIRED');
    const key = idempotencyKey.trim();
    const requestFingerprint = this.requestFingerprint(bookingId, key, dto.reasonCategory, dto.reason);
    const existing = await this.prisma.bookingCancellation.findFirst({ where: { bookingId, idempotencyKey: key, booking: { agentTenantId: agentTenantId } }, include: { refund: true, financialEvents: true, booking: { include: bookingInclude } } });
    if (existing) { if (existing.requestFingerprint !== requestFingerprint) throw new ConflictException('CANCELLATION_IDEMPOTENCY_KEY_REUSED'); return this.agentProjection(existing.booking, existing); }
    const now = new Date();
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const booking = await this.lockBooking(tx, bookingId);
        if (booking.agentTenantId !== agentTenantId) throw new NotFoundException('Booking not found');
        const existingCancellation = await tx.bookingCancellation.findUnique({ where: { bookingId }, include: { refund: true, financialEvents: true } });
        if (existingCancellation) return { booking, cancellation: existingCancellation };
        if (booking.recordType !== BookingRecordType.CANONICAL) throw new ConflictException('LEGACY_CANCELLATION_COMPATIBILITY_ONLY');
        if (![BookingStatus.CONFIRMED, BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.PENDING_MANUAL_REVIEW].includes(booking.status as any)) throw new ConflictException('BOOKING_NOT_CANCELLABLE');
        const calculation = booking.status === BookingStatus.CONFIRMED ? this.calculate(booking, now) : this.pendingCalculation(booking, now);
        if (!calculation.eligible && booking.status === BookingStatus.CONFIRMED) throw new ConflictException(calculation.reasonCodes[0]);
        if (dto.expectedCancellationFingerprint !== calculation.cancellationFingerprint) throw new ConflictException('CANCELLATION_TERMS_CHANGED');
        let allocationCount = 0;
        if (booking.status === BookingStatus.CONFIRMED) {
          const allocations = await tx.inventoryAllocation.findMany({ where: { bookingId, status: 'CONFIRMED' } });
          if (!allocations.length) throw new ConflictException('CANCELLATION_ALLOCATION_MISSING');
          if (allocations.length > 1) throw new ConflictException('CANCELLATION_ALLOCATION_AMBIGUOUS');
          await this.inventory.releaseAllocationInTransaction(tx, allocations[0].id, 'agent cancellation', user); allocationCount = 1;
        } else {
          const holds = await tx.inventoryHold.findMany({ where: { bookingId, status: 'ACTIVE' } });
          const hold = this.requirePendingHold(holds);
          await this.inventory.releaseHoldInTransaction(tx, hold.id, 'pending booking withdrawal', user); allocationCount = 0;
        }
        const financialState = booking.status === BookingStatus.CONFIRMED ? calculation.financialState : CancellationFinancialState.CANCELLED_PENDING_FINANCIAL;
        const cancellation: any = await tx.bookingCancellation.create({ data: { bookingId, initiator: CancellationInitiator.AGENT, initiatedByUserId: user.sub, initiatedByTenantId: agentTenantId, reasonCategory: dto.reasonCategory, reason: dto.reason.trim(), cancelledAt: now, serviceTimezone: calculation.serviceTimezone, serviceDateLocal: calculation.serviceDateLocal, cancellationDateLocal: calculation.cancellationDateLocal, daysBeforeService: calculation.daysBeforeService, policyFingerprint: calculation.policyFingerprint, matchedPolicyRule: calculation.matchedPolicyRule as Prisma.InputJsonValue, bookingAmount: calculation.bookingAmount, currency: calculation.currency, cancellationCharge: calculation.cancellationCharge, refundEntitlement: calculation.refundEntitlement, financialState, idempotencyKey: key, requestFingerprint, calculationSnapshot: { ...calculation, allocationCount } as Prisma.InputJsonValue } });
        const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.CANCELLED, version: { increment: 1 } } });
        await this.addBookingEvent(tx, updated, booking.status === BookingStatus.CONFIRMED ? 'AGENT_CANCELLED' : 'AGENT_WITHDREW_PENDING', booking.status, BookingStatus.CANCELLED, user, dto.reason.trim());
        await this.addFinancialEvent(tx, { eventKey: `booking:${bookingId}:cancelled`, bookingId, cancellationId: cancellation.id, type: FinancialEventType.BOOKING_CANCELLED, status: FinancialEventStatus.POSTED, currency: calculation.currency, amount: calculation.cancellationCharge, components: { initiator: 'AGENT', originalBookingAmount: calculation.bookingAmount.toString(), cancellationCharge: calculation.cancellationCharge.toString(), refundEntitlement: calculation.refundEntitlement.toString(), policyFingerprint: calculation.policyFingerprint, matchedRule: calculation.matchedPolicyRule, financialState, economicsSnapshotId: (booking.economicsSnapshot as any)?.id ?? null }, reason: dto.reason.trim(), actorUserId: user.sub, occurredAt: now });
        if (financialState === CancellationFinancialState.REFUND_PENDING) await this.createRefund(tx, cancellation, calculation.refundEntitlement, calculation.currency, user.sub, now);
        await this.audit.write(tx, { actor: user, tenantId: agentTenantId, action: 'BOOKING_CANCELLED_AGENT', entityType: 'BookingCancellation', entityId: cancellation.id, reason: dto.reason });
        await this.outbox.enqueue(tx, { tenantId: agentTenantId, eventType: 'BOOKING_CANCELLED_AGENT', aggregateType: 'Booking', aggregateId: bookingId, payload: { bookingCode: booking.bookingCode, financialState } });
        return { booking: await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { ...bookingInclude, cancellation: { include: { refund: true, financialEvents: true } } } }), cancellation: await tx.bookingCancellation.findUniqueOrThrow({ where: { id: cancellation.id }, include: { refund: true, financialEvents: true } }) };
      }, { timeout: 30000, maxWait: 30000 });
      return this.agentProjection(saved.booking, saved.cancellation);
    } catch (error: any) {
      if (error?.code === 'P2002') { const duplicate = await this.prisma.bookingCancellation.findFirst({ where: { bookingId, idempotencyKey: key, booking: { agentTenantId: agentTenantId } }, include: { refund: true, financialEvents: true, booking: { include: bookingInclude } } }); if (duplicate) { if (duplicate.requestFingerprint !== requestFingerprint) throw new ConflictException('CANCELLATION_IDEMPOTENCY_KEY_REUSED'); return this.agentProjection(duplicate.booking, duplicate); } const owned = await this.prisma.booking.findFirst({ where: { id: bookingId, agentTenantId }, select: { id: true } }); if (!owned) throw new NotFoundException('Booking not found'); }
      throw error;
    }
  }

  async operationalCancel(user: AuthUser, bookingId: string, dto: OperationalCancellationDto, initiator: CancellationInitiator, idempotencyKey?: string) {
    if (!dto.reason?.trim()) throw new ConflictException('Cancellation reason is required');
    const tenantId = initiator === CancellationInitiator.VENDOR ? this.requireVendor(user) : null;
    const now = new Date();
    const existing = await this.prisma.bookingCancellation.findFirst({ where: { bookingId, ...(tenantId ? { booking: { vendorTenantId: tenantId } } : {}) }, include: { booking: { include: bookingInclude }, refund: true, financialEvents: true } });
    if (existing) return this.roleProjection(existing.booking, existing, initiator);
    const key = idempotencyKey?.trim() || null;
    const saved = await this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, bookingId);
      if (tenantId && booking.vendorTenantId !== tenantId) throw new NotFoundException('Booking not found');
      if (booking.recordType !== BookingRecordType.CANONICAL) throw new ConflictException('LEGACY_CANCELLATION_COMPATIBILITY_ONLY');
      const already = await tx.bookingCancellation.findUnique({ where: { bookingId }, include: { refund: true, financialEvents: true } });
      if (already) return { booking, cancellation: already };
      if (![BookingStatus.CONFIRMED, BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.PENDING_MANUAL_REVIEW].includes(booking.status as any)) throw new ConflictException('BOOKING_NOT_CANCELLABLE');
      const allocations = booking.status === BookingStatus.CONFIRMED ? await tx.inventoryAllocation.findMany({ where: { bookingId, status: 'CONFIRMED' } }) : [];
      if (allocations.length > 1) throw new ConflictException('CANCELLATION_ALLOCATION_AMBIGUOUS');
      if (booking.status === BookingStatus.CONFIRMED && !allocations.length) throw new ConflictException('CANCELLATION_ALLOCATION_MISSING');
      if (allocations.length) await this.inventory.releaseAllocationInTransaction(tx, allocations[0].id, `${initiator.toLowerCase()} cancellation`, user);
      else { const holds = await tx.inventoryHold.findMany({ where: { bookingId, status: 'ACTIVE' } }); const hold = this.requirePendingHold(holds); await this.inventory.releaseHoldInTransaction(tx, hold.id, `${initiator.toLowerCase()} cancellation`, user); }
      const provenance = this.operationalProvenance(booking, now);
      const cancellation: any = await tx.bookingCancellation.create({ data: { bookingId, initiator, initiatedByUserId: user.sub, initiatedByTenantId: tenantId, reasonCategory: dto.reasonCategory, reason: dto.reason.trim(), cancelledAt: now, serviceTimezone: provenance.serviceTimezone, serviceDateLocal: provenance.serviceDateLocal, cancellationDateLocal: provenance.cancellationDateLocal, daysBeforeService: provenance.daysBeforeService, policyFingerprint: null, matchedPolicyRule: Prisma.JsonNull, bookingAmount: booking.amount, currency: booking.currency, cancellationCharge: 0, refundEntitlement: 0, financialState: CancellationFinancialState.CANCELLED_PENDING_FINANCIAL, idempotencyKey: key, requestFingerprint: this.requestFingerprint(bookingId, key ?? 'operational', dto.reasonCategory, dto.reason), calculationSnapshot: { initiator, policy: 'not applied; financial responsibility pending', ...provenance } } });
      const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.CANCELLED, version: { increment: 1 } } });
      await this.addBookingEvent(tx, updated, initiator === CancellationInitiator.VENDOR ? 'VENDOR_CANCELLED' : 'ADMIN_CANCELLED', booking.status, BookingStatus.CANCELLED, user, dto.reason.trim());
      await this.addFinancialEvent(tx, { eventKey: `booking:${bookingId}:cancelled`, bookingId, cancellationId: cancellation.id, type: FinancialEventType.BOOKING_CANCELLED, status: FinancialEventStatus.PENDING, currency: booking.currency, amount: null, components: { initiator, originalBookingAmount: booking.amount.toString(), currency: booking.currency, reasonCategory: dto.reasonCategory, financialState: CancellationFinancialState.CANCELLED_PENDING_FINANCIAL, economicsSnapshotId: (booking.economicsSnapshot as any)?.id ?? null }, reason: dto.reason.trim(), actorUserId: user.sub, occurredAt: now });
      await this.audit.write(tx, { actor: user, tenantId: tenantId ?? undefined, action: initiator === CancellationInitiator.VENDOR ? 'BOOKING_CANCELLED_VENDOR' : 'BOOKING_CANCELLED_ADMIN', entityType: 'BookingCancellation', entityId: cancellation.id, reason: dto.reason });
      await this.outbox.enqueue(tx, { tenantId: tenantId ?? undefined, eventType: initiator === CancellationInitiator.VENDOR ? 'BOOKING_CANCELLED_VENDOR' : 'BOOKING_CANCELLED_ADMIN', aggregateType: 'Booking', aggregateId: bookingId, payload: { bookingCode: booking.bookingCode, financialState: CancellationFinancialState.CANCELLED_PENDING_FINANCIAL } });
      return { booking: updated, cancellation };
    }, { timeout: 30000, maxWait: 30000 });
    return this.roleProjection(saved.booking, saved.cancellation, initiator);
  }

  async refunds() { return this.prisma.refund.findMany({ include: { cancellation: true, booking: { select: { id: true, bookingCode: true, status: true, currency: true, customerName: true, vendorTenantId: true } } }, orderBy: { createdAt: 'asc' } }); }

  async operationalCancellations(query: AdminCancellationListQueryDto = {}) {
    const rows = await this.prisma.bookingCancellation.findMany({ where: { ...(query.financialState ? { financialState: query.financialState } : {}), ...(query.initiator ? { initiator: query.initiator } : {}), ...(query.createdFrom || query.createdTo ? { createdAt: { ...(query.createdFrom ? { gte: new Date(`${query.createdFrom}T00:00:00.000Z`) } : {}), ...(query.createdTo ? { lte: new Date(`${query.createdTo}T23:59:59.999Z`) } : {}) } } : {}) }, include: { booking: { select: { id: true, bookingCode: true, vendorTenant: { select: { id: true, name: true } }, agentTenant: { select: { id: true, name: true } } } } }, orderBy: { cancelledAt: 'desc' } });
    return rows.map((row) => ({ cancellationId: row.id, bookingCode: row.booking.bookingCode, vendor: row.booking.vendorTenant, agent: row.booking.agentTenant, initiator: row.initiator, reasonCategory: row.reasonCategory, reason: row.reason, bookingAmount: row.bookingAmount.toString(), currency: row.currency, cancellationCharge: row.cancellationCharge.toString(), refundEntitlement: row.refundEntitlement.toString(), financialState: row.financialState, cancelledAt: row.cancelledAt }));
  }

  async confirmRefund(user: AuthUser, id: string, dto: RefundConfirmDto) { if (!dto.externalReference?.trim()) throw new ConflictException('External reference is required'); return this.refundTransition(user, id, 'CONFIRM', dto.externalReference.trim(), dto.note); }
  async failRefund(user: AuthUser, id: string, dto: RefundFailDto) { if (!dto.reason?.trim()) throw new ConflictException('Refund failure reason is required'); return this.refundTransition(user, id, 'FAIL', dto.reason.trim(), dto.reason); }
  async retryRefund(user: AuthUser, id: string) { return this.refundTransition(user, id, 'RETRY', 'retry', 'Explicit finance retry'); }

  async resolveFinancial(user: AuthUser, cancellationId: string, dto: FinancialResolutionDto) {
    if (!dto.reason?.trim()) throw new ConflictException('Resolution reason is required');
    const charge = this.financialMoney(dto.cancellationCharge, 'cancellationCharge');
    const refund = this.financialMoney(dto.refundEntitlement, 'refundEntitlement');
    const saved = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM "public"."BookingCancellation" WHERE "id" = $1 FOR UPDATE`, cancellationId);
      if (!locked[0]) throw new NotFoundException('Cancellation not found');
      const cancellation = await tx.bookingCancellation.findUniqueOrThrow({ where: { id: cancellationId }, include: { booking: { include: { economicsSnapshot: true } }, refund: true } });
      if (cancellation.financialState !== CancellationFinancialState.CANCELLED_PENDING_FINANCIAL) throw new ConflictException('FINANCIAL_STATE_NOT_PENDING');
      if (cancellation.refund) throw new ConflictException('FINANCIAL_STATE_ALREADY_RESOLVED');
      const bookingAmount = this.round(this.money(cancellation.bookingAmount));
      const roundedCharge = this.round(charge); const roundedRefund = this.round(refund);
      if (roundedCharge.lt(0) || roundedRefund.lt(0)) throw new ConflictException('FINANCIAL_AMOUNT_NEGATIVE');
      if (roundedCharge.gt(bookingAmount)) throw new ConflictException('CANCELLATION_CHARGE_EXCEEDS_BOOKING_AMOUNT');
      if (roundedRefund.gt(bookingAmount)) throw new ConflictException('REFUND_ENTITLEMENT_EXCEEDS_BOOKING_AMOUNT');
      if (!roundedCharge.plus(roundedRefund).eq(bookingAmount)) throw new ConflictException('FINANCIAL_TOTAL_MISMATCH');
      const now = new Date(); const previousFinancialState = cancellation.financialState;
      const state = roundedRefund.eq(0) ? CancellationFinancialState.CANCELLED_NO_REFUND : CancellationFinancialState.REFUND_PENDING;
      const updated = await tx.bookingCancellation.update({ where: { id: cancellation.id }, data: { cancellationCharge: roundedCharge, refundEntitlement: roundedRefund, financialState: state, calculationSnapshot: { ...((cancellation.calculationSnapshot as any) ?? {}), financeResolution: { charge: roundedCharge.toString(), refund: roundedRefund.toString(), reason: dto.reason.trim() } } } });
      await this.addFinancialEvent(tx, { eventKey: `cancellation:${cancellationId}:financial-resolved`, bookingId: cancellation.bookingId, cancellationId, type: FinancialEventType.CANCELLATION_FINANCIAL_RESOLVED, status: FinancialEventStatus.POSTED, currency: cancellation.currency, amount: roundedCharge, components: { originalBookingAmount: bookingAmount.toString(), resolvedCancellationCharge: roundedCharge.toString(), resolvedRefundEntitlement: roundedRefund.toString(), initiator: cancellation.initiator, resolutionReason: dto.reason.trim(), previousFinancialState, newFinancialState: state, economicsSnapshotId: cancellation.booking.economicsSnapshot?.id ?? null }, reason: dto.reason.trim(), actorUserId: user.sub, occurredAt: now });
      if (!roundedRefund.eq(0)) await this.createRefund(tx, updated, roundedRefund, cancellation.currency, user.sub, now);
      await this.audit.write(tx, { actor: user, tenantId: cancellation.booking.vendorTenantId, action: 'CANCELLATION_FINANCIAL_RESOLVED', entityType: 'BookingCancellation', entityId: cancellation.id, reason: dto.reason });
      await this.outbox.enqueue(tx, { tenantId: cancellation.booking.vendorTenantId, eventType: 'CANCELLATION_FINANCIAL_RESOLVED', aggregateType: 'BookingCancellation', aggregateId: cancellation.id, payload: { bookingId: cancellation.bookingId, cancellationCharge: roundedCharge.toString(), refundEntitlement: roundedRefund.toString(), financialState: state } });
      return updated;
    }, { timeout: 30000, maxWait: 30000 });
    return saved;
  }

  private async refundTransition(user: AuthUser, id: string, action: 'CONFIRM' | 'FAIL' | 'RETRY', value: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM "public"."Refund" WHERE "id" = $1 FOR UPDATE`, id);
      if (!locked[0]) throw new NotFoundException('Refund not found');
      const refund = await tx.refund.findUniqueOrThrow({ where: { id }, include: { cancellation: true, booking: true } });
      if (action === 'CONFIRM' && refund.status === RefundStatus.CONFIRMED) { if (refund.externalReference === value) return refund; throw new ConflictException('REFUND_ALREADY_CONFIRMED_DIFFERENT_REFERENCE'); }
      if (action === 'FAIL' && refund.status === RefundStatus.FAILED) return refund;
      if (action === 'RETRY' && refund.status !== RefundStatus.FAILED) throw new ConflictException('REFUND_RETRY_REQUIRES_FAILED');
      if (action !== 'RETRY' && refund.status !== RefundStatus.PENDING) throw new ConflictException(`REFUND_${refund.status}`);
      const now = new Date();
      if (action === 'RETRY') {
        const updated = await tx.refund.update({ where: { id }, data: { status: RefundStatus.PENDING, failureReason: null, failedAt: null, version: { increment: 1 } } });
        await this.audit.write(tx, { actor: user, tenantId: refund.booking.vendorTenantId, action: 'REFUND_RETRIED', entityType: 'Refund', entityId: id, reason: note });
        await this.outbox.enqueue(tx, { tenantId: refund.booking.vendorTenantId, eventType: 'REFUND_RETRIED', aggregateType: 'Refund', aggregateId: id, payload: { bookingId: refund.bookingId, cancellationId: refund.cancellationId, amount: refund.amount.toString() } });
        return updated;
      }
      const confirmed = action === 'CONFIRM';
      const updated = await tx.refund.update({ where: { id }, data: confirmed ? { status: RefundStatus.CONFIRMED, externalReference: value, confirmedAt: now, confirmedById: user.sub, version: { increment: 1 } } : { status: RefundStatus.FAILED, failureReason: value, failedAt: now, version: { increment: 1 } } });
      await tx.bookingCancellation.update({ where: { id: refund.cancellationId }, data: { financialState: confirmed ? CancellationFinancialState.REFUNDED : CancellationFinancialState.REFUND_FAILED } });
      const eventType = confirmed ? FinancialEventType.REFUND_CONFIRMED : FinancialEventType.REFUND_FAILED;
      await this.addFinancialEvent(tx, { eventKey: `refund:${id}:${confirmed ? 'confirmed' : 'failed'}:${refund.version + 1}`, bookingId: refund.bookingId, cancellationId: refund.cancellationId, refundId: id, type: eventType, status: confirmed ? FinancialEventStatus.POSTED : FinancialEventStatus.FAILED, currency: refund.currency, amount: refund.amount, components: { refundId: id, status: confirmed ? 'CONFIRMED' : 'FAILED' }, reason: confirmed ? note : value, reference: confirmed ? value : undefined, actorUserId: user.sub, occurredAt: now });
      await tx.bookingEvent.create({ data: { bookingId: refund.bookingId, eventType: confirmed ? 'REFUND_CONFIRMED' : 'REFUND_FAILED', fromStatus: BookingStatus.CANCELLED, toStatus: BookingStatus.CANCELLED, actorUserId: user.sub, actorRole: user.role, reason: confirmed ? note : value, metadata: { refundId: id } } });
      await this.audit.write(tx, { actor: user, tenantId: refund.booking.vendorTenantId, action: confirmed ? 'REFUND_CONFIRMED' : 'REFUND_FAILED', entityType: 'Refund', entityId: id, reason: confirmed ? note : value });
      await this.outbox.enqueue(tx, { tenantId: refund.booking.vendorTenantId, eventType: confirmed ? 'REFUND_CONFIRMED' : 'REFUND_FAILED', aggregateType: 'Refund', aggregateId: id, payload: { bookingId: refund.bookingId, cancellationId: refund.cancellationId, amount: refund.amount.toString(), reference: confirmed ? value : null, reason: confirmed ? note ?? null : value } });
      return updated;
    }, { timeout: 30000, maxWait: 30000 });
  }

  private async createRefund(tx: ReservationTx, cancellation: any, amount: Prisma.Decimal, currency: string, userId: string, now: Date) { if (amount.lte(0)) throw new ConflictException('REFUND_AMOUNT_MUST_BE_POSITIVE'); const refund = await tx.refund.create({ data: { bookingId: cancellation.bookingId, cancellationId: cancellation.id, amount, currency, status: RefundStatus.PENDING, createdById: userId, requestedAt: now } }); await this.addFinancialEvent(tx, { eventKey: `refund:${refund.id}:created`, bookingId: cancellation.bookingId, cancellationId: cancellation.id, refundId: refund.id, type: FinancialEventType.REFUND_CREATED, status: FinancialEventStatus.PENDING, currency, amount, components: { refundId: refund.id, financialState: CancellationFinancialState.REFUND_PENDING }, occurredAt: now }); const booking = await tx.booking.findUniqueOrThrow({ where: { id: cancellation.bookingId }, select: { vendorTenantId: true } }); await this.outbox.enqueue(tx, { tenantId: booking.vendorTenantId, eventType: 'REFUND_CREATED', aggregateType: 'Refund', aggregateId: refund.id, payload: { bookingId: cancellation.bookingId, cancellationId: cancellation.id, amount: amount.toString() } }); return refund; }
  private async addFinancialEvent(tx: ReservationTx, data: any) { return tx.financialEvent.upsert({ where: { eventKey: data.eventKey }, update: {}, create: data }); }
  private async addBookingEvent(tx: ReservationTx, booking: any, eventType: string, fromStatus: BookingStatus, toStatus: BookingStatus, actor: AuthUser, reason: string) { return tx.bookingEvent.create({ data: { bookingId: booking.id, eventType, fromStatus, toStatus, actorUserId: actor.sub, actorRole: actor.role, reason } }); }
  private async lockBooking(tx: ReservationTx, id: string) { if ((tx as any).$executeRawUnsafe) await (tx as any).$executeRawUnsafe('SET LOCAL search_path TO public'); const rows = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "public"."Booking" WHERE "id" = $1 FOR UPDATE`, id); if (!rows[0]) throw new NotFoundException('Booking not found'); return tx.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude }); }
  private calculate(booking: any, now: Date): any {
    const snapshot = booking.operationalSnapshot; const economics = booking.economicsSnapshot; if (!snapshot || !economics) return { eligible: false, reasonCodes: ['BOOKING_SNAPSHOT_MISSING'] };
    const session = snapshot.sessionSnapshot as any; const timezone = snapshot.serviceTimezone ?? session.timezone ?? booking.serviceTimezone ?? 'UTC'; const serviceDateLocal = dateOnly(session.serviceDate ?? booking.serviceDate, timezone); const cancellationDateLocal = localDate(now, timezone); const daysBeforeService = dateDifference(serviceDateLocal, cancellationDateLocal); const startsAt = session.startsAt ? new Date(session.startsAt) : null;
    if (startsAt && now >= startsAt) return { eligible: false, reasonCodes: ['SERVICE_ALREADY_STARTED'], serviceTimezone: timezone, serviceDateLocal, cancellationDateLocal, daysBeforeService };
    const rules = Array.isArray(snapshot.cancellationPolicySnapshot) ? snapshot.cancellationPolicySnapshot : []; const matches = rules.filter((rule: any) => daysBeforeService >= Number(rule.minDaysBefore) && (rule.maxDaysBefore == null || daysBeforeService <= Number(rule.maxDaysBefore))); if (!matches.length) return { eligible: false, reasonCodes: ['CANCELLATION_POLICY_NO_MATCH'], serviceTimezone: timezone, serviceDateLocal, cancellationDateLocal, daysBeforeService }; if (matches.length > 1) return { eligible: false, reasonCodes: ['CANCELLATION_POLICY_AMBIGUOUS'], serviceTimezone: timezone, serviceDateLocal, cancellationDateLocal, daysBeforeService };
    const rule = matches[0]; const bookingAmount = this.money(economics.finalAmount); const rawCharge = rule.chargeType === 'PERCENTAGE' ? bookingAmount.mul(this.money(rule.chargeValue)).div(100) : this.money(rule.chargeValue); const cancellationCharge = this.round(rawCharge.gt(bookingAmount) ? bookingAmount : rawCharge); const refundEntitlement = this.round(bookingAmount.minus(cancellationCharge)); const financialState = refundEntitlement.eq(0) ? CancellationFinancialState.CANCELLED_NO_REFUND : CancellationFinancialState.REFUND_PENDING; const base = { eligible: true, reasonCodes: [], serviceTimezone: timezone, serviceDateLocal, cancellationDateLocal, daysBeforeService, policyFingerprint: snapshot.cancellationPolicyFingerprint, matchedPolicyRule: rule, bookingAmount, currency: economics.currency, cancellationCharge, refundEntitlement, financialState }; return { ...base, cancellationFingerprint: this.hash({ bookingId: booking.id, status: booking.status, version: booking.version, policyFingerprint: base.policyFingerprint, matchedPolicyRule: rule, daysBeforeService, bookingAmount: bookingAmount.toString(), cancellationCharge: cancellationCharge.toString(), refundEntitlement: refundEntitlement.toString(), serviceTimezone: timezone }) };
  }
  private operationalProvenance(booking: any, now: Date) { const snapshot = booking.operationalSnapshot as any; const session = snapshot?.sessionSnapshot as any; const serviceTimezone = snapshot?.serviceTimezone ?? session?.timezone ?? booking.serviceTimezone ?? 'UTC'; const serviceDateLocal = dateOnly(session?.serviceDate ?? booking.serviceDate, serviceTimezone); const cancellationDateLocal = localDate(now, serviceTimezone); return { serviceTimezone, serviceDateLocal, cancellationDateLocal, daysBeforeService: dateDifference(serviceDateLocal, cancellationDateLocal) }; }
  private pendingCalculation(booking: any, now: Date) { const provenance = this.operationalProvenance(booking, now); const base = { eligible: true, reasonCodes: [], ...provenance, policyFingerprint: null, matchedPolicyRule: null, bookingAmount: this.money(booking.amount), currency: booking.currency, cancellationCharge: this.money(0), refundEntitlement: this.money(0), financialState: CancellationFinancialState.CANCELLED_PENDING_FINANCIAL }; return { ...base, cancellationFingerprint: this.hash({ bookingId: booking.id, status: booking.status, version: booking.version, pendingWithdrawal: true, serviceTimezone: provenance.serviceTimezone }) }; }
  private previewProjection(booking: any, initiator: CancellationInitiator) { if (booking.recordType !== BookingRecordType.CANONICAL) return { eligible: false, bookingCode: booking.bookingCode, reasonCodes: ['LEGACY_CANCELLATION_COMPATIBILITY_ONLY'] }; if (booking.cancellation) return this.roleProjection(booking, booking.cancellation, initiator); if (![BookingStatus.CONFIRMED, BookingStatus.PENDING_VENDOR_CONFIRMATION, BookingStatus.PENDING_MANUAL_REVIEW].includes(booking.status as any)) return { eligible: false, bookingCode: booking.bookingCode, reasonCodes: ['BOOKING_NOT_CANCELLABLE'], status: booking.status }; if (initiator !== CancellationInitiator.AGENT) return { eligible: true, bookingCode: booking.bookingCode, status: booking.status, initiator, financialState: CancellationFinancialState.CANCELLED_PENDING_FINANCIAL }; const calculation = booking.status === BookingStatus.CONFIRMED ? this.calculate(booking, new Date()) : this.pendingCalculation(booking, new Date()); return { ...this.agentCalculationProjection(booking, calculation), status: booking.status, initiator };
  }
  private agentCalculationProjection(booking: any, calculation: any) { return { eligible: calculation.eligible, bookingCode: booking.bookingCode, serviceDate: booking.serviceDate, serviceTimezone: calculation.serviceTimezone, daysBeforeService: calculation.daysBeforeService, matchedPolicy: calculation.matchedPolicyRule ?? null, bookingAmount: calculation.bookingAmount?.toString() ?? null, cancellationCharge: calculation.cancellationCharge?.toString() ?? null, refundEntitlement: calculation.refundEntitlement?.toString() ?? null, currency: calculation.currency ?? booking.currency, financialState: calculation.financialState ?? null, cancellationFingerprint: calculation.cancellationFingerprint ?? null, reasonCodes: calculation.reasonCodes ?? [] }; }
  private agentProjection(booking: any, cancellation: any) { return { id: booking.id, bookingCode: booking.bookingCode, status: booking.status, serviceDate: booking.serviceDate, serviceTimezone: cancellation.serviceTimezone, financialState: cancellation.financialState, cancellation: { id: cancellation.id, initiator: cancellation.initiator, reasonCategory: cancellation.reasonCategory, reason: cancellation.reason, cancellationCharge: cancellation.cancellationCharge.toString(), refundEntitlement: cancellation.refundEntitlement.toString(), currency: cancellation.currency, cancelledAt: cancellation.cancelledAt, daysBeforeService: cancellation.daysBeforeService }, refund: cancellation.refund ? { id: cancellation.refund.id, amount: cancellation.refund.amount.toString(), currency: cancellation.refund.currency, status: cancellation.refund.status, externalReference: cancellation.refund.externalReference } : null }; }
  private roleProjection(booking: any, cancellation: any, _requestedInitiator: CancellationInitiator) { return { ...this.agentProjection(booking, cancellation), initiator: cancellation.initiator, financialReviewPending: cancellation.financialState === CancellationFinancialState.CANCELLED_PENDING_FINANCIAL }; }
  private requireAgent(user: AuthUser) { if (user.role !== UserRole.TRAVEL_AGENT || !user.tenantId) throw new ForbiddenException('Travel Agent access required'); return user.tenantId; }
  private requireVendor(user: AuthUser) { if (user.role !== UserRole.VENDOR || !user.tenantId) throw new ForbiddenException('Vendor access required'); return user.tenantId; }
  private requestFingerprint(bookingId: string, key: string, category: CancellationReasonCategory, reason: string) { return this.hash({ bookingId, key, category, reason: reason.trim() }); }
  private hash(value: unknown) { return fingerprint(value); }
  private money(value: unknown) { return new Prisma.Decimal(String(value ?? 0)); }
  private financialMoney(value: unknown, field: string) { if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new ConflictException(`${field} must be a non-negative decimal with at most 2 fractional digits`); return this.money(value); }
  private requirePendingHold(holds: any[]) { if (holds.length === 0) throw new ConflictException('CANCELLATION_HOLD_MISSING'); if (holds.length > 1) throw new ConflictException('CANCELLATION_HOLD_AMBIGUOUS'); return holds[0]; }
  private round(value: Prisma.Decimal) { return value.toDecimalPlaces(2); }
}

function localDate(value: Date, timezone: string) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value); const map = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${map.year}-${map.month}-${map.day}`; }
function dateOnly(value: unknown, timezone: string) { if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10); return localDate(new Date(value as any), timezone); }
function dateDifference(later: string, earlier: string) { const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((parse(later) - parse(earlier)) / 86400000); }
