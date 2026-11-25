import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Configure availability now' }));
    fireEvent.change(screen.getByLabelText('Default capacity'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Also update capacity/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(appliedCount).toBe(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Save (all prices|changes)/ })).toBeEnabled());
    expect(screen.getByRole('checkbox', { name: /Also update capacity/ })).not.toBeChecked();
    fireEvent.change(price, { target: { value: '950' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/prices-availability/apply'))).toHaveLength(2));
    const writes = request.mock.calls.filter(([path]) => path.endsWith('/prices-availability/apply'));
    expect(JSON.parse(String(writes[0][1]?.body)).options[0].expectedVersion).toBe(1);
    expect(JSON.parse(String(writes[1][1]?.body)).options[0].expectedVersion).toBe(2);
    expect(JSON.parse(String(writes[0][1]?.body)).options[0].availability).toBeDefined();
    expect(JSON.parse(String(writes[1][1]?.body)).options[0].availability).toBeUndefined();
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
  it('leaves hidden traveller and visitor types to the server during repeated field patches and explicit visitor opt-out', async () => {
    const response: any = structuredClone(saved);
    response.options = [response.options[0]];
    const version = response.options[0].ratePlans[0].versions[0];
    const amounts = { ADULT: '1800', CHILD: '0', SENIOR: '1400', INFANT: '0', YOUTH: '1200.1234', GROUP: '2000' };
    version.travellerPrices = Object.entries(amounts).map(([travellerType, amount]) => ({ travellerType, amount }));
    version.sourcePayload = { ...version.sourcePayload, mrpMode: 'YES', mrpAmount: '3000', visitorPrices: Object.entries(amounts).map(([travellerType, indian]) => ({ travellerType, indian, foreign: travellerType === 'INFANT' ? '0' : '2600' })) };
    const onError = vi.fn(), request = renderEditor(onError, response, [variants[0]]);
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(1800));
    fireEvent.click(screen.getByRole('checkbox', { name: /Visitor pricing Optional/ }));
    fireEvent.change(screen.getByLabelText('Entry Only adult or base price'), { target: { value: '1900' } });
    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
      await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/apply'))).toHaveLength(index + 1));
      await waitFor(() => expect(screen.getByRole('button', { name: /Save (all prices|changes)/ })).toBeEnabled());
      const body = JSON.parse(String(request.mock.calls.filter(([path]) => path.endsWith('/apply')).at(-1)?.[1]?.body));
      expect(body.options[0].updateMode).toBe('PATCH');
      if (index === 0) {
        expect(body.options[0].travellerPrices).toEqual([{ travellerType: 'ADULT', amount: '1900' }]);
        expect(body.options[0].visitorPrices).toHaveLength(3);
      } else {
        expect(body.options[0]).not.toHaveProperty('travellerPrices');
        expect(body.options[0]).not.toHaveProperty('visitorPrices');
      }
      expect(body.options[0].visitorPrices || []).not.toEqual(expect.arrayContaining([expect.objectContaining({ travellerType: 'INFANT' })]));
    }
    fireEvent.click(screen.getByRole('checkbox', { name: /Visitor pricing Optional/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/apply'))).toHaveLength(3));
    const body = JSON.parse(String(request.mock.calls.filter(([path]) => path.endsWith('/apply')).at(-1)?.[1]?.body));
    expect(body.hasDifferentialVisitorPricing).toBe(false);
    expect(body.options[0]).not.toHaveProperty('visitorPrices');
    expect(body.options[0]).not.toHaveProperty('travellerPrices');
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['GROUP', 'PER_BOOKING', 'PER_UNIT'])('saves selected traveller and %s options with visitor pricing enabled', async (unit) => {
    const response: any = structuredClone(saved); response.options = response.options.slice(0, 2);
    const person = response.options[0].ratePlans[0].versions[0], group = response.options[1].ratePlans[0].versions[0];
    person.sourcePayload.visitorPrices = [{ travellerType: 'ADULT', indian: '900', foreign: '1500' }];
    Object.assign(group, { pricingUnit: unit, supplierBaseAmount: '5000', travellerPrices: [], sourcePayload: { maxPassengersPerResource: 6 } });
    const onError = vi.fn(), request = renderEditor(onError, response, variants.slice(0, 2));
    await waitFor(() => expect(screen.getByLabelText('Entry + Adventure adult or base price')).toHaveValue(5000));
    fireEvent.click(screen.getByRole('checkbox', { name: /Visitor pricing Optional/ }));
    expect(screen.queryByLabelText('Entry + Adventure foreign adult price')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/products/p1/prices-availability/apply', expect.anything()));
    const body = JSON.parse(String(request.mock.calls.find(([path]) => path.endsWith('/apply'))?.[1]?.body));
    expect(body.hasDifferentialVisitorPricing).toBe(true);
    expect(body.options).toHaveLength(2);
    expect(body.options[1]).toMatchObject({ updateMode: 'PATCH', variantId: 'v2' });
    expect(body.options[1]).not.toHaveProperty('supplierBaseAmount');
    expect(body.options[1]).not.toHaveProperty('pricingUnit');
    expect(body.options[1]).not.toHaveProperty('visitorPrices');
    expect(onError).not.toHaveBeenCalled();
  });

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
    expect(JSON.parse(String(applyCall?.[1]?.body)).options[0]).toMatchObject({ updateMode: 'PATCH' });
    expect(JSON.parse(String(applyCall?.[1]?.body)).options[0]).not.toHaveProperty('currency');
  });

  it('explains effective-history overlap handling in the preview', async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('900')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
    await waitFor(() => expect(screen.getByText(/split the surrounding history/)).toBeInTheDocument());
  });
});


describe('activity pricing preservation and preview regressions', () => {
  it.each([
    ['PER_PERSON', 'per traveller'], ['PER_BOOKING', 'per booking'],
    ['PER_UNIT', 'per resource / vehicle'], ['GROUP', 'per group'],
  ])('renders the correct %s basis for positive, zero and blank values', async (unit, suffix) => {
    const response: any = structuredClone(saved); response.options = [response.options[0]];
    response.options[0].ratePlans[0].currency = 'INR';
    Object.assign(response.options[0].ratePlans[0].versions[0], { pricingUnit: unit, supplierBaseAmount: '7300',
      currency: 'INR',
      travellerPrices: [{ travellerType: 'ADULT', amount: '7300' }],
      supplierCommissionPercent: '0', sourcePayload: { maxPassengersPerResource: 6, mrpMode: 'YES', mrpAmount: '8500' } });
    renderEditor(vi.fn(), response, [variants[0]]);
    const input = await screen.findByLabelText('Entry Only adult or base price');
    await waitFor(() => expect(input).toHaveValue(7300));
    const preview = document.querySelector('.prototype-final-price-preview')!;
    expect(preview.textContent).toContain('₹7300.00'); expect(preview.textContent).toContain(suffix);
    if (unit !== 'PER_PERSON') expect(preview.textContent).not.toContain('per traveller');
    fireEvent.change(input, { target: { value: '0' } });
    expect(preview.textContent).toContain('₹0.00'); expect(preview.textContent).not.toContain('Enter a sell price');
    const breakdown = document.querySelector('.prototype-rate-breakdown-row')!;
    expect(breakdown.textContent?.match(/₹0.00/g)).toHaveLength(3);
    expect(breakdown.textContent).toContain('100.0%');
    fireEvent.change(input, { target: { value: '' } });
    expect(preview.textContent).toContain('Enter a sell price');
  });

  it('omits untouched shared rules from a multi-option price edit and applies explicit common changes', async () => {
    const response: any = structuredClone(saved); response.options = response.options.slice(0, 2);
    Object.assign(response.options[1].ratePlans[0].versions[0].sourcePayload, { pricingDays: ['SAT', 'SUN'], pricingTimezone: 'Asia/Dubai', pricingSlotCodes: ['06:00'], ratePeriods: [{ name: 'Weekend premium' }] });
    const request = renderEditor(vi.fn(), response, variants.slice(0, 2));
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(900));
    expect(screen.getByText(/Mixed pricing settings:/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Entry Only adult or base price'), { target: { value: '950' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/apply'))).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Save (all prices|changes)/ })).toBeEnabled());
    const first = JSON.parse(String(request.mock.calls.find(([path]) => path.endsWith('/apply'))?.[1]?.body));
    for (const option of first.options) for (const key of ['pricingDays', 'timezone', 'pricingSlotCodes', 'ratePeriods']) expect(option).not.toHaveProperty(key);
    expect(first.options[0].travellerPrices).toEqual([{ travellerType: 'ADULT', amount: '950' }]);
    expect(first.options[1]).not.toHaveProperty('travellerPrices');
    fireEvent.change(screen.getByRole('combobox', { name: 'Pricing day preset' }), { target: { value: 'WEEKENDS' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/apply'))).toHaveLength(2));
    const second = JSON.parse(String(request.mock.calls.filter(([path]) => path.endsWith('/apply')).at(-1)?.[1]?.body));
    for (const option of second.options) expect(option.pricingDays).toEqual(['SAT', 'SUN']);
  });

  it('shows earlier-period values on date selection and sends only the price actually edited', async () => {
    const response: any = structuredClone(saved); response.options = [response.options[0]];
    const plan = response.options[0].ratePlans[0], old = plan.versions[0];
    plan.versions = [
      { ...old, versionNumber: 2, effectiveFrom: '2026-12-01', effectiveTo: '2027-01-01', travellerPrices: [{ travellerType: 'ADULT', amount: '1800' }, { travellerType: 'CHILD', amount: '900' }, { travellerType: 'INFANT', amount: '0' }] },
      { ...old, versionNumber: 3, effectiveFrom: '2027-01-01', effectiveTo: '2027-03-01', travellerPrices: [{ travellerType: 'ADULT', amount: '1900' }, { travellerType: 'CHILD', amount: '950' }, { travellerType: 'INFANT', amount: '100' }] },
    ];
    const request = renderEditor(vi.fn(), response, [variants[0]]);
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(1900));
    fireEvent.click(screen.getByRole('button', { name: 'Selling starts' }));
    fireEvent.change(screen.getByLabelText('Selling starts year'), { target: { value: '2026' } });
    fireEvent.change(screen.getByLabelText('Selling starts month'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: '10' }));
    expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(1800);
    expect(screen.getByLabelText('Entry Only child price')).toHaveValue(900);
    fireEvent.change(screen.getByLabelText('Entry Only adult or base price'), { target: { value: '1950' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/products/p1/prices-availability/apply', expect.anything()));
    const body = JSON.parse(String(request.mock.calls.find(([path]) => path.endsWith('/apply'))?.[1]?.body));
    expect(body.options[0]).toMatchObject({ updateMode: 'PATCH', effectiveFrom: '2026-12-10', expectedVersion: 3, travellerPrices: [{ travellerType: 'ADULT', amount: '1950' }] });
    expect(body.options[0]).not.toHaveProperty('visitorPrices');
  });
});

