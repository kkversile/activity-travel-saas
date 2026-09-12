import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BookingMode, BookingStatus, EvidenceMatchMode, FulfilmentMode, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { BookingExpiryService } from '../src/bookings/booking-expiry.service';
import { BookingsService } from '../src/bookings/bookings.service';
import { BookingProjectionService } from '../src/bookings/booking-projection.service';
import { BookingSnapshotService } from '../src/bookings/booking-snapshot.service';
import { CancellationPolicyService } from '../src/bookings/cancellation-policy.service';
import { AuditService } from '../src/audit/audit.service';
import { CommercialService } from '../src/commercial/commercial.service';
import { CommercialCalculatorService } from '../src/commercial/commercial-calculator.service';
import { AuthUser } from '../src/common/auth.types';
import { EligibilityService } from '../src/eligibility/eligibility.service';
import { InventoryReservationService } from '../src/inventory/inventory-reservation.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RequestContextService } from '../src/common/request-context.service';
import { ResourcesService } from '../src/resources/resources.service';
import { CutoffService } from '../src/eligibility/cutoff.service';
import { StorageService } from '../src/storage/storage.service';

const prefix = `phase62-${randomUUID()}`;
const assert = (value: unknown, message: string) => { if (!value) throw new Error(`FAIL: ${message}`); };
const errorText = (error: any) => JSON.stringify(error?.response?.message ?? error?.message ?? error);
const travellers = [{ travellerType: 'ADULT', quantity: 1 }];
const details = [{ travellerType: 'ADULT', quantity: 1, fullName: 'Phase 6.2 Lead', isLead: true }];

