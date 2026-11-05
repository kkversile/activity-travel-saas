import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminVendors from './AdminVendors';

afterEach(() => vi.restoreAllMocks());

describe('Admin vendor list', () => {
  it('creates the vendor record and emails the owner a password setup code', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/admin/vendors' && options?.method === 'POST') return { vendorName: 'Konkan Kayak Co.', email: 'owner@example.com', inviteRequired: true } as never;
      if (path === '/admin/vendors') return [] as never;
      if (path === '/auth/vendor/email/request') return { message: 'sent' } as never;
      return {} as never;
    });
    render(<AdminVendors canCreateVendor />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create vendor' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Legal name' }), { target: { value: 'Konkan Kayak Co.' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Owner name' }), { target: { value: 'Rahul Sawant' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Main city' }), { target: { value: 'Malvan' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mobile' }), { target: { value: '+91 94220 18833' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create & send invite' }));

    expect(await screen.findByText('Vendor created and activation email sent.')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/auth/vendor/email/request', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com' }) });
    const createCall = request.mock.calls.find(([path, options]) => path === '/admin/vendors' && options?.method === 'POST');
    expect(JSON.parse(String(createCall?.[1]?.body))).not.toHaveProperty('password');
  });

  it('provides the prototype create-activity action from the selected vendor detail', async () => {
    const createActivity = vi.fn();
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/vendors') return [{ id: 'vendor-1', name: 'Coastal Adventures', vendorProfile: { legalBusinessName: 'Coastal Adventures', verificationStatus: 'VERIFIED' } }] as never;
      if (path === '/admin/vendors/vendor-1') return { id: 'vendor-1', name: 'Coastal Adventures', vendorProfile: { legalBusinessName: 'Coastal Adventures', verificationStatus: 'VERIFIED' }, users: [], products: [] } as never;
      if (path.endsWith('/onboarding')) return { vendorOnboarding: null } as never;
      return {} as never;
    });

    render(<AdminVendors onCreateActivity={createActivity} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create activity for them' }));

    await waitFor(() => expect(createActivity).toHaveBeenCalledWith('vendor-1'));
  });

  it('shows mixed effective commercial terms without presenting an average commission', async () => {
    vi.spyOn(api, 'request').mockResolvedValue([{
      id: 'vendor-1', name: 'Coastal Adventures', publicCode: 'SUP-0001',
      vendorProfile: { legalBusinessName: 'Coastal Adventures', operatingCity: 'Panaji', verificationStatus: 'VERIFIED', readinessScore: 100 },
      commercialModel: 'MIXED', commissionPercent: null, commissionVaries: true, commissionValues: [18],
      _count: { products: 2 },
    }] as never);

    render(<AdminVendors />);

    expect(await screen.findAllByText('Coastal Adventures')).toHaveLength(1);
    expect(screen.getByText('Mixed by rate plan')).toBeInTheDocument();
    expect(screen.getByText('Varies')).toBeInTheDocument();
    expect(screen.queryByText('18.00%')).not.toBeInTheDocument();
  });

  it('filters vendors by prototype status and searches by city and public ID', async () => {
    vi.spyOn(api, 'request').mockResolvedValue([
      { id: 'vendor-1', name: 'Coastal Adventures', publicCode: 'SUP-0001', vendorProfile: { legalBusinessName: 'Coastal Adventures', operatingCity: 'Panaji', verificationStatus: 'VERIFIED' } },
      { id: 'vendor-2', name: 'Mountain Walks', publicCode: 'SUP-0002', vendorProfile: { legalBusinessName: 'Mountain Walks', operatingCity: 'Munnar', verificationStatus: 'PENDING' } },
      { id: 'vendor-3', name: 'Island Ferries', publicCode: 'SUP-0003', vendorProfile: { legalBusinessName: 'Island Ferries', operatingCity: 'Port Blair', verificationStatus: 'SUSPENDED' } },
    ] as never);

    render(<AdminVendors />);

    fireEvent.click(await screen.findByRole('button', { name: 'Active' }));
    expect(screen.getByText('Coastal Adventures')).toBeInTheDocument();
    expect(screen.queryByText('Mountain Walks')).not.toBeInTheDocument();
    expect(screen.queryByText('Island Ferries')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'In verification' }));
    expect(screen.getByText('Mountain Walks')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search vendor, city or ID'), { target: { value: 'SUP-0002' } });
    expect(screen.getByText('Mountain Walks')).toBeInTheDocument();
    expect(screen.queryByText('Coastal Adventures')).not.toBeInTheDocument();
  });
});
