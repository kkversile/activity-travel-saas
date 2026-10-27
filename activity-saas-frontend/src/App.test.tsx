import { describe, expect, it } from 'vitest';
import { adminPageForRole, agentCanBook, agentPageFromPath, vendorPageFromPath, vendorPathFor } from './App';

describe('admin route authorization', () => {
  it('keeps Admin Users available only to Super Admin', () => {
    expect(adminPageForRole('/admin/users', 'SUPER_ADMIN')).toBe('users');
    expect(adminPageForRole('/admin/users', 'ADMIN')).toBe('dashboard');
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

describe('approved vendor Profile routing', () => {
  it('recognizes the new Profile URL as the existing approved vendor workspace', () => {
    expect(vendorPageFromPath('/vendor/profile')).toBe('onboarding');
    expect(vendorPageFromPath('/vendor/onboarding')).toBe('onboarding');
  });

  it('keeps unfinished applications in Onboarding and approved vendors in Profile', () => {
    expect(vendorPathFor('onboarding', 'APPROVED')).toBe('/vendor/profile');
    expect(vendorPathFor('onboarding', 'DRAFT')).toBe('/vendor/onboarding');
    expect(vendorPathFor('onboarding', 'CHANGES_REQUESTED')).toBe('/vendor/onboarding');
    expect(vendorPathFor('dashboard', 'APPROVED')).toBe('/vendor/dashboard');
  });
});
