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

describe('Dependent product destinations', () => {
  it('clears the old city when a different region is selected', () => {
    const change=renderStep(false,false,[],{countryName:'India',stateName:'Goa',cityName:'North Goa'});
    fireEvent.focus(screen.getByRole('combobox',{name:'State / region *'}));
    fireEvent.change(screen.getByRole('combobox',{name:'State / region *'}),{target:{value:'Kerala'}});
    fireEvent.click(screen.getByRole('button',{name:'Kerala'}));
    expect(change).toHaveBeenCalledWith('stateName','Kerala');
    expect(change).toHaveBeenCalledWith('cityName','');
  });
  it('clears both dependent selections when the country changes', () => {
    const change=renderStep(false,false,[],{countryName:'India',stateName:'Kerala',cityName:'Munnar'});
    fireEvent.focus(screen.getByRole('combobox',{name:'Country *'}));
    fireEvent.change(screen.getByRole('combobox',{name:'Country *'}),{target:{value:'Singapore'}});
    fireEvent.click(screen.getByRole('button',{name:'Singapore'}));
    expect(change).toHaveBeenCalledWith('countryName','Singapore');expect(change).toHaveBeenCalledWith('stateName','');expect(change).toHaveBeenCalledWith('cityName','');
  });
  it('shows only cities in the chosen region and discards unselected free text', () => {
    const change=renderStep(false,false,[],{countryName:'India',stateName:'Kerala',cityName:'Munnar'});
    const city=screen.getByRole('combobox',{name:'Destination city *'});
    fireEvent.focus(city);fireEvent.change(city,{target:{value:'Munn'}});fireEvent.keyDown(city,{key:'Enter'});
    expect(change).toHaveBeenCalledWith('cityName','Munnar');change.mockClear();
    fireEvent.focus(city);fireEvent.change(city,{target:{value:'wrong city'}});fireEvent.blur(city);
    expect(change).not.toHaveBeenCalled();expect(city).toHaveValue('Munnar');
  });
  it('clears a number and disables numeric input when Flexible is selected', () => {
    const change=renderStep(false,false,[],{durationUnit:'HOURS',durationValue:'2'});
    fireEvent.change(screen.getByRole('combobox',{name:'Duration unit'}),{target:{value:'FLEXIBLE'}});
    expect(change).toHaveBeenCalledWith('durationUnit','FLEXIBLE');expect(change).toHaveBeenCalledWith('durationValue','');
  });
  it('selects an exact city match ahead of a longer containing name', () => {
    const change=renderStep(false,false,[],{countryName:'India',stateName:'Kerala'});
    const city=screen.getByRole('combobox',{name:'Destination city *'});
    fireEvent.focus(city);fireEvent.change(city,{target:{value:'Kochi'}});fireEvent.keyDown(city,{key:'Enter'});
    expect(change).toHaveBeenCalledWith('cityName','Kochi');
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

it('keeps an imported three-letter currency selected even outside the common currency choices', () => {
  renderStep(false, false, [], { currency: 'CAD' });
  expect(screen.getByLabelText('Product currency *')).toHaveValue('CAD');
});
