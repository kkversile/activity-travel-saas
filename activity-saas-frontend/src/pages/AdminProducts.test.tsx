import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminProducts from './AdminProducts';

vi.mock('../components/product-wizard/ExperienceWizardModal', () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="shared-product-wizard"
      data-view-only={String(props.viewOnly)}
      data-admin-context={String(props.adminContext)}
      data-revision-id={String(props.preferredRevisionId)}
      data-vendor={String(props.vendorNameOverride)}
    />
  ),
}));

afterEach(() => vi.restoreAllMocks());

describe('Admin product view parity', () => {
  it('opens the same shared product wizard in read-only mode on the selected revision', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/vendors') return [] as never;
      if (path.startsWith('/admin/products?')) return {
        items: [{
          id: 'product-1', productCode: 'TA-GA-0318', publicCode: 'PR-0000318',
          productStatus: 'LIVE', workingRevisionId: 'revision-7', workingRevisionStatus: 'UNDER_REVIEW',
          name: 'North Goa Full-Day Sightseeing Tour', type: 'GUIDED_TOUR', destination: 'North Goa',
          vendor: { id: 'vendor-1', name: 'Blue Mountain Adventures' }, optionCount: 2, ratePlanCount: 2,
          updatedAt: '2026-11-01T00:00:00.000Z',
        }],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      } as never;
      return {} as never;
    });

    render(<AdminProducts />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    expect(screen.getByTestId('shared-product-wizard')).toHaveAttribute('data-view-only', 'true');
    expect(screen.getByTestId('shared-product-wizard')).toHaveAttribute('data-admin-context', 'true');
    expect(screen.getByTestId('shared-product-wizard')).toHaveAttribute('data-revision-id', 'revision-7');
    expect(screen.getByTestId('shared-product-wizard')).toHaveAttribute('data-vendor', 'Blue Mountain Adventures');
  });

  it('does not open a rejected historical revision over a live published revision', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/vendors') return [] as never;
      if (path.startsWith('/admin/products?')) return {
        items: [{
          id: 'product-2', productCode: 'TA-GA-0322', productStatus: 'LIVE',
          workingRevisionId: 'rejected-revision', workingRevisionStatus: 'REJECTED',
          name: 'South Goa Heritage & Beaches Tour', type: 'GUIDED_TOUR', destination: 'South Goa',
          vendor: { id: 'vendor-2', name: 'South Coast Experiences' }, optionCount: 1, ratePlanCount: 1,
          updatedAt: '2026-11-01T00:00:00.000Z',
        }],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      } as never;
      return {} as never;
    });

    render(<AdminProducts />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    expect(screen.getByTestId('shared-product-wizard')).toHaveAttribute('data-revision-id', 'null');
  });
});
