import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type ProductReadiness, type ProductRevision } from '../../api';
import ReviewSubmitStep from './ReviewSubmitStep';
import { emptyFulfilmentForm, emptyRevisionForm, type FulfilmentForm } from './types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function readinessFixture(): ProductReadiness {
  const ready = () => ({ ready: true, reasonCodes: [] });
  return {
    productId: 'product-42', revisionId: 'draft-42', ready: true, reasonCodes: [], evaluatedAt: '2026-11-14T12:00:00Z', distributionReady: true, distributionReasonCodes: [],
    sections: {
      basicInfo: ready(), experience: ready(), mediaFulfilment: ready(), options: ready(), rates: ready(),
      availability: ready(), policies: ready(), voucher: ready(), distribution: ready(),
    },
  };
}

function renderReview(readiness: ProductReadiness, mode: FulfilmentForm['mode'] = 'AUTO') {
  const request = vi.spyOn(api, 'request').mockResolvedValue(readiness);
  const onNavigate = vi.fn();
  render(<ReviewSubmitStep
    snapshot={{
      product: { id: 'product-42', tenantId: 'vendor-42', productCode: 'ACT-42', status: 'DRAFT' },
      revision: { id: 'draft-42', status: 'DRAFT' } as ProductRevision,
      variants: [], schedules: [],
    }}
    locked={false}
    revisionForm={{ ...emptyRevisionForm }}
    fulfilment={{ ...emptyFulfilmentForm, mode }}
    onNavigate={onNavigate}
    onRevisionChange={vi.fn()}
    onFulfilmentChange={vi.fn()}
    onSaveDraft={async () => true}
    onRefresh={async () => undefined}
    onError={vi.fn()}
  />);
  return { request, onNavigate };
}

describe('ReviewSubmitStep fulfilment readiness', () => {
  it('immediately shows required fulfilment settings when no mode is selected', async () => {
    const { request } = renderReview(readinessFixture(), '');

    const summary = screen.getByText('Fulfilment settings · Required before submission');
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('combobox', { name: 'Fulfilment mode' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Fulfilment mode' })).toHaveValue('');
    expect(screen.queryByText(/advanced/i)).not.toBeInTheDocument();

    await screen.findByText('Ready for submission.');
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(request).toHaveBeenCalledWith('/products/product-42/readiness');
  });

  it('opens settings for a canonical fulfilment blocker, and Fix reopens them and focuses the mode', async () => {
    const readiness = readinessFixture();
    readiness.ready = false;
    readiness.reasonCodes = ['FULFILMENT_POLICY_MISSING'];
    readiness.sections.mediaFulfilment = { ready: false, reasonCodes: ['FULFILMENT_POLICY_MISSING'] };
    const { onNavigate } = renderReview(readiness);
    const summary = screen.getByText('Fulfilment settings');
    const details = summary.closest('details')!;
    // A locally selected mode does not hide an outstanding canonical blocker.
    expect(details).not.toHaveAttribute('open');

    const reason = await screen.findByText('Fulfilment policy is missing');
    expect(details).toHaveAttribute('open');
    expect(screen.getByRole('combobox', { name: 'Fulfilment mode' })).toHaveValue('AUTO');
    expect(screen.queryByText(/advanced/i)).not.toBeInTheDocument();
    const fulfilmentRow = reason.closest('.review-checklist-row')! as HTMLElement;
    expect(within(fulfilmentRow).getByText('Fulfilment')).toBeInTheDocument();

    fireEvent.click(summary);
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByLabelText('Fulfilment mode')).not.toBeVisible();
    // jsdom has no layout/scroll implementation; focus remains real DOM behavior.
    const scrollIntoView = vi.fn();
    details.scrollIntoView = scrollIntoView;
    fireEvent.click(within(fulfilmentRow).getByRole('button', { name: 'Fix' }));

    expect(details).toHaveAttribute('open');
    expect(screen.getByRole('combobox', { name: 'Fulfilment mode' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Fulfilment mode' })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('leaves unmapped distribution to admin after QC without blocking submission or offering a vendor Fix', async () => {
    const readiness = readinessFixture();
    // Canonical submission readiness excludes this post-QC admin configuration.
    readiness.sections.distribution = { ready: false, reasonCodes: ['CHANNEL_PRODUCT_NOT_MAPPED'] };
    const { onNavigate } = renderReview(readiness);

    await screen.findByText('Ready for submission.');
    const distributionRow = screen.getByText('Channel distribution').closest('.review-checklist-row')! as HTMLElement;
    expect(within(distributionRow).getByText('Product is not connected to the Agent Marketplace')).toBeInTheDocument();
    expect(within(distributionRow).getByText('Configured by admin after QC')).toBeVisible();
    expect(within(distributionRow).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('All required sections are complete. Submit the draft for QC when you are ready.')).toBeVisible();
    expect(screen.queryByText(/block submission/)).not.toBeInTheDocument();
    expect(screen.getByText('Fulfilment settings').closest('details')).not.toHaveAttribute('open');
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
