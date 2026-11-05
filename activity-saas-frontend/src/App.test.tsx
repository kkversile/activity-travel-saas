import { describe, expect, it } from 'vitest';
import { adminPageForRole, agentCanBook, agentPageFromPath } from './App';
import { partnerHubCountsFromDashboard } from './layouts/vendorNavigation';

describe('admin route authorization', () => {
  it('keeps Admin Users available only to Super Admin', () => {
    expect(adminPageForRole('/admin/users', 'SUPER_ADMIN')).toBe('users');
    expect(adminPageForRole('/admin/users', 'ADMIN')).toBe('dashboard');
  });

  it('keeps platform Configuration available only to Super Admin', () => {
    expect(adminPageForRole('/admin/settings', 'SUPER_ADMIN')).toBe('settings');
    expect(adminPageForRole('/admin/settings', 'ADMIN')).toBe('dashboard');
  });

  it('maps Agent modules to stable browser routes', () => {
    expect(agentPageFromPath('/agent/marketplace')).toBe('marketplace');
    expect(agentPageFromPath('/agent/bookings')).toBe('bookings');
  });

  it('keeps Agent Viewer read-only in the console', () => {
    expect(agentCanBook('VIEWER')).toBe(false);
    expect(agentCanBook('FINANCE')).toBe(false);
    expect(agentCanBook('OWNER')).toBe(true);
    expect(agentCanBook('CATALOGUE')).toBe(true);
    expect(agentCanBook('OPERATIONS')).toBe(true);
  });
});

describe('vendor navigation counts', () => {
  it('counts only vendor-actionable bookings and all document expiry alerts', () => {
    expect(partnerHubCountsFromDashboard({ vendorActionRequiredBookings: 2, pendingBookings: 5, draftListings: 1, expiredDocuments: 1, documentsExpiring: 2 })).toEqual({ bookings: 2, products: 1, kyc: 3 });
  });

  it('uses the aggregate booking count only for older summary responses', () => {
    expect(partnerHubCountsFromDashboard({ pendingBookings: 4 })).toEqual({ bookings: 4, products: 0, kyc: 0 });
  });
});
