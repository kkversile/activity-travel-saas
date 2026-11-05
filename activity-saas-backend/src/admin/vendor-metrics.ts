type VendorMetricBooking = {
  status: string;
  bookingMode?: string | null;
  amount?: unknown;
  confirmedAt?: Date | string | null;
  cancellation?: { initiator?: string | null } | null;
};

const acceptedStatuses = new Set(['CONFIRMED', 'FULFILLED', 'REDEEMED', 'COMPLETED', 'NO_SHOW']);
const rejectedStatuses = new Set(['VENDOR_REJECTED', 'MANUAL_REJECTED', 'CONFIRMATION_EXPIRED']);
const onRequestModes = new Set(['VENDOR_CONFIRMATION', 'MANUAL_ON_REQUEST']);

export function summarizeVendorMetrics(bookings: VendorMetricBooking[]) {
  const acceptedOnRequest = bookings.filter((booking) =>
    onRequestModes.has(String(booking.bookingMode || '')) &&
    (Boolean(booking.confirmedAt) || acceptedStatuses.has(booking.status)),
  ).length;
  const resolvedOnRequest = bookings.filter((booking) =>
    onRequestModes.has(String(booking.bookingMode || '')) &&
    (Boolean(booking.confirmedAt) || acceptedStatuses.has(booking.status) || rejectedStatuses.has(booking.status)),
  ).length;
  const vendorCancellations = bookings.filter((booking) => booking.cancellation?.initiator === 'VENDOR').length;

  return {
    periodDays: 30,
    bookings: bookings.length,
    // Match the Admin dashboard's recorded-booking-value basis for parity.
    gmv: bookings.reduce((sum, booking) => {
      const amount = Number(booking.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0),
    acceptanceRate: resolvedOnRequest ? Math.round((acceptedOnRequest / resolvedOnRequest) * 100) : null,
    cancellationsByVendor: bookings.length ? Number(((vendorCancellations / bookings.length) * 100).toFixed(1)) : null,
    cancellationsByVendorCount: vendorCancellations,
    // The schema has no review records. ProductRevision.starRating is authored
    // listing content, not a customer rating, so do not present it as reviews.
    rating: null,
    ratingCount: 0,
    ratingAvailable: false,
  };
}

export function summarizeVendorCommercialTerms(
  versions: Array<{ supplierModel?: string | null; supplierCommissionPercent?: number | string | null }>,
  defaults: { supplierModel?: string | null; supplierCommissionPercent?: number | string | null } | null | undefined,
) {
  const models = [...new Set(versions.map((version) => version.supplierModel).filter((value): value is string => Boolean(value)))];
  const commissions = [...new Set(versions
    .map((version) => version.supplierCommissionPercent)
    .filter((value) => value != null)
    .map(Number)
    .filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
  const model = models.length === 1 ? models[0] : models.length > 1 ? 'MIXED' : defaults?.supplierModel ?? null;
  const commissionVaries = models.length > 1 || commissions.length > 1;
  const commissionPercent = versions.length
    ? !commissionVaries && commissions.length === 1 ? commissions[0] : null
    : defaults?.supplierCommissionPercent == null ? null : Number(defaults.supplierCommissionPercent);

  return {
    model,
    commissionPercent,
    commissionValues: commissions,
    commissionVaries,
    source: versions.length ? 'active rate-plan commercial versions' : 'vendor onboarding defaults',
  };
}
