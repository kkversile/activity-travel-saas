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

function EditorHarness({ onError, editorVariants = variants, section = 'pricing' }: { onError: ReturnType<typeof vi.fn>; editorVariants?: typeof variants; section?: 'pricing' | 'availability' | 'policies' }) {
  const [revisionForm, setRevisionForm] = useState({ ...emptyRevisionForm });
  return <ActivityPricesAvailability section={section} snapshot={{ product: { id: 'p1' } as any, revision: null, variants: editorVariants, schedules: [] }} locked={false} revisionForm={revisionForm} fulfilment={{ ...emptyFulfilmentForm }} onSaveDraft={async () => true} onRevisionChange={(key, value) => setRevisionForm((current) => ({ ...current, [key]: value }))} onFulfilmentChange={vi.fn()} onRefresh={async () => undefined} onError={onError as unknown as (message: string) => void} />;
}

function renderEditor(onError = vi.fn(), response: { options: unknown[] } = saved, editorVariants = variants) {
  const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path.endsWith('/prices-availability')) return response as never;
    if (path.endsWith('/prices-availability/preview')) return { valid: true, errors: [], conflicts: [{ type: 'EFFECTIVE_HISTORY_OVERLAP', message: 'This update overlaps existing editor pricing; the save will split the surrounding history.' }], summary: { optionCount: 3, affectedDates: 30, availabilityCount: 0, existingRateCount: 3 }, previousRates: [{ variantId: 'v1', ratePlanName: 'Activity price · Entry Only', effectiveFrom: '2026-11-01', effectiveTo: '2026-12-01', pricingUnit: 'PER_PERSON' }], unchangedFields: ['special and contract rate plans'] } as never;
    return {} as never;
  });
  render(<EditorHarness onError={onError} editorVariants={editorVariants} />);
  return request;
}

afterEach(() => vi.restoreAllMocks());

