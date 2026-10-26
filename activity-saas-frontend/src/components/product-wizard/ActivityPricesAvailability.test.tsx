import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api';
import ActivityPricesAvailability from './ActivityPricesAvailability';
import { emptyFulfilmentForm, emptyRevisionForm } from './types';

const variants: any[] = [
  { id: 'v1', productId: 'p1', variantCode: 'ENTRY-ONLY', name: 'Entry Only', status: 'ACTIVE', version: 1, pickupIncluded: false, dropoffIncluded: false, mealIncluded: false, inclusions: [], exclusions: [], suitableFor: [] },
  { id: 'v2', productId: 'p1', variantCode: 'ENTRY-ADVENTURE', name: 'Entry + Adventure', status: 'ACTIVE', version: 1, pickupIncluded: false, dropoffIncluded: false, mealIncluded: false, inclusions: [], exclusions: [], suitableFor: [] },
  { id: 'v3', productId: 'p1', variantCode: 'PRIVATE-JEEP-SAFARI', name: 'Private Jeep Safari', status: 'ACTIVE', version: 1, pickupIncluded: false, dropoffIncluded: false, mealIncluded: false, inclusions: [], exclusions: [], suitableFor: [] },
];

const saved = {
  options: variants.map((variant, index) => ({
    variantId: variant.id,
    ratePlans: [{ editable: true, currency: index === 0 ? 'USD' : 'INR', cancellationRules: index === 0 ? [{ minDaysBefore: 7, maxDaysBefore: null, chargeValue: 0, chargeType: 'PERCENTAGE' }] : [], versions: [{ status: 'DRAFT', versionNumber: index + 1, currency: index === 0 ? 'USD' : 'INR', effectiveFrom: '2026-11-01', effectiveTo: '2026-12-01', pricingUnit: index === 2 ? 'PER_UNIT' : 'PER_PERSON', supplierBaseAmount: index === 2 ? '3500' : undefined, travellerPrices: index === 2 ? [] : [{ travellerType: 'ADULT', amount: String(900 + index * 300) }], sourcePayload: { pricingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], ...(index === 2 ? { maxPassengersPerResource: 7 } : {}) } }] }],
  })),
};

function EditorHarness({ onError }: { onError: ReturnType<typeof vi.fn> }) {
  const [revisionForm, setRevisionForm] = useState({ ...emptyRevisionForm });
  return <ActivityPricesAvailability snapshot={{ product: { id: 'p1' } as any, revision: null, variants, schedules: [] }} locked={false} revisionForm={revisionForm} fulfilment={{ ...emptyFulfilmentForm }} onSaveDraft={async () => true} onRevisionChange={(key, value) => setRevisionForm((current) => ({ ...current, [key]: value }))} onFulfilmentChange={vi.fn()} onRefresh={async () => undefined} onError={onError as unknown as (message: string) => void} />;
}

function renderEditor(onError = vi.fn()) {
  const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path.endsWith('/prices-availability')) return saved as never;
    if (path.endsWith('/prices-availability/preview')) return { valid: true, errors: [], conflicts: [{ type: 'EFFECTIVE_HISTORY_OVERLAP', message: 'This update overlaps existing editor pricing; the save will split the surrounding history.' }], summary: { optionCount: 3, affectedDates: 30, availabilityCount: 0, existingRateCount: 3 }, previousRates: [{ variantId: 'v1', ratePlanName: 'Activity price · Entry Only', effectiveFrom: '2026-11-01', effectiveTo: '2026-12-01', pricingUnit: 'PER_PERSON' }], unchangedFields: ['special and contract rate plans'] } as never;
    return {} as never;
  });
  render(<EditorHarness onError={onError} />);
  return request;
}

afterEach(() => vi.restoreAllMocks());

describe('ActivityPricesAvailability unified create/edit editor', () => {
  it('loads all options and exposes existing rates from the same editor', async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('900')).toBeInTheDocument());
    expect(screen.getByText('3 options')).toBeInTheDocument();
    expect(screen.getAllByText('Entry Only').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Entry + Adventure').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Private Jeep Safari').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'View existing rates' }));
    await waitFor(() => expect(screen.getByText('Existing rates')).toBeInTheDocument());
    expect(screen.getByText(/Activity price · Entry Only/)).toBeInTheDocument();
  });

  it('blocks preview until every selected option has visitor adult prices', async () => {
    const onError = vi.fn();
    renderEditor(onError);
    await waitFor(() => expect(screen.getByDisplayValue('900')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Different Indian / foreign prices' }));
    await waitFor(() => expect(screen.getAllByLabelText('Indian adult').length).toBe(3));
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Enter Indian and foreign adult prices for every selected option, or turn off visitor pricing.'));
  });

  it('reloads persisted cancellation rules and per-resource passenger limits', async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('3500')).toBeInTheDocument());
    expect(screen.getByLabelText('Max passengers / resource')).toHaveValue(7);
    expect(screen.getByRole('checkbox', { name: 'Use explicit cancellation policy' })).toBeChecked();
  });

  it('pastes resource pricing and capacity columns into the same editor', async () => {
    renderEditor();
    const basePrice = await screen.findByLabelText('Private Jeep Safari adult or base price');
    fireEvent.paste(basePrice, {
      clipboardData: { getData: () => '3600\t8\t1\t8\t45' },
    });
    expect(basePrice).toHaveValue(3600);
    expect(screen.getByLabelText('Max passengers / resource')).toHaveValue(8);
    expect(screen.getAllByLabelText('Cutoff (minutes)').at(-1)).toHaveValue(45);
  });

  it('sends booking-rule edits through the shared create/edit save request', async () => {
    const request = renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('900')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use explicit cancellation policy' }));
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('/prices-availability/apply'), expect.objectContaining({ body: expect.stringContaining('cancellationRules') })));
  });

  it('preserves the existing offer currency instead of forcing INR', async () => {
    const request = renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('900')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('/prices-availability/apply'), expect.anything()));
    const applyCall = request.mock.calls.find(([path]) => String(path).endsWith('/prices-availability/apply'));
    expect(JSON.parse(String(applyCall?.[1]?.body)).options[0].currency).toBe('USD');
  });

  it('explains effective-history overlap handling in the preview', async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('900')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(screen.getByText(/split the surrounding history/)).toBeInTheDocument());
  });
});
