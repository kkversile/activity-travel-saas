import type { VendorShellNavItem } from './VendorShell';

export const partnerHubNavigation: VendorShellNavItem[] = [
  { key: 'dashboard', label: 'Home', section: 'main' },
  { key: 'bookings', label: 'Bookings', section: 'main' },
  { key: 'products', label: 'Products', section: 'main' },
  { key: 'add-product', label: 'Add product', section: 'main' },
  { key: 'bulk-upload', label: 'Bulk upload', section: 'main' },
  { key: 'promotions', label: 'Promotions', section: 'main' },
  { key: 'payouts', label: 'Payments', section: 'main' },
  { key: 'reports', label: 'Reports', section: 'main' },
  { key: 'onboarding', label: 'Business profile & KYC', section: 'account' },
  { key: 'settings', label: 'Team & settings', section: 'account' },
  { key: 'developer-notes', label: 'Developer notes', section: 'internal' },
];

export function partnerHubCountsFromDashboard(summary: {
  vendorActionRequiredBookings?: number;
  pendingBookings?: number;
  draftListings?: number;
  expiredDocuments?: number;
  documentsExpiring?: number;
}) {
  return {
    bookings: summary.vendorActionRequiredBookings ?? summary.pendingBookings ?? 0,
    products: summary.draftListings ?? 0,
    kyc: (summary.expiredDocuments ?? 0) + (summary.documentsExpiring ?? 0),
  };
}
