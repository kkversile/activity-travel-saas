import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App, { adminPageForRole, agentCanBook, agentPageFromPath } from './App';
import { api } from './api';
import { partnerHubCountsFromDashboard } from './layouts/vendorNavigation';

describe('account navigation', () => {
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  afterEach(() => {
    cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    HTMLElement.prototype.scrollIntoView = originalScroll;
    api.setToken(null); window.history.replaceState({}, '', '/');
  });

  it.each([true, false])('takes mobile account links directly to the form while preserving desktop navigation (%s)', mobile => {
    api.setToken(null); window.history.replaceState({}, '', '/');
    const scroll = vi.fn(); HTMLElement.prototype.scrollIntoView = scroll;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile })));
    vi.spyOn(api, 'request').mockResolvedValue({ items: [] } as never);
    const login = vi.spyOn(api, 'login');
    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Create account' })[0]);
    expect(window.location.pathname).toBe('/register');
    expect(screen.getByRole('heading', { name: 'Become a Voya partner' })).toBeInTheDocument();
    expect(window.location.hash).toBe(mobile ? '#partner-account' : '');
    if (mobile) {
      expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
      expect(document.activeElement).toBe(document.getElementById('partner-account'));
    } else expect(scroll).not.toHaveBeenCalled();

    scroll.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Log in' })[0]);
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.hash).toBe(mobile ? '#partner-account' : '');
    expect(scroll).toHaveBeenCalledTimes(mobile ? 1 : 0);
    expect(login).not.toHaveBeenCalled();
  });
});

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
