import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminExperienceMatching from './AdminExperienceMatching';

const linkedProduct = {
  id: 'product-linked', productCode: 'P-LINKED', name: 'Harbour Kayak',
  type: 'ACTIVITY', destination: 'Goa', vendor: { id: 'vendor-one', name: 'Supplier One' },
  status: 'LIVE', experienceMasterId: 'master-one',
};
const unlinkedProduct = {
  id: 'product-unlinked', productCode: 'P-NEW', name: 'Harbour Kayak Sunrise',
  type: 'ACTIVITY', destination: 'Goa', vendor: { id: 'vendor-two', name: 'Supplier Two' },
  status: 'LIVE', experienceMasterId: null,
};
const master = {
  id: 'master-one', canonicalName: 'Harbour Kayak', displayMode: 'ALL_OFFERS',
  selectionPolicy: 'CHEAPEST', products: [linkedProduct, { ...unlinkedProduct, id: 'product-existing-two', name: 'Harbour Kayak Sunset' }],
};

function mockApi(withPendingRules = false) {
  const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path.includes('/suggestions')) return [] as never;
    if (path.includes('/masters') && path.includes('/preview')) return { rulesStatus: 'ACTIVE', offers: [{ productId: 'product-linked', productVariantId: 'variant-1', productCode: 'P-LINKED', vendor: 'Supplier One', vendorId: 'vendor-one', offerName: 'Morning kayak', ratePlanCode: 'RP-1', price: 100, currency: 'INR', rating: 4.6, ratingAvailable: true, reliability: 97, reliabilityAvailable: true, connectionType: 'SUPPLIER_API', availableCapacity: 5, channelAvailable: true, score: 88, eligible: true, selected: true }], winnerProductId: 'product-linked', winnerRatePlanCode: 'RP-1' } as never;
    if (path.endsWith('/masters')) return [master] as never;
    if (path.includes('/experience-matching/products')) return {
      items: [linkedProduct, unlinkedProduct],
      pagination: { page: Number(new URL(`http://localhost${path}`).searchParams.get('page') || 1), limit: 25, total: 2, totalPages: 1 },
    } as never;
    if (path === '/admin/vendors' || path === '/admin/agents' || path.endsWith('/insights')) return [] as never;
    if (path.includes('/selection-rules')) return {
      id: 'rule-one', scope: 'GLOBAL', objective: 'MARGIN', priceWeight: 20,
      ratingWeight: 20, reliabilityWeight: 20, inventoryWeight: 20,
      contractWeight: 20, autoFailover: true, absorbPriceGap: 'NEVER',
      lockMinutes: 15, allocation: 'WINNER_TAKES_ALL', status: 'ACTIVE',
      ...(withPendingRules ? { pendingConfiguration: {
        objective: 'MARGIN', priceWeight: 20, ratingWeight: 20,
        reliabilityWeight: 20, inventoryWeight: 20, contractWeight: 20,
        autoFailover: true, absorbPriceGap: 'NEVER', lockMinutes: 15,
        allocation: 'WINNER_TAKES_ALL',
      }, pendingUpdatedById: 'admin-maker' } : {}),
    } as never;
    return {} as never;
  });
  return request;
}

afterEach(() => vi.restoreAllMocks());

describe('Admin experience offer mapping', () => {
  it('exposes maker-checker approval to normal Admins and submits it through the approval API', async () => {
    const request = mockApi(true);
    render(<AdminExperienceMatching canApprove />);
    fireEvent.click(screen.getByRole('tab', { name: 'Selection rules' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve and publish proposal' }));
    await waitFor(() => expect(request.mock.calls.some(([path, init]) => String(path).endsWith('/selection-rules/approve') && init?.method === 'POST')).toBe(true));
  });

  it('shows measured rating, reliability, and persisted connection signals in the supplier selection preview', async () => {
    mockApi();
    render(<AdminExperienceMatching />);
    fireEvent.click(screen.getByRole('tab', { name: 'Master products' }));
    expect(await screen.findByText('4.6')).toBeInTheDocument();
    expect(await screen.findByText('97%')).toBeInTheDocument();
    expect(await screen.findByText('Supplier API')).toBeInTheDocument();
  });

  it('searches the API with pagination and prevents creating a second master from an already linked product', async () => {
    const request = mockApi();
    render(<AdminExperienceMatching />);
    fireEvent.click(screen.getByRole('tab', { name: 'Master products' }));
    const linkedChoices = await screen.findAllByRole('button', { name: /Harbour Kayak.*Already linked to an experience master/ });
    const linkedChoice = linkedChoices[0];
    expect(linkedChoice).toBeDisabled();
    await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('/experience-matching/products?page=1&limit=25'))).toBe(true));
  });

  it('links and unlinks offers through the existing Admin API routes', async () => {
    const request = mockApi();
    render(<AdminExperienceMatching />);
    fireEvent.click(screen.getByRole('tab', { name: 'Master products' }));
    const linkButton = await screen.findByRole('button', { name: 'Link offer' });
    fireEvent.click(linkButton);
    await waitFor(() => expect(request.mock.calls.some(([path, init]) => String(path) === '/admin/experience-matching/masters/master-one/products' && init?.method === 'POST' && String(init.body).includes('product-unlinked'))).toBe(true));
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[0]);
    await waitFor(() => expect(request.mock.calls.some(([path, init]) => String(path) === '/admin/experience-matching/masters/master-one/products/product-linked' && init?.method === 'DELETE')).toBe(true));
  });
});
