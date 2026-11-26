import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api';
import OptionsStep from './OptionsStep';
import { emptyFulfilmentForm, emptyRevisionForm } from './types';

afterEach(() => vi.restoreAllMocks());

function OptionsHarness({ onError }: { onError: (message: string) => void }) {
  const [variants, setVariants] = useState<any[]>([]);
  return <OptionsStep
    snapshot={{ product: { id: 'product-1' } as any, revision: null, variants, schedules: [] }}
    locked={false}
    revisionForm={{ ...emptyRevisionForm }}
    fulfilment={{ ...emptyFulfilmentForm }}
    onRevisionChange={() => undefined}
    onSaveDraft={async () => true}
    onFulfilmentChange={() => undefined}
    onRefresh={async () => setVariants([{ id: 'variant-1', variantCode: 'OPT-SHARED', name: 'Standard shared', version: 1, status: 'ACTIVE', ticketTypes: [], unitRows: [], ratePlans: [] }])}
    onError={onError}
  />;
}

describe('OptionsStep blueprint persistence recovery', () => {
  function showLegacy(plans: any[]) {
    const onError = vi.fn();
    render(<OptionsStep snapshot={{ product: { id: 'p1' } as any, revision: null, variants: [{ id: 'legacy', variantCode: 'SHARED', name: 'Legacy shared', version: 1, status: 'ACTIVE', ratePlans: plans } as any], schedules: [] }} locked={false} revisionForm={{ ...emptyRevisionForm }} fulfilment={{ ...emptyFulfilmentForm }} onRevisionChange={() => undefined} onSaveDraft={async () => true} onFulfilmentChange={() => undefined} onRefresh={async () => undefined} onError={onError} />);
    return onError;
  }
  it('shows inherited booking limits before any price save and in the edit form', () => {
    showLegacy([{ status: 'ACTIVE', minPax: 1, maxPax: 15, cutOffMinutes: 1440 }]);
    expect(screen.getByText('Booking: 1–15 travellers · cutoff 24 hours')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText(/Maximum travellers/)).toHaveValue(15);
    expect(screen.getByLabelText(/Booking cutoff \(hours\)/)).toHaveValue(24);
  });
  it('explains varying plans and preserves unset limits when editing only the name', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ version: 2, ticketTypes: [], unitRows: [] } as never);
    const onError = showLegacy([{ status: 'ACTIVE', minPax: 1, maxPax: 15, cutOffMinutes: 1440 }, { status: 'ACTIVE', minPax: 1, maxPax: 30, cutOffMinutes: 0 }]);
    expect(screen.getByText(/Booking limits vary by rate plan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText(/Maximum travellers/)).toHaveValue(null);
    fireEvent.change(screen.getByPlaceholderText('Standard shared'), { target: { value: 'Renamed shared' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save option' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path === '/variants/legacy')).toBe(true));
    const body = JSON.parse(String(request.mock.calls.find(([path]) => path === '/variants/legacy')?.[1]?.body));
    expect(body).not.toHaveProperty('maxPax'); expect(body).not.toHaveProperty('cutOffMinutes'); expect(onError).not.toHaveBeenCalled();
  });
  it.each([1, 30, 90])('preserves an inherited %s minute cutoff when saving the option name', async minutes => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ version: 2, ticketTypes: [], unitRows: [] } as never);
    const onError = showLegacy([{ status: 'ACTIVE', minPax: 1, maxPax: 15, cutOffMinutes: minutes }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText(/Booking cutoff \(hours\)/)).toHaveValue(minutes / 60);
    fireEvent.change(screen.getByPlaceholderText('Standard shared'), { target: { value: 'Renamed shared' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save option' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path === '/variants/legacy')).toBe(true));
    const body = JSON.parse(String(request.mock.calls.find(([path]) => path === '/variants/legacy')?.[1]?.body));
    expect(body.cutOffMinutes).toBe(minutes); expect(onError).not.toHaveBeenCalled();
  });
  it('rejects cutoff values finer than one minute before saving', () => {
    const request = vi.spyOn(api, 'request');
    const onError = showLegacy([{ status: 'ACTIVE', minPax: 1, maxPax: 15, cutOffMinutes: 30 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/Booking cutoff \(hours\)/), { target: { value: '0.001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save option' }));
    expect(onError).toHaveBeenCalledWith('Booking cutoff must be 0 hours or more, in whole-minute increments.');
    expect(request).not.toHaveBeenCalled();
  });
  it('retries a failed blueprint save against the created variant instead of creating a duplicate', async () => {
    const onError = vi.fn();
    const request = vi.spyOn(api, 'request')
      .mockResolvedValueOnce({ id: 'variant-1', variantCode: 'OPT-SHARED', name: 'Standard shared', version: 1 } as never)
      .mockRejectedValueOnce(new Error('Blueprint service temporarily unavailable'))
      .mockResolvedValueOnce({ id: 'variant-1', version: 2 } as never)
      .mockResolvedValueOnce({ ticketTypes: [{ id: 'ticket-1', name: 'Adult' }], unitRows: [] } as never);

    render(<OptionsHarness onError={onError} />);
    fireEvent.change(screen.getByPlaceholderText('OPT-SHARED'), { target: { value: 'OPT-SHARED' } });
    fireEvent.change(screen.getByPlaceholderText('Standard shared'), { target: { value: 'Standard shared' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Blueprint service temporarily unavailable'));
    expect(screen.getByText('Edit option')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save option' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add option' })).toBeInTheDocument());
    expect(request.mock.calls.filter(([path]) => path === '/products/product-1/variants')).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('/variants/variant-1', expect.objectContaining({ method: 'PATCH' }));
    expect(request.mock.calls.filter(([path]) => path === '/variants/variant-1/blueprint')).toHaveLength(2);
  });
});