describe('ActivityPricesAvailability preserves canonical option booking limits', () => {
  it('loads departure times and shared settings from the edited revision instead of a historical option', async () => {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const historic = { ...saved.options[0], ratePlans: [{ ...saved.options[0].ratePlans[0], schedules: [{ operatingDays: days, defaultCapacity: 99, slotTemplates: [{ slotCode: 'OLD', startTime: '10:00', endTime: '12:00' }] }] }] };
    const current = { ...saved.options[1], ratePlans: [{ ...saved.options[1].ratePlans[0], schedules: [{ operatingDays: days, defaultCapacity: 12, slotTemplates: [{ slotCode: 'SUNSET', startTime: '16:00', endTime: '18:00' }] }] }] };
    vi.spyOn(api, 'request').mockImplementation(async (path) => path.endsWith('/prices-availability') ? { options: [historic, current] } as never : {} as never);
    render(<EditorHarness onError={vi.fn()} editorVariants={[variants[1]]} section="availability" />);
    await waitFor(() => expect(screen.getByLabelText('Slot 1 start')).toHaveValue('16:00'));
    expect(screen.getByLabelText('End time')).toHaveValue('18:00');
    expect(screen.getByLabelText('Default capacity')).toHaveValue(12);
    expect(screen.getByRole('combobox', { name: 'Operating day preset' })).toHaveValue('ALL_DAYS');
  });

  it.each([false, true])('refreshes its own saved version while preserving concurrent-edit detection (%s)', async (concurrentEdit) => {
    const onError = vi.fn();
    let appliedCount = 0;
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, init) => {
      if (path.endsWith('/prices-availability/preview')) return { valid: true, errors: [], summary: {} } as never;
      if (path.endsWith('/prices-availability/apply')) {
        const body = JSON.parse(String(init?.body));
        const expected = appliedCount === 0 ? 1 : concurrentEdit ? 3 : 2;
        if (body.options[0].expectedVersion !== expected) throw new Error('This option changed in another session. Reload the activity and retry.');
        appliedCount += 1;
        return { saved: [{ variantId: 'v1', commercialVersionId: `own-${appliedCount + 1}` }] } as never;
      }
      if (path.endsWith('/prices-availability')) {
        const plan = saved.options[0].ratePlans[0];
        const ownNumber = appliedCount + 1;
        return { options: [{ variantId: 'v1', ratePlans: [{ ...plan, versions: [
          { ...plan.versions[0], id: `own-${ownNumber}`, versionNumber: ownNumber },
          ...(concurrentEdit && appliedCount ? [{ ...plan.versions[0], id: 'other-session', versionNumber: 3 }] : []),
        ] }] }] } as never;
      }
      return {} as never;
    });
    render(<EditorHarness onError={onError} editorVariants={[variants[0]]} />);
    const price = await screen.findByLabelText('Entry Only adult or base price');
    await waitFor(() => expect(price).toHaveValue(900));
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(appliedCount).toBe(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Save (all prices|changes)/ })).toBeEnabled());
    fireEvent.change(price, { target: { value: '950' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/prices-availability/apply'))).toHaveLength(2));
    const writes = request.mock.calls.filter(([path]) => path.endsWith('/prices-availability/apply'));
    expect(JSON.parse(String(writes[0][1]?.body)).options[0].expectedVersion).toBe(1);
    expect(JSON.parse(String(writes[1][1]?.body)).options[0].expectedVersion).toBe(2);
    if (concurrentEdit) await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('another session')));
    else {
      await waitFor(() => expect(appliedCount).toBe(2));
      expect(onError).not.toHaveBeenCalled();
    }
  });

  function legacyResponse(versionCutOffMinutes: number | null = 360) {
    const response = structuredClone(saved);
    const plan = response.options[0].ratePlans[0];
    return {
      options: [{
        variantId: 'v1',
        ratePlans: [{
          ...plan, minPax: 4, maxPax: 40, cutOffMinutes: 480,
          versions: [{ ...plan.versions[0], minPax: 3, maxPax: 30, cutOffMinutes: versionCutOffMinutes }],
        }],
      }],
    };
  }

  async function expectPreviewAndApplyLimits(request: ReturnType<typeof renderEditor>, limits: { minPax: number; maxPax: number; cutOffMinutes: number }) {
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await screen.findByText('Preview valid');
    const previewCall = request.mock.calls.find(([path]) => path === '/products/p1/prices-availability/preview');
    expect(previewCall).toBeDefined();
    expect(JSON.parse(String(previewCall?.[1]?.body)).options).toEqual([expect.objectContaining({ variantId: 'v1', ...limits })]);

    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/products/p1/prices-availability/apply', expect.objectContaining({ method: 'POST' })));

    // Check both previews (manual and save-time) and the actual persistence payload.
    const writes = request.mock.calls.filter(([path]) => path.endsWith('/prices-availability/preview') || path.endsWith('/prices-availability/apply'));
    expect(writes).toHaveLength(3);
    for (const [, init] of writes) {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body)).options).toEqual([expect.objectContaining({ variantId: 'v1', ...limits })]);
    }
  }

  it('preserves 2/12/120 on the first pricing save for an option with no existing rate plans', async () => {
    const option = { ...variants[0], minPax: 2, maxPax: 12, cutOffMinutes: 120 };
    const onError = vi.fn();
    const request = renderEditor(onError, { options: [{ variantId: option.id, ratePlans: [] }] }, [option]);
    const price = await screen.findByLabelText('Entry Only adult or base price');
    expect(price).toHaveValue(null);
    expect(screen.getByLabelText('Min travellers')).toHaveValue(2);
    expect(screen.getByLabelText('Max travellers')).toHaveValue(12);
    expect(screen.getByLabelText('Booking cut-off (hours)')).toHaveValue(2);

    // Only enter a price; saving it must not rewrite the option's existing limits.
    fireEvent.change(price, { target: { value: '900' } });
    await expectPreviewAndApplyLimits(request, { minPax: 2, maxPax: 12, cutOffMinutes: 120 });
    expect(onError).not.toHaveBeenCalled();
  });

  it('prefers canonical option limits over conflicting saved plan and version limits', async () => {
    const option = { ...variants[0], minPax: 2, maxPax: 12, cutOffMinutes: 120 };
    const onError = vi.fn();
    const request = renderEditor(onError, legacyResponse(), [option]);
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(900));
    expect(screen.getByLabelText('Min travellers')).toHaveValue(2);
    expect(screen.getByLabelText('Max travellers')).toHaveValue(12);
    expect(screen.getByLabelText('Booking cut-off (hours)')).toHaveValue(2);

    await expectPreviewAndApplyLimits(request, { minPax: 2, maxPax: 12, cutOffMinutes: 120 });
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'keeps explicit canonical zero over a nonzero legacy cutoff', canonical: 0, version: 360, expected: 0 },
    { name: 'falls back from null canonical cutoff to the saved version', canonical: null, version: 360, expected: 360 },
    { name: 'falls back to the saved plan when canonical and version cutoffs are null', canonical: null, version: null, expected: 480 },
  ])('$name', async ({ canonical, version, expected }) => {
    const option = { ...variants[0], minPax: null, maxPax: null, cutOffMinutes: canonical };
    const onError = vi.fn();
    const request = renderEditor(onError, legacyResponse(version), [option]);
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(900));
    expect(screen.getByLabelText('Booking cut-off (hours)')).toHaveValue(expected / 60);
    expect(screen.getByLabelText('Min travellers')).toHaveValue(3);
    expect(screen.getByLabelText('Max travellers')).toHaveValue(30);

    await expectPreviewAndApplyLimits(request, { minPax: 3, maxPax: 30, cutOffMinutes: expected });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('ActivityPricesAvailability unified create/edit editor', () => {
  it('shows imported active prices ahead of an older empty draft version', async () => {
    const response = structuredClone(saved);
    const plan = response.options[0].ratePlans[0];
    const original = plan.versions[0];
    plan.versions = [{ ...original, status: 'DRAFT', versionNumber: 1, travellerPrices: [] }, { ...original, status: 'ACTIVE', versionNumber: 2, travellerPrices: [{ travellerType: 'ADULT', amount: '1800' }] }];
    renderEditor(vi.fn(), response);
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(1800));
  });
  it('continues to show a newer unsaved draft ahead of an older active version', async () => {
    const response = structuredClone(saved);
    const plan = response.options[0].ratePlans[0];
    const original = plan.versions[0];
    plan.versions = [{ ...original, status: 'ACTIVE', versionNumber: 2 }, { ...original, status: 'DRAFT', versionNumber: 3, travellerPrices: [{ travellerType: 'ADULT', amount: '2100' }] }];
    renderEditor(vi.fn(), response);
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(2100));
  });

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

  it('copies Indian visitor prices from the option and only asks for foreign prices', async () => {
    const onError = vi.fn();
    const request = renderEditor(onError);
    await waitFor(() => expect(screen.getByDisplayValue('900')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /Visitor pricing Optional Different Indian \/ foreign prices/ }));
    await waitFor(() => expect(screen.getAllByLabelText(/foreign adult price$/i).length).toBe(2));
    expect(screen.queryAllByLabelText('Indian adult')).toHaveLength(0);
    expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(900);
    expect(screen.getByLabelText('Entry + Adventure adult or base price')).toHaveValue(1200);
    expect(screen.getAllByLabelText(/foreign adult price$/i).every((input) => !(input as HTMLInputElement).readOnly)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Entry Only, Entry + Adventure: enter the foreign adult price or turn off visitor pricing.'));
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/prices-availability/preview'))).toBe(false);
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/prices-availability/apply'))).toBe(false);
  });

  it('names the option when a required traveller price is missing', async () => {
    const onError = vi.fn();
    const request = renderEditor(onError);
    const adultPrice = await screen.findByLabelText('Entry Only adult or base price');
    fireEvent.change(adultPrice, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Entry Only: Enter an adult price.'));
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/prices-availability/preview'))).toBe(false);
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
    expect(screen.getAllByLabelText('Booking cut-off (hours)').at(-1)).toHaveValue(45);
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
