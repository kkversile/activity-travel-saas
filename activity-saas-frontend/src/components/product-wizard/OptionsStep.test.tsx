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
