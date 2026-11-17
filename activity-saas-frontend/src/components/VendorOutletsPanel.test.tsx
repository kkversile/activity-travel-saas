import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../api';
import VendorOutletsPanel from './VendorOutletsPanel';

afterEach(() => vi.restoreAllMocks());

it('shows existing employee grants as checked and sends a revocation when unchecked', async () => {
  let granted = true;
  const request = vi.spyOn(api, 'request').mockImplementation(async (path, init) => {
    if (path === '/vendor/outlets') return { outlets: [{ id: 'outlet-a', outletCode: 'A', name: 'Outlet A', status: 'ACTIVE', isDefault: true }] } as never;
    if (path === '/vendor/bank-accounts') return { items: [] } as never;
    if (path === '/vendor/team') return { members: [{ id: 'employee-a', email: 'a@abc.local', organizationRole: 'OPERATIONS', outletAccess: granted ? [{ outletId: 'outlet-a', active: true }] : [] }] } as never;
    if (path === '/vendor/outlets/outlet-a/members/employee-a') { granted = JSON.parse(String(init?.body)).active; return {} as never; }
    throw new Error(`Unexpected request: ${path}`);
  });
  render(<VendorOutletsPanel />);
  const grant = await screen.findByRole('checkbox', { name: 'Outlet A access for a@abc.local' });
  expect(grant).toBeChecked();
  fireEvent.click(grant);
  await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/outlets/outlet-a/members/employee-a', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ active: false }) })));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Outlet A access for a@abc.local' })).not.toBeChecked());
});
