import { ConflictException, Injectable } from '@nestjs/common';
import { BookingFulfilmentStatus, BookingStatus, FulfilmentMode, Prisma, VoucherGenerationStatus, VoucherVersionStatus } from '@prisma/client';
import { AuthUser } from '../common/auth.types';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class FulfilmentLifecycleService {
  constructor(private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  async initializeInTransaction(tx: Prisma.TransactionClient, booking: any, policySnapshot: any, actor: AuthUser) {
    const mode = policySnapshot?.mode as FulfilmentMode | undefined;
    if (!mode) throw new ConflictException('FULFILMENT_POLICY_SNAPSHOT_MISSING');
    const confirmed = booking.status === BookingStatus.CONFIRMED;
    const ready = confirmed && mode === FulfilmentMode.AUTO;
    const fulfilment = await tx.bookingFulfilment.create({ data: { bookingId: booking.id, mode, status: confirmed ? (ready ? BookingFulfilmentStatus.READY_FOR_VOUCHER : BookingFulfilmentStatus.WAITING_EVIDENCE) : BookingFulfilmentStatus.AWAITING_CONFIRMATION, generationStatus: ready ? VoucherGenerationStatus.PENDING : VoucherGenerationStatus.NOT_REQUESTED, generationRequestedAt: ready ? new Date() : null } });
    if (ready) await this.requestGeneration(tx, fulfilment, booking, actor);
    return fulfilment;
  }

  async confirmInTransaction(tx: Prisma.TransactionClient, booking: any, actor: AuthUser) {
    const fulfilment: any = await tx.bookingFulfilment.findUnique({ where: { bookingId: booking.id } });
    if (!fulfilment || fulfilment.status === BookingFulfilmentStatus.VOIDED) return fulfilment;
    const ready = fulfilment.mode === FulfilmentMode.AUTO;
    const updated = await tx.bookingFulfilment.update({ where: { id: fulfilment.id }, data: { status: ready ? BookingFulfilmentStatus.READY_FOR_VOUCHER : BookingFulfilmentStatus.WAITING_EVIDENCE, generationStatus: ready ? VoucherGenerationStatus.PENDING : VoucherGenerationStatus.NOT_REQUESTED, generationRequestedAt: ready ? new Date() : null, version: { increment: 1 } } });
    if (ready) await this.requestGeneration(tx, updated, booking, actor);
    return updated;
  }

  async voidForCancellationInTransaction(tx: Prisma.TransactionClient, bookingId: string, actor: AuthUser, reason: string) {
    return this.voidForTerminalOutcomeInTransaction(tx, bookingId, actor, reason, 'CANCELLED');
  }

  async voidForTerminalOutcomeInTransaction(tx: Prisma.TransactionClient, bookingId: string, actor: AuthUser | null, reason: string, outcome: string) {
    const fulfilment: any = await tx.bookingFulfilment.findUnique({ where: { bookingId }, include: { booking: { select: { id: true, vendorTenantId: true, bookingCode: true } }, vouchers: { where: { status: VoucherVersionStatus.CURRENT } } } });
    if (!fulfilment) return null;
    const vendorTenantId = fulfilment.booking?.vendorTenantId;
    if (!vendorTenantId) throw new ConflictException('FULFILMENT_VENDOR_TENANT_MISSING');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."BookingFulfilment" WHERE "id" = ${fulfilment.id} FOR UPDATE`);
    const now = new Date();
    await tx.voucherVersion.updateMany({ where: { fulfilmentId: fulfilment.id, status: VoucherVersionStatus.CURRENT }, data: { status: VoucherVersionStatus.VOID, voidedAt: now, voidReason: reason } });
    const updated = await tx.bookingFulfilment.update({ where: { id: fulfilment.id }, data: { status: BookingFulfilmentStatus.VOIDED, generationStatus: VoucherGenerationStatus.NOT_REQUESTED, generationToken: null, generationClaimedAt: null, generationLeaseExpiresAt: null, lastGenerationError: `${outcome}; fulfilment voided`, version: { increment: 1 } } });
    await this.audit.write(tx, { actor, tenantId: vendorTenantId, action: 'VOUCHER_VOIDED', entityType: 'BookingFulfilment', entityId: fulfilment.id, reason, metadata: { outcome } });
    await this.outbox.enqueue(tx, { tenantId: vendorTenantId, eventType: 'VOUCHER_VOIDED', aggregateType: 'BookingFulfilment', aggregateId: fulfilment.id, payload: { bookingId, reason, outcome } });
    return updated;
  }

  private async requestGeneration(tx: Prisma.TransactionClient, fulfilment: any, booking: any, actor: AuthUser) {
    await this.outbox.enqueue(tx, { tenantId: booking.vendorTenantId, eventType: 'VOUCHER_GENERATION_REQUESTED', aggregateType: 'BookingFulfilment', aggregateId: fulfilment.id, payload: { bookingId: booking.id, bookingCode: booking.bookingCode } });
    await this.audit.write(tx, { actor, tenantId: booking.vendorTenantId, action: 'VOUCHER_GENERATION_REQUESTED', entityType: 'BookingFulfilment', entityId: fulfilment.id, metadata: { bookingId: booking.id } });
  }
}
