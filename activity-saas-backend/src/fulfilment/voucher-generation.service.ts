import { ConflictException, Injectable } from '@nestjs/common';
import { BookingFulfilmentStatus, BookingStatus, FilePurpose, FileVisibility, FulfilmentEvidenceStatus, Prisma, VoucherGenerationStatus, VoucherVersionStatus } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createHash, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { evidenceFingerprint } from './fulfilment.types';
import { FulfilmentReadinessService } from './fulfilment-readiness.service';

const LEASE_MS = Math.max(30_000, Number(process.env.VOUCHER_GENERATION_LEASE_MS || 120_000));

@Injectable()
export class VoucherGenerationService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly readiness: FulfilmentReadinessService) {}

  async processNext(options: { forceFailure?: boolean } = {}) {
    const job: any = await this.claim();
    if (!job) return { processed: false, reason: 'NO_PENDING_GENERATION' };
    let stored: { storageKey: string; sizeBytes: number } | null = null;
    try {
      if (options.forceFailure) throw new Error('forced voucher generation failure');
      const payload = this.payload(job);
      stored = await this.storage.save(await this.pdf(payload), FilePurpose.BOOKING_VOUCHER, '.pdf');
      const result = await this.finalize(job.id, job.generationToken, job.claimVersion, payload, stored);
      if (result.stale) await this.storage.remove(stored.storageKey);
      return { processed: true, ...result, storageKey: stored.storageKey, generatedPayload: payload };
    } catch {
      if (stored) await this.storage.remove(stored.storageKey);
      await this.markFailed(job.id, job.generationToken, job.claimVersion, 'Voucher generation failed; retry is available');
      return { processed: true, status: VoucherGenerationStatus.FAILED, reason: 'VOUCHER_GENERATION_FAILED' };
    }
  }

  async retry(fulfilmentId: string, actor: any = null) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."BookingFulfilment" WHERE "id" = ${fulfilmentId} FOR UPDATE`);
      const fulfilment: any = await tx.bookingFulfilment.findUnique({ where: { id: fulfilmentId }, include: { booking: true } });
      if (!fulfilment) throw new ConflictException('Fulfilment not found');
      if (fulfilment.status === BookingFulfilmentStatus.VOIDED || [BookingStatus.CANCELLED, BookingStatus.VENDOR_REJECTED, BookingStatus.MANUAL_REJECTED, BookingStatus.CONFIRMATION_EXPIRED].includes(fulfilment.booking.status)) throw new ConflictException('BOOKING_CANCELLED');
      if (fulfilment.generationStatus === VoucherGenerationStatus.PENDING) return fulfilment;
      if (![VoucherGenerationStatus.FAILED, VoucherGenerationStatus.SUCCEEDED].includes(fulfilment.generationStatus)) throw new ConflictException('VOUCHER_RETRY_NOT_AVAILABLE');
      const updated = await tx.bookingFulfilment.update({ where: { id: fulfilmentId }, data: { status: BookingFulfilmentStatus.READY_FOR_VOUCHER, generationStatus: VoucherGenerationStatus.PENDING, generationRequestedAt: new Date(), generationToken: null, generationClaimedAt: null, generationLeaseExpiresAt: null, lastGenerationError: null, version: { increment: 1 } } });
      await this.audit.write(tx, { actor: actor ?? { sub: 'system', email: 'system', role: 'ADMIN' }, tenantId: fulfilment.booking.vendorTenantId, action: 'VOUCHER_GENERATION_RETRY_REQUESTED', entityType: 'BookingFulfilment', entityId: fulfilmentId, metadata: { bookingId: fulfilment.bookingId, fulfilmentId } });
      await this.outbox.enqueue(tx, { tenantId: fulfilment.booking.vendorTenantId, eventType: 'VOUCHER_GENERATION_REQUESTED', aggregateType: 'BookingFulfilment', aggregateId: fulfilmentId, payload: { bookingId: fulfilment.bookingId, reason: 'explicit retry' } });
      return updated;
    }, { timeout: 30000, maxWait: 30000 });
  }

  buildPayload(booking: any, fulfilment: any) { return this.payload({ booking, ...fulfilment, evidence: fulfilment.evidence ?? [], generationToken: 'preview', claimVersion: fulfilment.version, targetVersionNumber: 1, targetVoucherCode: `VCH-${booking.bookingCode}-V1`, claimGeneratedAt: new Date() }); }

  private async claim() {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const rows: any[] = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."BookingFulfilment" WHERE "status" = 'READY_FOR_VOUCHER' AND ("generationStatus" = 'PENDING' OR ("generationStatus" = 'PROCESSING' AND ("generationLeaseExpiresAt" IS NULL OR "generationLeaseExpiresAt" <= ${now}))) ORDER BY "generationRequestedAt" ASC NULLS LAST FOR UPDATE SKIP LOCKED LIMIT 1`);
      if (!rows[0]) return null;
      const current: any = await tx.bookingFulfilment.findUnique({ where: { id: rows[0].id }, include: { booking: { include: { operationalSnapshot: true, travellers: { orderBy: { sequence: 'asc' } } } }, evidence: { where: { status: FulfilmentEvidenceStatus.CURRENT }, orderBy: { kind: 'asc' } } } });
      if (!current) return null;
      const targetVersionNumber = ((await tx.voucherVersion.aggregate({ where: { bookingId: current.bookingId }, _max: { versionNumber: true } }))._max.versionNumber ?? 0) + 1;
      const generationToken = randomUUID(); const claimGeneratedAt = new Date();
      const updated: any = await tx.bookingFulfilment.update({ where: { id: current.id }, data: { generationStatus: VoucherGenerationStatus.PROCESSING, generationToken, generationClaimedAt: claimGeneratedAt, generationLeaseExpiresAt: new Date(claimGeneratedAt.getTime() + LEASE_MS), generationAttempts: { increment: 1 }, version: { increment: 1 } }, include: { booking: { include: { operationalSnapshot: true, travellers: { orderBy: { sequence: 'asc' } } } }, evidence: { where: { status: FulfilmentEvidenceStatus.CURRENT }, orderBy: { kind: 'asc' } } } });
      return { ...updated, generationToken, claimVersion: updated.version, targetVersionNumber, targetVoucherCode: `VCH-${current.booking.bookingCode}-V${targetVersionNumber}`, claimGeneratedAt };
    }, { timeout: 30000, maxWait: 30000 });
  }

  private payload(job: any) {
    const snapshot: any = job.booking.operationalSnapshot; const policy: any = snapshot?.fulfilmentPolicySnapshot;
    const evidence = (job.evidence ?? []).filter((item: any) => item.status === FulfilmentEvidenceStatus.CURRENT && item.travellerVisible);
    const base = { voucherCode: job.targetVoucherCode, voucherVersion: job.targetVersionNumber, bookingCode: job.booking.bookingCode, productName: snapshot?.productSnapshot?.productName ?? 'Activity', variantName: snapshot?.variantSnapshot?.name ?? 'Selected option', serviceDate: job.booking.serviceDate, localStartTime: snapshot?.sessionSnapshot?.localStartTime ?? null, timezone: snapshot?.sessionSnapshot?.timezone ?? job.booking.serviceTimezone ?? 'UTC', meetingPoint: snapshot?.pickupSnapshot ?? null, pax: job.booking.pax, travellerSummary: snapshot?.travellerSummary ?? job.booking.paxBreakdown, leadTravellerName: job.booking.travellers?.find((item: any) => item.isLead)?.fullName ?? null, evidence: evidence.map((item: any) => ({ kind: item.kind, referenceValue: item.referenceValue?.trim() || null, fileAssetId: item.fileAssetId ?? null, versionNumber: item.versionNumber })), howToRedeem: policy?.howToRedeem ?? [], emergencyContact: policy?.emergencyContact ?? null, operationsContact: policy?.operationsContact ?? null, voucherNotes: policy?.voucherNotes ?? [], agentOrganization: snapshot?.agentSnapshot?.tenantName ?? null, sourceEvidenceFingerprint: evidenceFingerprint(job.evidence ?? []), generatedAt: (job.claimGeneratedAt ?? new Date()).toISOString() };
    return { ...base, contentFingerprint: this.contentFingerprint(base) };
  }

  private async pdf(payload: any) {
    const document = await PDFDocument.create(); const page = document.addPage([595, 842]); const font = await document.embedFont(StandardFonts.Helvetica); const bold = await document.embedFont(StandardFonts.HelveticaBold); let y = 790;
    const line = (value: string, size = 10, strong = false) => { page.drawText(value.slice(0, 100), { x: 48, y, size, font: strong ? bold : font, color: rgb(0.08, 0.14, 0.2) }); y -= size + 9; };
    line('VOYA TRAVELLER VOUCHER', 20, true); line(`Voucher ${payload.voucherCode}`, 11, true); line(`Booking ${payload.bookingCode}`); y -= 8; line(payload.productName, 15, true); line(payload.variantName); line(`Service date: ${String(payload.serviceDate).slice(0, 10)} ${payload.localStartTime ?? ''} ${payload.timezone}`); line(`Travellers: ${payload.pax} (${JSON.stringify(payload.travellerSummary)})`); if (payload.leadTravellerName) line(`Lead traveller: ${payload.leadTravellerName}`); y -= 8; line('Traveller-safe ticket / evidence', 12, true); for (const item of payload.evidence) if (item.referenceValue) line(`${item.kind}: ${item.referenceValue}`); y -= 8; if (payload.howToRedeem.length) { line('How to redeem', 12, true); for (const item of payload.howToRedeem) line(`• ${item}`); } if (payload.emergencyContact?.name || payload.operationsContact?.name) { line('Operational contacts', 12, true); line(`${payload.operationsContact?.name ?? ''} ${payload.operationsContact?.phone ?? ''}`); line(`${payload.emergencyContact?.name ?? ''} ${payload.emergencyContact?.phone ?? ''}`); } line(`Version ${payload.voucherVersion} · Generated ${payload.generatedAt}`); return Buffer.from(await document.save());
  }

  private async finalize(fulfilmentId: string, claimToken: string, claimVersion: number, payload: any, stored: { storageKey: string; sizeBytes: number }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "public"."BookingFulfilment" WHERE "id" = ${fulfilmentId} FOR UPDATE`);
      const fulfilment: any = await tx.bookingFulfilment.findUnique({ where: { id: fulfilmentId }, include: { booking: { include: { operationalSnapshot: true, travellers: { orderBy: { sequence: 'asc' } } } }, evidence: { where: { status: FulfilmentEvidenceStatus.CURRENT }, orderBy: { kind: 'asc' } } } });
      if (!fulfilment || fulfilment.status === BookingFulfilmentStatus.VOIDED || fulfilment.booking.status !== BookingStatus.CONFIRMED || fulfilment.generationStatus !== VoucherGenerationStatus.PROCESSING || fulfilment.generationToken !== claimToken || fulfilment.version !== claimVersion) return { stale: true, status: 'STALE_GENERATION' };
      const currentFingerprint = evidenceFingerprint(fulfilment.evidence); const ready = this.readiness.evaluate({ booking: fulfilment.booking, fulfilment, evidence: fulfilment.evidence });
      if (!ready.ready || currentFingerprint !== payload.sourceEvidenceFingerprint) return { stale: true, status: 'STALE_GENERATION' };
      const voucherId = randomUUID(); const generatedAt = new Date(payload.generatedAt);
      await tx.voucherVersion.updateMany({ where: { fulfilmentId, status: VoucherVersionStatus.CURRENT }, data: { status: VoucherVersionStatus.SUPERSEDED, supersededAt: generatedAt } });
      const asset = await tx.fileAsset.create({ data: { tenantId: fulfilment.booking.vendorTenantId, storageKey: stored!.storageKey, originalName: `${fulfilment.booking.bookingCode}-voucher-v${payload.voucherVersion}.pdf`, mimeType: 'application/pdf', sizeBytes: stored!.sizeBytes, visibility: FileVisibility.PRIVATE, purpose: FilePurpose.BOOKING_VOUCHER, entityType: 'VoucherVersion', entityId: voucherId } });
      const voucher = await tx.voucherVersion.create({ data: { id: voucherId, bookingId: fulfilment.bookingId, fulfilmentId, versionNumber: payload.voucherVersion, voucherCode: payload.voucherCode, fileAssetId: asset.id, sourceEvidenceFingerprint: currentFingerprint, contentFingerprint: payload.contentFingerprint, generatedAt, generatedByUserId: null } });
      const updated = await tx.bookingFulfilment.update({ where: { id: fulfilmentId }, data: { status: BookingFulfilmentStatus.VOUCHER_READY, generationStatus: VoucherGenerationStatus.SUCCEEDED, generatedAt, generationToken: null, generationClaimedAt: null, generationLeaseExpiresAt: null, lastGenerationError: null, version: { increment: 1 } } });
      await tx.bookingEvent.create({ data: { bookingId: fulfilment.bookingId, eventType: 'VOUCHER_GENERATED', metadata: { voucherVersionId: voucher.id, versionNumber: payload.voucherVersion } } });
      await this.audit.write(tx, { tenantId: fulfilment.booking.vendorTenantId, action: 'VOUCHER_GENERATED', entityType: 'VoucherVersion', entityId: voucher.id, metadata: { versionNumber: payload.voucherVersion } });
      await this.outbox.enqueue(tx, { tenantId: fulfilment.booking.vendorTenantId, eventType: 'VOUCHER_READY', aggregateType: 'VoucherVersion', aggregateId: voucher.id, payload: { bookingId: fulfilment.bookingId, versionNumber: payload.voucherVersion } });
      return { stale: false, status: updated.status, voucherId: voucher.id };
    }, { timeout: 30000, maxWait: 30000 });
  }

  private async markFailed(fulfilmentId: string, claimToken: string, claimVersion: number, message: string) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.bookingFulfilment.updateMany({ where: { id: fulfilmentId, generationStatus: VoucherGenerationStatus.PROCESSING, generationToken: claimToken, version: claimVersion }, data: { status: BookingFulfilmentStatus.READY_FOR_VOUCHER, generationStatus: VoucherGenerationStatus.FAILED, generationToken: null, generationClaimedAt: null, generationLeaseExpiresAt: null, lastGenerationError: message } });
      if (!rows.count) return;
      const row: any = await tx.bookingFulfilment.findUnique({ where: { id: fulfilmentId }, include: { booking: true } }); if (!row) return;
      await this.audit.write(tx, { tenantId: row.booking.vendorTenantId, action: 'VOUCHER_GENERATION_FAILED', entityType: 'BookingFulfilment', entityId: fulfilmentId, metadata: { message } });
      await this.outbox.enqueue(tx, { tenantId: row.booking.vendorTenantId, eventType: 'VOUCHER_GENERATION_FAILED', aggregateType: 'BookingFulfilment', aggregateId: fulfilmentId, payload: { bookingId: row.bookingId } });
    });
  }

  private contentFingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
}