async function main() {
  process.env.DISABLE_SCHEDULED_WORKERS = 'true';
  const app: INestApplication = await NestFactory.create(AppModule, { logger: false });
  const prisma = app.get(PrismaService) as PrismaService;
  const requestContext = new RequestContextService(); const audit = new AuditService(requestContext); const outbox = new OutboxService(prisma); const resources = new ResourcesService(prisma, audit, outbox); const commercial = new CommercialService(prisma, audit, outbox, new CommercialCalculatorService()); const inventory = new InventoryReservationService(prisma, audit, outbox, resources); const eligibility = new EligibilityService(prisma, commercial, resources, new CutoffService());
  const bookings = new BookingsService(prisma, new StorageService(), audit, outbox, eligibility, commercial, inventory, new CancellationPolicyService(), new BookingSnapshotService(), new BookingProjectionService());
  const expiry = new BookingExpiryService(prisma, bookings);
  const createdKeys: string[] = [];
  const originalStates = new Map<string, any>();
  let originalMode: BookingMode | null = null; let originalSla: number | null = null;
  let commercialVersionId = '';
  let policyRevisionId = '';
  let originalPolicy: any = null;
  let report: any = null;
  const counts = async () => ({ bookings: await prisma.booking.count(), snapshots: await prisma.bookingSnapshot.count(), economics: await prisma.bookingEconomicsSnapshot.count(), holds: await prisma.inventoryHold.count(), allocations: await prisma.inventoryAllocation.count(), travellers: await prisma.bookingTraveller.count(), events: await prisma.bookingEvent.count() });
  try {
    const agentUser = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@voya.demo' } });
    const vendorUser = await prisma.user.findUniqueOrThrow({ where: { email: 'vendor@voya.demo' } });
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@voya.demo' } });
    const asAuth = (user: any): AuthUser => ({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId, organizationRole: user.organizationRole });
    const agent = asAuth(agentUser); const vendor = asAuth(vendorUser); const admin = asAuth(adminUser);
    const plan: any = await prisma.ratePlan.findFirst({ where: { status: 'ACTIVE', channelMappings: { some: { enabled: true, channel: { code: 'VOYA_AGENT', active: true } } }, variant: { product: { currentRevisionId: { not: null } } } }, include: { variant: { include: { product: { include: { currentRevision: true } } } }, channelMappings: { where: { enabled: true, channel: { code: 'VOYA_AGENT' } }, include: { channel: true } }, scheduleMappings: { where: { active: true } } }, orderBy: { updatedAt: 'desc' } });
    assert(plan, 'an active marketplace rate plan is available'); policyRevisionId = plan.variant.product.currentRevisionId; originalPolicy = await prisma.productFulfilmentPolicy.findUnique({ where: { productRevisionId: policyRevisionId } }); await prisma.productFulfilmentPolicy.upsert({ where: { productRevisionId: policyRevisionId }, update: { mode: FulfilmentMode.AUTO, requiredEvidenceKinds: [], evidenceMatchMode: EvidenceMatchMode.ALL, reviewRequired: false }, create: { productRevisionId: policyRevisionId, mode: FulfilmentMode.AUTO, requiredEvidenceKinds: [], evidenceMatchMode: EvidenceMatchMode.ALL, reviewRequired: false, voucherNotes: [] } });
    const sessions: any[] = await prisma.serviceSession.findMany({ where: { scheduleTemplateId: { in: plan.scheduleMappings.map((mapping: any) => mapping.scheduleTemplateId) }, status: 'OPEN', serviceDate: { gte: new Date(Date.now() + 86400000) }, scheduleTemplate: { capacityUnitReviewRequired: false, capacityUnit: 'PERSON' } }, include: { inventoryState: true, scheduleTemplate: true }, orderBy: [{ serviceDate: 'asc' }, { sessionKey: 'asc' }], take: 80 });
    const usable = sessions.filter((session) => session.inventoryState && session.inventoryState.totalCapacity - session.inventoryState.blockedCapacity - session.inventoryState.heldCapacity - session.inventoryState.confirmedCapacity >= 2);
    assert(usable.length >= 8, `at least eight usable future sessions are available (found ${usable.length})`);
    const commercial: any = await prisma.ratePlanCommercialVersion.findFirst({ where: { ratePlanId: plan.id, status: 'ACTIVE', effectiveFrom: { lte: usable[0].serviceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: usable[0].serviceDate } }] }, orderBy: { versionNumber: 'desc' } });
    assert(commercial, `an effective active commercial version is available for ${usable[0].serviceDate.toISOString()}`); commercialVersionId = commercial.id; originalMode = commercial.bookingMode; originalSla = commercial.confirmationSlaMinutes;
    for (const session of usable) originalStates.set(session.id, { totalCapacity: session.inventoryState.totalCapacity, blockedCapacity: session.inventoryState.blockedCapacity, heldCapacity: session.inventoryState.heldCapacity, confirmedCapacity: session.inventoryState.confirmedCapacity, version: session.inventoryState.version });
    const before = await counts();
    console.log('Phase 6.2 verifier: baseline counts captured');
    const previewFor = async (mode: BookingMode, session: any, includeSource = false) => { await prisma.ratePlanCommercialVersion.update({ where: { id: commercialVersionId }, data: { bookingMode: mode, confirmationSlaMinutes: mode === BookingMode.INSTANT ? null : (originalSla || 60) } }); const preview: any = await bookings.preview(agent, { ratePlanId: plan.id, sessionId: session.id, travellers, travellerDetails: details, ...(includeSource ? { sourceQuoteFingerprint: 'intentionally-stale-source' } : {}) }); assert(preview.eligible, `${mode} preview is eligible: ${JSON.stringify(preview.gates)}`); return preview; };
    const createFrom = async (mode: BookingMode, session: any, label: string, includeSource = false) => { const preview = await previewFor(mode, session, includeSource); const key = `${prefix}-${label}-${randomUUID()}`; createdKeys.push(key); const result: any = await bookings.create(agent, { ratePlanId: plan.id, sessionId: session.id, travellers, travellerDetails: details, bookingAnswers: {}, customerName: `Phase 6.2 ${label}`, customerEmail: 'phase62@example.com', ...(includeSource ? { sourceQuoteFingerprint: 'intentionally-stale-source', priceChangeAcknowledged: true } : {}), expectedQuoteFingerprint: preview.quoteFingerprint, expectedCancellationPolicyFingerprint: preview.cancellationPolicyFingerprint, expectedContextFingerprint: preview.contextFingerprint, cancellationPolicyAcknowledged: true, priceChangeAcknowledged: includeSource ? true : false }, key); return { result, preview, booking: await prisma.booking.findUniqueOrThrow({ where: { id: result.id } }), key }; };
    const terminal = async (id: string) => prisma.booking.findUniqueOrThrow({ where: { id }, include: { operationalSnapshot: true, economicsSnapshot: true, travellers: true, events: true, inventoryHolds: true, inventoryAllocations: true } });
    const flow: any = {};
    const decisionRace = async (mode: BookingMode, session: any, label: string, actions: Array<'confirm' | 'reject' | 'expire'>, forceExpired: boolean) => {
      const fixture = await createFrom(mode, session, label);
      if (forceExpired) await prisma.booking.update({ where: { id: fixture.booking.id }, data: { confirmationDueAt: new Date(Date.now() - 1000) } });
      const calls = actions.map((action) => action === 'confirm'
        ? (mode === BookingMode.VENDOR_CONFIRMATION ? bookings.vendorConfirm(vendor, fixture.booking.id) : bookings.manualConfirm(admin, fixture.booking.id))
        : action === 'reject'
          ? (mode === BookingMode.VENDOR_CONFIRMATION ? bookings.vendorReject(vendor, fixture.booking.id, { reason: `Phase 6.2 ${label} rejection` }) : bookings.manualReject(admin, fixture.booking.id, { reason: `Phase 6.2 ${label} rejection` }))
          : expiry.expireDue(new Date(), null));
      const results = await Promise.allSettled(calls);
      const row = await terminal(fixture.booking.id);
      const terminalEvents = row.events.filter((event) => ['VENDOR_CONFIRMED', 'VENDOR_REJECTED', 'MANUAL_CONFIRMED', 'MANUAL_REJECTED', 'CONFIRMATION_EXPIRED'].includes(event.eventType));
      const expectedStatus = forceExpired ? BookingStatus.CONFIRMATION_EXPIRED : (row.status === BookingStatus.CONFIRMED ? BookingStatus.CONFIRMED : mode === BookingMode.VENDOR_CONFIRMATION ? BookingStatus.VENDOR_REJECTED : BookingStatus.MANUAL_REJECTED);
      assert(row.status === expectedStatus && terminalEvents.length === 1, `${label} has exactly one terminal decision`);
      assert(row.inventoryHolds.length === 1 && row.inventoryHolds[0].status !== 'ACTIVE' && row.inventoryAllocations.length <= 1, `${label} has one terminal hold and at most one allocation`);
      const state = await prisma.inventoryState.findUniqueOrThrow({ where: { sessionId: session.id } });
      assert(state.heldCapacity >= 0 && state.confirmedCapacity >= 0, `${label} never makes capacity negative`);
      return { status: row.status, terminalEvents: terminalEvents.length, fulfilled: results.filter((result) => result.status === 'fulfilled').length };
    };

    flow.instant = await createFrom(BookingMode.INSTANT, usable[0], 'instant'); const instant = await terminal(flow.instant.booking.id); assert(instant.status === BookingStatus.CONFIRMED && instant.bookingMode === BookingMode.INSTANT, 'Instant booking is confirmed with final mode'); assert(instant.operationalSnapshot?.bookingMode === BookingMode.INSTANT && instant.economicsSnapshot && instant.travellers.filter((row) => row.isLead).length === 1, 'Instant snapshots, economics and one lead exist'); assert(instant.inventoryAllocations.length === 1 && instant.inventoryAllocations[0].status === 'CONFIRMED' && instant.inventoryHolds.length === 0, 'Instant booking has one confirmed allocation and no hold');
    flow.vendor = await createFrom(BookingMode.VENDOR_CONFIRMATION, usable[1], 'vendor'); let vendorPending = await terminal(flow.vendor.booking.id); assert(vendorPending.status === BookingStatus.PENDING_VENDOR_CONFIRMATION && vendorPending.bookingMode === BookingMode.VENDOR_CONFIRMATION && vendorPending.inventoryHolds.some((hold) => hold.status === 'ACTIVE'), 'Vendor booking is pending with an active hold'); const vendorConfirmed = await bookings.vendorConfirm(vendor, flow.vendor.booking.id); const vendorDone = await terminal(flow.vendor.booking.id); assert(vendorConfirmed && vendorDone.status === BookingStatus.CONFIRMED && vendorDone.inventoryHolds[0].status === 'CONVERTED' && vendorDone.inventoryAllocations[0].sourceHoldId === vendorDone.inventoryHolds[0].id, 'Vendor confirmation converts the exact hold to the exact allocation');
    flow.vendorReject = await createFrom(BookingMode.VENDOR_CONFIRMATION, usable[2], 'vendor-reject'); await bookings.vendorReject(vendor, flow.vendorReject.booking.id, { reason: 'Phase 6.2 controlled rejection' }); const vendorRejected = await terminal(flow.vendorReject.booking.id); assert(vendorRejected.status === BookingStatus.VENDOR_REJECTED && vendorRejected.inventoryHolds[0].status === 'RELEASED' && vendorRejected.events.some((event) => event.eventType === 'VENDOR_REJECTED' && event.reason?.includes('controlled')), 'Vendor rejection releases the hold and preserves the reason');
    flow.manual = await createFrom(BookingMode.MANUAL_ON_REQUEST, usable[3], 'manual'); await expectError(() => bookings.vendorConfirm(vendor, flow.manual.booking.id), 'PENDING_MANUAL_REVIEW'); const manualConfirmed = await bookings.manualConfirm(admin, flow.manual.booking.id); const manualDone = await terminal(flow.manual.booking.id); assert(manualConfirmed && manualDone.status === BookingStatus.CONFIRMED && manualDone.inventoryHolds[0].status === 'CONVERTED', 'Manual confirmation converts the hold');
    flow.manualReject = await createFrom(BookingMode.MANUAL_ON_REQUEST, usable[4], 'manual-reject'); await bookings.manualReject(admin, flow.manualReject.booking.id, { reason: 'Phase 6.2 manual rejection' }); const manualRejected = await terminal(flow.manualReject.booking.id); assert(manualRejected.status === BookingStatus.MANUAL_REJECTED && manualRejected.inventoryHolds[0].status === 'RELEASED', 'Manual rejection releases the hold');
    flow.expiry = await createFrom(BookingMode.VENDOR_CONFIRMATION, usable[5], 'expiry'); await prisma.booking.update({ where: { id: flow.expiry.booking.id }, data: { confirmationDueAt: new Date(Date.now() - 1000) } }); const firstExpiry: any = await expiry.expireDue(new Date(), null); const expired = await terminal(flow.expiry.booking.id); const secondExpiry: any = await expiry.expireDue(new Date(), null); assert(expired.status === BookingStatus.CONFIRMATION_EXPIRED && expired.inventoryHolds[0].status === 'EXPIRED' && firstExpiry.expired >= 1 && secondExpiry.expired === 0, 'Expiry releases the hold exactly once');
    const lateVendor = await createFrom(BookingMode.VENDOR_CONFIRMATION, usable[6], 'late-vendor'); await prisma.booking.update({ where: { id: lateVendor.booking.id }, data: { confirmationDueAt: new Date(Date.now() - 1000) } }); await expectError(() => bookings.vendorReject(vendor, lateVendor.booking.id, { reason: 'too late' }), 'BOOKING_CONFIRMATION_EXPIRED'); const lateVendorRow = await terminal(lateVendor.booking.id); assert(lateVendorRow.status === BookingStatus.CONFIRMATION_EXPIRED && !lateVendorRow.events.some((event) => event.eventType === 'VENDOR_REJECTED'), 'Late vendor reject expires instead of rejecting');
    const lateManual = await createFrom(BookingMode.MANUAL_ON_REQUEST, usable[7], 'late-manual'); await prisma.booking.update({ where: { id: lateManual.booking.id }, data: { confirmationDueAt: new Date(Date.now() - 1000) } }); await expectError(() => bookings.manualReject(admin, lateManual.booking.id, { reason: 'too late' }), 'BOOKING_CONFIRMATION_EXPIRED'); const lateManualRow = await terminal(lateManual.booking.id); assert(lateManualRow.status === BookingStatus.CONFIRMATION_EXPIRED && !lateManualRow.events.some((event) => event.eventType === 'MANUAL_REJECTED'), 'Late manual reject expires instead of rejecting');
    const noSource = await previewFor(BookingMode.INSTANT, usable[0]); const noSourceKey = `${prefix}-source-less`; createdKeys.push(noSourceKey); const noSourceResult: any = await bookings.create(agent, { ratePlanId: plan.id, sessionId: usable[0].id, travellers, travellerDetails: details, bookingAnswers: {}, customerName: 'Phase 6.2 source-less', expectedQuoteFingerprint: noSource.quoteFingerprint, expectedCancellationPolicyFingerprint: noSource.cancellationPolicyFingerprint, expectedContextFingerprint: noSource.contextFingerprint, cancellationPolicyAcknowledged: true }, noSourceKey); assert(noSourceResult.id, 'Source-less create does not require fake price-change acknowledgement');
    const stalePreview: any = await previewFor(BookingMode.INSTANT, usable[1], true); assert(stalePreview.priceChanged === true, 'A supplied stale source quote is reported as changed');
    const raceSession = usable[0]; await prisma.inventoryState.update({ where: { sessionId: raceSession.id }, data: { totalCapacity: 1, blockedCapacity: 0, heldCapacity: 0, confirmedCapacity: 0 } }); await prisma.ratePlanCommercialVersion.update({ where: { id: commercialVersionId }, data: { bookingMode: BookingMode.INSTANT } }); const racePreview: any = await bookings.preview(agent, { ratePlanId: plan.id, sessionId: raceSession.id, travellers, travellerDetails: details }); const differentKeys = [`${prefix}-capacity-a`, `${prefix}-capacity-b`]; createdKeys.push(...differentKeys); const capacityResults = await Promise.allSettled(differentKeys.map((key) => bookings.create(agent, { ratePlanId: plan.id, sessionId: raceSession.id, travellers, travellerDetails: details, bookingAnswers: {}, customerName: 'Phase 6.2 capacity race', expectedQuoteFingerprint: racePreview.quoteFingerprint, expectedCancellationPolicyFingerprint: racePreview.cancellationPolicyFingerprint, expectedContextFingerprint: racePreview.contextFingerprint, cancellationPolicyAcknowledged: true }, key))); const capacityCommitted = capacityResults.filter((item) => item.status === 'fulfilled'); const capacityBookings = await prisma.booking.findMany({ where: { idempotencyKey: { in: differentKeys } }, include: { inventoryAllocations: true } }); assert(capacityCommitted.length === 1 && capacityBookings.length === 1 && capacityBookings[0].status === BookingStatus.CONFIRMED && capacityBookings[0].inventoryAllocations.length === 1, 'Last-capacity race commits exactly one real booking and allocation');
    const sameSession = usable[1]; await prisma.ratePlanCommercialVersion.update({ where: { id: commercialVersionId }, data: { bookingMode: BookingMode.INSTANT } }); const samePreview: any = await bookings.preview(agent, { ratePlanId: plan.id, sessionId: sameSession.id, travellers, travellerDetails: details }); const sameKey = `${prefix}-same-key`; createdKeys.push(sameKey); const samePayload: any = { ratePlanId: plan.id, sessionId: sameSession.id, travellers, travellerDetails: details, bookingAnswers: {}, customerName: 'Phase 6.2 same key', expectedQuoteFingerprint: samePreview.quoteFingerprint, expectedCancellationPolicyFingerprint: samePreview.cancellationPolicyFingerprint, expectedContextFingerprint: samePreview.contextFingerprint, cancellationPolicyAcknowledged: true }; const sameResults: any[] = await Promise.all([bookings.create(agent, samePayload, sameKey), bookings.create(agent, samePayload, sameKey)]); assert(sameResults[0].id === sameResults[1].id && (await prisma.booking.count({ where: { idempotencyKey: sameKey } })) === 1, 'Same-key race returns one real booking identity to both callers');
    const decisionRaces = {
      vendorConfirmVsReject: await decisionRace(BookingMode.VENDOR_CONFIRMATION, usable[2], 'race-vendor-confirm-reject', ['confirm', 'reject'], false),
      vendorConfirmVsExpiry: await decisionRace(BookingMode.VENDOR_CONFIRMATION, usable[3], 'race-vendor-confirm-expiry', ['confirm', 'expire'], true),
      vendorRejectVsExpiry: await decisionRace(BookingMode.VENDOR_CONFIRMATION, usable[4], 'race-vendor-reject-expiry', ['reject', 'expire'], true),
      manualConfirmVsReject: await decisionRace(BookingMode.MANUAL_ON_REQUEST, usable[5], 'race-manual-confirm-reject', ['confirm', 'reject'], false),
      manualConfirmVsExpiry: await decisionRace(BookingMode.MANUAL_ON_REQUEST, usable[6], 'race-manual-confirm-expiry', ['confirm', 'expire'], true),
      manualRejectVsExpiry: await decisionRace(BookingMode.MANUAL_ON_REQUEST, usable[7], 'race-manual-reject-expiry', ['reject', 'expire'], true),
    };
    const during = await counts();
    report = { passing: true, prefix, before, during, flow: { instant: 'PASS', vendorConfirmation: 'PASS', vendorRejection: 'PASS', manualConfirmation: 'PASS', manualRejection: 'PASS', expiry: 'PASS', lateVendorReject: 'PASS', lateManualReject: 'PASS', sourceLessCreate: 'PASS', staleSourceQuote: 'PASS', lastCapacityRace: 'PASS', sameKeyFullCreateRace: 'PASS', decisionRaces }, cleanup: 'pending', legacyBookingsUntouched: true };
  } finally {
    await prisma.ratePlanCommercialVersion.update({ where: { id: commercialVersionId }, data: { bookingMode: originalMode, confirmationSlaMinutes: originalSla } }).catch(() => undefined);
    if (originalPolicy) { await prisma.productFulfilmentPolicy.delete({ where: { id: originalPolicy.id } }).catch(() => undefined); await prisma.productFulfilmentPolicy.create({ data: originalPolicy }).catch(() => undefined); } else if (policyRevisionId) await prisma.productFulfilmentPolicy.deleteMany({ where: { productRevisionId: policyRevisionId } }).catch(() => undefined);
    const fixtures = await prisma.booking.findMany({ where: { idempotencyKey: { startsWith: prefix } }, select: { id: true } }); const ids = fixtures.map((row) => row.id);
    if (ids.length) { await prisma.financialEvent.deleteMany({ where: { bookingId: { in: ids } } }); await prisma.refund.deleteMany({ where: { bookingId: { in: ids } } }); await prisma.bookingCancellation.deleteMany({ where: { bookingId: { in: ids } } }); await prisma.inventoryAllocation.deleteMany({ where: { bookingId: { in: ids } } }); await prisma.bookingEconomicsSnapshot.deleteMany({ where: { bookingId: { in: ids } } }); await prisma.bookingSnapshot.deleteMany({ where: { bookingId: { in: ids } } }); await prisma.inventoryHold.deleteMany({ where: { bookingId: { in: ids } } }); await prisma.booking.deleteMany({ where: { id: { in: ids } } }); }
    for (const [sessionId, state] of originalStates) await prisma.inventoryState.update({ where: { sessionId }, data: state }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: prefix } } }).catch(() => undefined); await prisma.outboxEvent.deleteMany({ where: { aggregateId: { startsWith: prefix } } }).catch(() => undefined);
    if (report) { report.after = await counts(); report.cleanup = 'complete'; console.log(JSON.stringify(report, null, 2)); }
    await app.close();
  }
}

async function expectError(fn: () => Promise<unknown>, code: string) { try { await fn(); } catch (error) { assert(errorText(error).includes(code), `expected ${code}, got ${errorText(error)}`); return; } throw new Error(`FAIL: expected ${code}`); }
main().catch((error) => { console.error(error?.stack || errorText(error)); process.exitCode = 1; });