describe('expanded live audit regressions', () => {
  it.each(['', '0', '1.5', '525601'])('blocks an invalid edited SLA (%s) rather than reporting success with the old value', async value => {
    const response: any = structuredClone(saved); response.options = [response.options[0]];
    Object.assign(response.options[0].ratePlans[0].versions[0], { bookingMode: 'MANUAL_ON_REQUEST', confirmationSlaMinutes: 60 });
    const onError = vi.fn(), request = vi.spyOn(api, 'request').mockImplementation(async path => path.endsWith('/prices-availability') ? response as never : { valid: true, errors: [] } as never);
    render(<EditorHarness onError={onError} editorVariants={[variants[0]]} section="policies" />);
    const sla = await screen.findByLabelText('Confirmation SLA (minutes)');
    fireEvent.change(sla, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('1 to 525600 whole minutes'));
    expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(false);
    fireEvent.change(sla, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(true));
    const option = JSON.parse(String(request.mock.calls.find(([path]) => path.endsWith('/apply'))?.[1]?.body)).options[0];
    expect(option.confirmationSlaMinutes).toBe(90); expect(option).not.toHaveProperty('cancellationRules');
  });

  it('locks all controls from draft saving through pricing readback, then saves the next edit', async () => {
    let releaseDraft!: (value: boolean) => void, releaseApply!: () => void, releaseRead!: () => void;
    const draftGate = new Promise<boolean>(resolve => { releaseDraft = resolve; });
    const applyGate = new Promise<void>(resolve => { releaseApply = resolve; });
    const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
    let applied = 0, persisted = '900', save!: () => Promise<boolean>;
    const onError = vi.fn(), onPricingSaved = vi.fn(), onSaveDraft = vi.fn(() => draftGate);
    const request = vi.spyOn(api, 'request').mockImplementation(async (path, init) => {
      if (path.endsWith('/preview')) return { valid: true, errors: [] } as never;
      if (path.endsWith('/apply')) {
        if (!applied) await applyGate;
        persisted = JSON.parse(String(init?.body)).options[0].travellerPrices[0].amount;
        applied++;
        return { saved: [{ variantId: 'v1', commercialVersionId: 'own-' + applied }] } as never;
      }
      if (path.endsWith('/prices-availability')) {
        if (applied === 1) await readGate;
        const response: any = structuredClone(saved); response.options = [response.options[0]];
        Object.assign(response.options[0].ratePlans[0].versions[0], { id: 'own-' + applied, versionNumber: 1 + applied, travellerPrices: [{ travellerType: 'ADULT', amount: persisted }] });
        return response as never;
      }
      return {} as never;
    });
    render(<ActivityPricesAvailability snapshot={{ product: { id: 'p1' } as any, revision: null, variants: [variants[0]], schedules: [] }}
      locked={false} revisionForm={{ ...emptyRevisionForm }} fulfilment={{ ...emptyFulfilmentForm }}
      onSaveDraft={onSaveDraft} onRevisionChange={vi.fn()} onFulfilmentChange={vi.fn()} onRefresh={async () => undefined}
      onError={onError} onPricingSaved={onPricingSaved} onRegisterPricingSave={handler => { if (handler) save = handler; }} />);
    const input = await screen.findByLabelText('Entry Only adult or base price');
    await waitFor(() => expect(input).toHaveValue(900));
    fireEvent.change(input, { target: { value: '1951' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    expect(input).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Prices, availability and policies' })).toHaveAttribute('aria-busy', 'true');
    expect(await save()).toBe(false);
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    await act(async () => releaseDraft(true));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(true));
    expect(input).toBeDisabled(); expect(onPricingSaved).not.toHaveBeenCalled();
    await act(async () => releaseApply());
    await waitFor(() => expect(applied).toBe(1));
    expect(input).toBeDisabled(); expect(onPricingSaved).not.toHaveBeenCalled();
    await act(async () => releaseRead());
    await waitFor(() => expect(input).toBeEnabled());
    expect(onPricingSaved).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: '1952' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(onPricingSaved).toHaveBeenCalledTimes(2));
    expect(persisted).toBe('1952'); expect(onError).not.toHaveBeenCalled();
  });

  it('unlocks after a rejected save and retains the edited fields for retry', async () => {
    let fail = true;
    const onError = vi.fn(), request = renderEditor(onError, { options: [saved.options[0]] }, [variants[0]]);
    request.mockImplementation(async path => {
      if (path.endsWith('/prices-availability')) return { options: [saved.options[0]] } as never;
      if (path.endsWith('/preview')) return { valid: true, errors: [] } as never;
      if (path.endsWith('/apply') && fail) throw new Error('Staging save interruption');
      return {} as never;
    });
    const input = await screen.findByLabelText('Entry Only adult or base price');
    await waitFor(() => expect(input).toHaveValue(900));
    fireEvent.change(input, { target: { value: '1952' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Staging save interruption'));
    expect(input).toBeEnabled(); fail = false;
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path.endsWith('/apply'))).toHaveLength(2));
    expect(JSON.parse(String(request.mock.calls.filter(([path]) => path.endsWith('/apply'))[1][1]?.body)).options[0].travellerPrices).toEqual([{ travellerType: 'ADULT', amount: '1952' }]);
  });

  it.each(['mode', 'sla', 'cancellation'])('sends only the %s policy control actually edited', async field => {
    const response: any = structuredClone(saved); response.options = response.options.slice(0, 2);
    response.options.forEach((option: any, index: number) => Object.assign(option.ratePlans[0].versions[0], { bookingMode: 'MANUAL_ON_REQUEST', confirmationSlaMinutes: index ? 120 : 60 }));
    const request = vi.spyOn(api, 'request').mockImplementation(async path => path.endsWith('/prices-availability') ? response as never : { valid: true, errors: [] } as never);
    render(<EditorHarness onError={vi.fn()} editorVariants={variants.slice(0, 2)} section="policies" />);
    await screen.findByText(/Mixed booking policies:/);
    if (field === 'mode') fireEvent.change(screen.getByLabelText('Confirmation method'), { target: { value: 'VENDOR_CONFIRMATION' } });
    if (field === 'sla') fireEvent.change(screen.getByLabelText('Confirmation SLA (minutes)'), { target: { value: '90' } });
    if (field === 'cancellation') fireEvent.click(screen.getByRole('button', { name: 'Non-refundable' }));
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(true));
    const body = JSON.parse(String(request.mock.calls.find(([path]) => path.endsWith('/apply'))?.[1]?.body));
    for (const option of body.options) {
      expect(option).toHaveProperty(field === 'mode' ? 'bookingMode' : field === 'sla' ? 'confirmationSlaMinutes' : 'cancellationRules');
      for (const key of ['bookingMode', 'confirmationSlaMinutes', 'cancellationRules'].filter(key => key !== (field === 'mode' ? 'bookingMode' : field === 'sla' ? 'confirmationSlaMinutes' : 'cancellationRules'))) expect(option).not.toHaveProperty(key);
    }
  });

  it('blocks clearing an existing child price with inline guidance and accepts zero instead', async () => {
    const response: any = structuredClone(saved); response.options = [response.options[0]];
    response.options[0].ratePlans[0].versions[0].travellerPrices.push({ travellerType: 'CHILD', amount: '450' });
    const onError = vi.fn(), request = renderEditor(onError, response, [variants[0]]);
    const child = await screen.findByLabelText('Entry Only child price');
    await waitFor(() => expect(child).toHaveValue(450));
    fireEvent.change(child, { target: { value: '' } });
    expect(child).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('enter 0 for free admission'));
    expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(false);
    fireEvent.change(child, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(true));
    expect(JSON.parse(String(request.mock.calls.find(([path]) => path.endsWith('/apply'))?.[1]?.body)).options[0]).toMatchObject({ travellerPrices: [{ travellerType: 'CHILD', amount: '0' }] });
  });

  it('ignores validation errors in unselected options while still blocking invalid selected options', async () => {
    const onError = vi.fn(), request = renderEditor(onError);
    await waitFor(() => expect(screen.getByLabelText('Private Jeep Safari adult or base price')).toHaveValue(3500));
    fireEvent.change(screen.getByLabelText('Private Jeep Safari adult or base price'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Private Jeep Safari'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Private Jeep Safari' }));
    expect(screen.getByLabelText('Private Jeep Safari adult or base price')).toHaveAttribute('aria-invalid', 'false');
    fireEvent.change(screen.getByLabelText('Entry Only adult or base price'), { target: { value: '950' } });
    fireEvent.click(screen.getByRole('button', { name: /Save (all prices|changes)/ }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path.endsWith('/apply'))).toBe(true));
    const body = JSON.parse(String(request.mock.calls.find(([path]) => path.endsWith('/apply'))?.[1]?.body));
    expect(body.options.map((option: any) => option.variantId)).toEqual(['v1', 'v2']);
  });

  it('formats mixed-currency sell, commission, net, MRP and seasonal previews using each offer currency', async () => {
    const response: any = structuredClone(saved); response.options = response.options.slice(0, 2);
    response.options.forEach((option: any) => Object.assign(option.ratePlans[0].versions[0], { supplierCommissionPercent: '10', sourcePayload: { mrpMode: 'YES', mrpAmount: '2000', ratePeriods: [{ name: 'Peak', from: '2026-11-01', to: '2026-12-01', days: 'ALL', adjustmentType: 'FLAT', adjustmentValue: '100' }] } }));
    renderEditor(vi.fn(), response, variants.slice(0, 2));
    await waitFor(() => expect(screen.getByLabelText('Entry Only adult or base price')).toHaveValue(900));
    const rows = Array.from(document.querySelectorAll('.prototype-rate-breakdown-row'));
    expect(rows[0].textContent).toContain('$900.00'); expect(rows[0].textContent).toContain('$90.00'); expect(rows[0].textContent).toContain('$810.00'); expect(rows[0].textContent).toContain('$2000.00'); expect(rows[0].textContent).not.toContain('₹');
    expect(rows[1].textContent).toContain('₹1200.00'); expect(rows[1].textContent).toContain('₹120.00');
    const seasonal = Array.from(document.querySelectorAll('.prototype-rate-period-preview')).map(element => element.textContent);
    expect(seasonal).toEqual(expect.arrayContaining([expect.stringContaining('$1000.00'), expect.stringContaining('₹1300.00')]));
    expect(within(document.querySelector('.prototype-final-price-preview') as HTMLElement).getByText(/\$900.00/)).toBeInTheDocument();
  });
});
