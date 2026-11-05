import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api';
import BasicInfoStep from './BasicInfoStep';
import { emptyFulfilmentForm, emptyRevisionForm, type RevisionForm } from './types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderStep(adminContext: boolean, viewOnly = false, channels: string[] = [], formOverrides: Partial<RevisionForm> = {}, profile?: { displayName?: string | null; legalBusinessName?: string; tenant?: { name?: string } }) {
  const onRevisionChange = vi.fn();
  vi.spyOn(api, 'request').mockImplementation((path) => path === '/vendor/profile' && profile
    ? Promise.resolve(profile as never)
    : new Promise<never>(() => {}));
  render(<BasicInfoStep
    adminContext={adminContext}
    viewOnly={viewOnly}
    revisionForm={{ ...emptyRevisionForm, channels, ...formOverrides }}
    snapshot={{ product: null, revision: null, variants: [], schedules: [] }}
    locked={false}
    fulfilment={{ ...emptyFulfilmentForm }}
    onRevisionChange={onRevisionChange}
    onSaveDraft={async () => true}
    onFulfilmentChange={() => undefined}
    onRefresh={async () => undefined}
    onError={() => undefined}
  />);
  return onRevisionChange;
}

describe('Admin activity channel controls', () => {
  it('shows Admin-only channel selections and updates the revision form', () => {
    const onRevisionChange = renderStep(true);
    const website = screen.getByLabelText('Website & app') as HTMLInputElement;
    expect(website.checked).toBe(false);
    fireEvent.click(website);
    expect(onRevisionChange).toHaveBeenCalledWith('channels', ['WEBSITE_APP']);
  });

  it('lets Admin edit the persisted relevance boost', () => {
    const onRevisionChange = renderStep(true);
    fireEvent.change(screen.getByRole('combobox', { name: /Ranking boost/ }), { target: { value: 'PLUS_TWO' } });
    expect(onRevisionChange).toHaveBeenCalledWith('adminRankingBoost', 'PLUS_TWO');
  });

  it('does not show Admin channel selections in the Vendor wizard', () => {
    renderStep(false);
    expect(screen.queryByText('Sell on')).not.toBeInTheDocument();
  });

  it('shows saved channels in the read-only Admin view without edit controls', () => {
    renderStep(true, true, ['WEBSITE_APP', 'API_PARTNERS']);
    expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Website & app').length).toBeGreaterThan(0);
    expect(screen.getAllByText('API partners').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sell on')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Ranking boost/ })).not.toBeInTheDocument();
  });
});

describe('Product destination field', () => {
  it('clears a stale region when the destination is changed to a city only', () => {
    const onRevisionChange = renderStep(false, false, [], { cityName: 'North Goa', stateName: 'Goa', countryName: 'India' });

    fireEvent.change(screen.getByPlaceholderText('City, state / region'), { target: { value: 'Munnar' } });

    expect(onRevisionChange).toHaveBeenCalledWith('cityName', 'Munnar');
    expect(onRevisionChange).toHaveBeenCalledWith('stateName', '');
  });

  it('updates the city and region together while preserving the separate country field', () => {
    const onRevisionChange = renderStep(false, false, [], { cityName: 'North Goa', stateName: 'Goa', countryName: 'India' });

    fireEvent.change(screen.getByPlaceholderText('City, state / region'), { target: { value: 'Munnar, Kerala' } });

    expect(onRevisionChange).toHaveBeenCalledWith('cityName', 'Munnar');
    expect(onRevisionChange).toHaveBeenCalledWith('stateName', 'Kerala');
    expect(onRevisionChange).not.toHaveBeenCalledWith('countryName', '');
  });
});

describe('Vendor customer-facing name', () => {
  it('uses the saved business display name for the Operated by listing field', async () => {
    renderStep(false, false, [], {}, { displayName: 'Sunrise Experiences', legalBusinessName: 'Sunrise Experiences Private Limited' });

    await waitFor(() => expect(screen.getByText('Operated by').closest('label')?.querySelector('input')).toHaveValue('Sunrise Experiences'));
  });
});

describe('Existing product type selection', () => {
  it('keeps the saved Meals type and subtype when its selected card is clicked', () => {
    const onRevisionChange = renderStep(false, false, [], { type: 'MEALS', subType: 'MEALS' });

    const mealsLabel = screen.getByText('Meals · existing');
    const mealsCard = mealsLabel.closest('button');
    expect(mealsCard).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Guided tour').closest('button')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(mealsCard!);
    expect(onRevisionChange).not.toHaveBeenCalled();
  });

  it('keeps a saved Other product type visible and preserves the existing subtype', () => {
    renderStep(false, false, [], { type: 'OTHERS', subType: 'CUSTOM_SERVICE' });

    const otherLabel = screen.getByText('Other product · existing');
    expect(otherLabel.closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Activity sub-type *' })).toHaveValue('CUSTOM_SERVICE');
  });
});
