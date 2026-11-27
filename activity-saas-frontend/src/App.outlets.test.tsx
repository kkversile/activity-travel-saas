import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api, type VendorOutletList } from './api';
import { BEFORE_OUTLET_CHANGE } from './components/product-wizard/outletNavigation';

vi.mock('./lazyPages', async importOriginal => ({
  ...await importOriginal<typeof import('./lazyPages')>(),
  PartnerAddProductPage: () => <label>Product title<input /></label>,
}));

const outlets = [
  { id: 'kochi', name: 'Fort Kochi', status: 'ACTIVE' },
  { id: 'alleppey', name: 'Alleppey', status: 'ACTIVE' },
  { id: 'inactive', name: 'Inactive studio', status: 'INACTIVE' },
] as VendorOutletList['outlets'];
let scope: VendorOutletList;

beforeEach(() => {
  scope = { access: 'ALL', outlets };
  api.setToken('fixture-token'); api.setActiveOutletId(null);
  window.history.replaceState({}, '', '/vendor/products/new');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(api, 'request').mockImplementation(async path => {
    if (path === '/auth/me') return { id: 'owner', tenantId: 'vendor', role: 'VENDOR', organizationRole: 'OWNER', fullName: 'Coastal Partner', email: 'owner@fixtures.invalid' } as never;
    if (path === '/vendor/outlets') return scope as never;
    if (path === '/vendor/profile') return { legalBusinessName: 'Coastal Journeys' } as never;
    if (path === '/vendor/onboarding') return { status: 'APPROVED' } as never;
    return {} as never;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); api.setToken(null); api.setActiveOutletId(null); window.history.replaceState({}, '', '/'); });

describe('new product outlet selection', () => {
  it('requires an authorized active outlet before any product details can be entered', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Choose an outlet to create a product' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Product title')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to product details' })).toBeDisabled();
    const choice = screen.getByRole('combobox', { name: 'Outlet for new product' });
    expect(choice).not.toHaveTextContent('Inactive studio');
    fireEvent.change(choice, { target: { value: 'kochi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to product details' }));
    expect(await screen.findByLabelText('Product title')).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get('outletId')).toBe('kochi');
    expect(screen.getByRole('combobox', { name: 'Current outlet' })).toHaveValue('kochi');
  });

  it('does not remount or change request scope when the editor cancels an outlet switch', async () => {
    window.history.replaceState({}, '', '/vendor/products/new?outletId=kochi');
    render(<App />);
    const title = await screen.findByLabelText('Product title');
    fireEvent.change(title, { target: { value: 'Unsaved coastal walk' } });
    const cancel = (event: Event) => event.preventDefault();
    window.addEventListener(BEFORE_OUTLET_CHANGE, cancel);
    try {
      fireEvent.change(screen.getByRole('combobox', { name: 'Current outlet' }), { target: { value: 'alleppey' } });
      expect(title).toHaveValue('Unsaved coastal walk');
      expect(screen.getByRole('combobox', { name: 'Current outlet' })).toHaveValue('kochi');
      expect(new URLSearchParams(window.location.search).get('outletId')).toBe('kochi');
    } finally { window.removeEventListener(BEFORE_OUTLET_CHANGE, cancel); }
    fireEvent.change(screen.getByRole('combobox', { name: 'Current outlet' }), { target: { value: 'alleppey' } });
    expect(screen.getByRole('combobox', { name: 'Current outlet' })).toHaveValue('alleppey');
    expect(screen.getByLabelText('Product title')).toHaveValue('');
  });

  it('opens directly for an employee with one assigned active outlet and ignores a foreign outlet URL', async () => {
    scope = { access: 'ASSIGNED', outlets: [outlets[0]] };
    window.history.replaceState({}, '', '/vendor/products/new?outletId=foreign-outlet');
    render(<App />);
    expect(await screen.findByLabelText('Product title')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose an outlet to create a product' })).not.toBeInTheDocument();
  });

  it('does not open a new editor for an inactive outlet or an account with no assignments', async () => {
    scope = { access: 'ASSIGNED', outlets: [outlets[2]] };
    render(<App />);
    expect(await screen.findByRole('status')).toHaveTextContent('No active outlet is available');
    expect(screen.queryByLabelText('Product title')).not.toBeInTheDocument();
  });
});
