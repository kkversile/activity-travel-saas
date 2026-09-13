import { SupplierMetricDirection, SupplierQualityDimension, SupplierQualityMetricCode } from '@prisma/client';

export const QUALITY_METRICS: Record<SupplierQualityMetricCode, { dimension: SupplierQualityDimension; unit: string; direction: SupplierMetricDirection; source: string }> = {
  CONFIRMATION_WITHIN_SLA_RATE: { dimension: SupplierQualityDimension.CONFIRMATION_SLA, unit: 'percent', direction: SupplierMetricDirection.HIGHER_BETTER, source: 'canonical vendor-confirmation Booking' },
  VENDOR_RESPONSE_WITHIN_SLA_RATE: { dimension: SupplierQualityDimension.CONFIRMATION_SLA, unit: 'percent', direction: SupplierMetricDirection.HIGHER_BETTER, source: 'vendor confirmedAt/rejectedAt' },
  AVG_VENDOR_RESPONSE_MINUTES: { dimension: SupplierQualityDimension.CONFIRMATION_SLA, unit: 'minutes', direction: SupplierMetricDirection.LOWER_BETTER, source: 'vendor response minus Booking.createdAt' },
  CONFIRMATION_OVERDUE_RATE: { dimension: SupplierQualityDimension.CONFIRMATION_SLA, unit: 'percent', direction: SupplierMetricDirection.LOWER_BETTER, source: 'expired vendor-confirmation Booking' },
  VENDOR_CANCELLATION_RATE: { dimension: SupplierQualityDimension.CANCELLATION_RELIABILITY, unit: 'percent', direction: SupplierMetricDirection.LOWER_BETTER, source: 'confirmed service-date BookingCancellation' },
  SHORT_NOTICE_VENDOR_CANCELLATION_RATE: { dimension: SupplierQualityDimension.CANCELLATION_RELIABILITY, unit: 'percent', direction: SupplierMetricDirection.LOWER_BETTER, source: 'vendor cancellation daysBeforeService' },
  VOUCHER_READY_BEFORE_SERVICE_RATE: { dimension: SupplierQualityDimension.FULFILMENT_QUALITY, unit: 'percent', direction: SupplierMetricDirection.HIGHER_BETTER, source: 'earliest valid VoucherVersion' },
  AVG_FULFILMENT_TURNAROUND_MINUTES: { dimension: SupplierQualityDimension.FULFILMENT_QUALITY, unit: 'minutes', direction: SupplierMetricDirection.LOWER_BETTER, source: 'first voucher-ready instant minus Booking.confirmedAt' },
  LAST_MINUTE_STOP_SELL_RATE: { dimension: SupplierQualityDimension.INVENTORY_RELIABILITY, unit: 'percent', direction: SupplierMetricDirection.LOWER_BETTER, source: 'affected vendor ServiceSession' },
  LIVE_PRODUCT_IMAGE_COVERAGE_RATE: { dimension: SupplierQualityDimension.CATALOGUE_QUALITY, unit: 'percent', direction: SupplierMetricDirection.HIGHER_BETTER, source: 'LIVE Product published revision image media' },
  CUSTOMER_RATING: { dimension: SupplierQualityDimension.TRAVELLER_OUTCOME, unit: 'rating', direction: SupplierMetricDirection.HIGHER_BETTER, source: 'traveller feedback (not configured)' },
  NPS: { dimension: SupplierQualityDimension.TRAVELLER_OUTCOME, unit: 'score', direction: SupplierMetricDirection.HIGHER_BETTER, source: 'traveller feedback (not configured)' },
  COMPLAINT_RATE: { dimension: SupplierQualityDimension.TRAVELLER_OUTCOME, unit: 'percent', direction: SupplierMetricDirection.LOWER_BETTER, source: 'traveller feedback (not configured)' },
};

export function validateMetricClassification(rule: { metricCode: SupplierQualityMetricCode; dimension: SupplierQualityDimension; direction: SupplierMetricDirection }) {
  const expected = QUALITY_METRICS[rule.metricCode];
  if (!expected || expected.dimension !== rule.dimension) throw new Error(`QUALITY_METRIC_DIMENSION_MISMATCH:${rule.metricCode}`);
  if (expected.direction !== rule.direction) throw new Error(`QUALITY_METRIC_DIRECTION_MISMATCH:${rule.metricCode}`);
}
