import { BadRequestException } from '@nestjs/common';
import { BookingMode, BookingStatus, CancellationInitiator, MediaKind, ProductRevisionStatus, ProductStatus, SupplierMetricDirection, SupplierMetricStatus, SupplierQualityDimension, SupplierQualityMetricCode, SupplierTier } from '@prisma/client';
import { validateMetricClassification } from './quality-metric-registry';
import { SupplierPerformanceService } from './supplier-performance.service';
import { SupplierQualityEvaluator } from './supplier-quality-evaluator';
import { SupplierQualityPolicyService } from './supplier-quality.service';

describe('Supplier quality metric behaviour', () => {
  const serviceDates = { start: new Date('2026-09-11T00:00:00Z'), end: new Date('2026-10-11T00:00:00Z'), boundary: new Date('2026-10-10T03:30:00Z') };
  const rawServiceBooking = (id: string, cancellation?: any, voucherAt?: Date) => ({ id, status: BookingStatus.CONFIRMED, createdAt: new Date('2026-10-01T09:00:00Z'), confirmedAt: new Date('2026-10-10T03:00:00Z'), serviceDate: new Date('2026-10-10T00:00:00Z'), serviceTimezone: 'Asia/Kolkata', operationalSnapshot: { sessionSnapshot: { startsAt: serviceDates.boundary.toISOString(), timezone: 'Asia/Kolkata' } }, cancellation, fulfilment: voucherAt ? { vouchers: [{ generatedAt: voucherAt, status: 'CURRENT', voidedAt: null }] } : null });
  it('separates request-time SLA from service-date fulfilment and honours cancellation boundary', async () => {
    const sla = [
      { createdAt: new Date('2026-10-09T08:00:00Z'), confirmationDueAt: new Date('2026-10-09T10:00:00Z'), confirmedAt: new Date('2026-10-09T09:00:00Z'), rejectedAt: null, expiredAt: null, status: BookingStatus.CONFIRMED },
      { createdAt: new Date('2026-10-09T08:00:00Z'), confirmationDueAt: new Date('2026-10-09T11:00:00Z'), confirmedAt: null, rejectedAt: new Date('2026-10-09T08:30:00Z'), expiredAt: null, status: BookingStatus.VENDOR_REJECTED },
      { createdAt: new Date('2026-10-09T08:00:00Z'), confirmationDueAt: new Date('2026-10-09T12:00:00Z'), confirmedAt: null, rejectedAt: null, expiredAt: new Date('2026-10-09T12:00:00Z'), status: BookingStatus.CONFIRMATION_EXPIRED },
    ];
    const service = [rawServiceBooking('before', { initiator: CancellationInitiator.AGENT, cancelledAt: new Date('2026-10-10T03:29:00Z') }), rawServiceBooking('after', { initiator: CancellationInitiator.ADMIN, cancelledAt: new Date('2026-10-10T03:31:00Z') }), rawServiceBooking('ready', undefined, new Date('2026-10-10T03:29:00Z'))];
    const prisma: any = { tenant: { findUnique: jest.fn().mockResolvedValue({ kind: 'VENDOR' }) }, supplierQualityPolicy: { findFirst: jest.fn().mockResolvedValue(null) }, booking: { findMany: jest.fn().mockImplementation((args: any) => Promise.resolve(args.where.bookingMode === BookingMode.VENDOR_CONFIRMATION ? sla : service)) }, product: { findMany: jest.fn().mockResolvedValue([{ status: ProductStatus.LIVE, currentRevision: { status: ProductRevisionStatus.PUBLISHED, media: [{ id: 'image', kind: MediaKind.IMAGE }] } }, { status: ProductStatus.LIVE, currentRevision: { status: ProductRevisionStatus.PUBLISHED, media: [] } }]) }, serviceSession: { findMany: jest.fn().mockResolvedValue([{ id: 's1', scheduleTemplateId: 'schedule', slotTemplateId: null, serviceDate: new Date('2026-10-10') }]) }, scheduleException: { findMany: jest.fn().mockResolvedValue([]) }, supplierTierAssignment: { findFirst: jest.fn().mockResolvedValue(null) }, supplierQualitySnapshot: { findFirst: jest.fn().mockResolvedValue(null) }, supplierQualityIssue: { findMany: jest.fn().mockResolvedValue([]) } };
    const result = await new SupplierPerformanceService(prisma, new SupplierQualityEvaluator()).computeCurrent('vendor', new Date('2026-10-11T00:00:00Z'), serviceDates.start);
    const metric = (code: SupplierQualityMetricCode) => result.metrics.find((row) => row.metricCode === code)!;
    expect(metric(SupplierQualityMetricCode.CONFIRMATION_WITHIN_SLA_RATE)).toMatchObject({ numerator: 1, denominator: 3, rawValue: 33.33 });
    expect(metric(SupplierQualityMetricCode.VOUCHER_READY_BEFORE_SERVICE_RATE)).toMatchObject({ numerator: 1, denominator: 2, rawValue: 50 });
    expect(metric(SupplierQualityMetricCode.AVG_FULFILMENT_TURNAROUND_MINUTES)).toMatchObject({ sampleSize: 1, rawValue: 29 });
    expect(metric(SupplierQualityMetricCode.LIVE_PRODUCT_IMAGE_COVERAGE_RATE)).toMatchObject({ numerator: 1, denominator: 2, rawValue: 50 });
  });
  it('keeps traveller feedback unavailable and excludes it from scoring', () => {
    const evaluator = new SupplierQualityEvaluator();
    const unavailable: any = { metricCode: SupplierQualityMetricCode.NPS, dimension: SupplierQualityDimension.TRAVELLER_OUTCOME, rawValue: null, numerator: null, denominator: null, sampleSize: 0, unit: 'score', status: SupplierMetricStatus.UNAVAILABLE, score: null, sourceTrace: { unavailable: 'first-class traveller feedback source not configured' } };
    const rule: any = { metricCode: SupplierQualityMetricCode.NPS, dimension: SupplierQualityDimension.TRAVELLER_OUTCOME, direction: SupplierMetricDirection.HIGHER_BETTER, weight: 100, targetValue: 50, warningValue: 20, minimumSampleSize: 1, missingDataTreatment: 'FAIL', passScore: 100, warnScore: 50, failScore: 0 };
    expect(evaluator.assess(unavailable, rule)).toMatchObject({ status: SupplierMetricStatus.UNAVAILABLE, rawValue: null, sampleSize: 0, score: null }); expect(evaluator.score([unavailable], [rule])).toBeNull();
  });
  it('rejects non-canonical metric classification and invalid tier bands', () => {
    expect(() => validateMetricClassification({ metricCode: SupplierQualityMetricCode.VENDOR_CANCELLATION_RATE, dimension: SupplierQualityDimension.TRAVELLER_OUTCOME, direction: SupplierMetricDirection.LOWER_BETTER })).toThrow('QUALITY_METRIC_DIMENSION_MISMATCH');
    const service: any = new SupplierQualityPolicyService({} as any, {} as any, {} as any);
    expect(() => service.validatePolicy({ name: 'bad bands', metricRules: [], tierRules: [{ tier: SupplierTier.ELITE, minimumScore: 50 }, { tier: SupplierTier.PREFERRED, minimumScore: 60 }, { tier: SupplierTier.STANDARD, minimumScore: 40 }, { tier: SupplierTier.WATCHLIST, minimumScore: 20 }, { tier: SupplierTier.RESTRICTED, minimumScore: 0 }] })).toThrow(BadRequestException);
  });
});
