import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from '../api';
import FulfilmentCentre from './FulfilmentCentre';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('vendor fulfilment manifest export', () => {
  it('downloads the CSV through the authenticated API client', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/fulfilment') return [] as never;
      if (path.startsWith('/vendor/manifest?serviceDate=')) return { sessions: [] } as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    const blobRequest = vi.spyOn(api, 'blob').mockResolvedValue(new Blob(['bookingCode\n']));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:manifest'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<FulfilmentCentre />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(blobRequest).toHaveBeenCalledWith(expect.stringMatching(/^\/vendor\/manifest\/export\.csv\?serviceDate=\d{4}-\d{2}-\d{2}$/)));
  });
});
