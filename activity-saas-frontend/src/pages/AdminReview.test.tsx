import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminReview from './AdminReview';

vi.mock('../components/product-wizard/ExperienceWizardModal', () => ({
  default: (props: Record<string, unknown>) => <div data-testid="review-wizard" data-revision={String(props.preferredRevisionId || '')} data-admin-context={String(Boolean(props.adminContext))} data-vendor={String(props.vendorNameOverride || '')} />,
}));

afterEach(() => { vi.restoreAllMocks(); });

describe('Admin product review details', () => {
  it('opens the exact submitted revision with Admin context and vendor identity', async () => {
    vi.spyOn(api, 'request').mockResolvedValue([{
      id: 'revision-submitted-1',
      productId: 'product-1',
      productName: 'Munnar Sunrise Walk',
      versionNumber: 2,
      status: 'UNDER_REVIEW',
      variants: [],
      product: {
        productCode: 'TA-KL-0049',
        tenant: { name: 'Munnar Adventures', vendorProfile: { legalBusinessName: 'Munnar Adventures Pvt. Ltd.' } },
        variants: [],
      },
    }] as never);

    render(<AdminReview />);
    await screen.findByText(/Munnar Sunrise Walk/);
    fireEvent.click(screen.getByRole('button', { name: 'View details' }));

    await waitFor(() => expect(screen.getByTestId('review-wizard')).toHaveAttribute('data-revision', 'revision-submitted-1'));
    expect(screen.getByTestId('review-wizard')).toHaveAttribute('data-admin-context', 'true');
    expect(screen.getByTestId('review-wizard')).toHaveAttribute('data-vendor', 'Munnar Adventures Pvt. Ltd.');
  });
});
