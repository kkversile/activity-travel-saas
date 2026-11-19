import { AuthUser } from './auth.types';
import { hasPermission, Permission } from './permissions';

export const VENDOR_REPORT_TYPES = ['BOOKINGS', 'GUEST_MANIFEST', 'PAYOUTS', 'COMMISSION_INVOICES', 'TDS_TCS_CERTIFICATES', 'PRODUCTS', 'PRODUCT_PERFORMANCE', 'REVIEWS', 'CANCELLATIONS'] as const;
const permissions: Record<typeof VENDOR_REPORT_TYPES[number], Permission> = {
  BOOKINGS: 'booking.view.vendor', GUEST_MANIFEST: 'manifest.view',
  PAYOUTS: 'payout.view', COMMISSION_INVOICES: 'payout.view', TDS_TCS_CERTIFICATES: 'payout.view',
  PRODUCTS: 'product.view', PRODUCT_PERFORMANCE: 'product.edit', REVIEWS: 'product.view',
  CANCELLATIONS: 'booking.view.vendor',
};
export function vendorReportTypesFor(user: AuthUser): string[] {
  if (user.role !== 'VENDOR') return [];
  return VENDOR_REPORT_TYPES.filter((type) => hasPermission(user, permissions[type]));
}
export function canManageVendorReportSchedules(user: AuthUser) {
  return user.role === 'VENDOR' && hasPermission(user, 'vendor.team.manage');
}
