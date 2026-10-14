import { describe, expect, it } from 'vitest';
import { adminPageForRole, agentCanBook, agentPageFromPath } from './App';

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
