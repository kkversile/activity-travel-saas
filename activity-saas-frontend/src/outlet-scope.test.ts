import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => { api.setToken(null); vi.unstubAllGlobals(); });

describe('vendor API outlet scope', () => {
  function setup() { const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }); vi.stubGlobal('fetch', fetch); api.setToken('local-token'); api.setActiveOutletId('outlet-a'); return fetch; }
  it('carries selection to vendor mutations and exports', async () => {
    const fetch = setup();
    await api.request('/inventory/bulk/preview', { method: 'POST', body: JSON.stringify({ proposal: {} }) });
    expect(fetch.mock.calls[0][0]).toContain('/inventory/bulk/preview?outletId=outlet-a');
  });
  it('does not attach vendor scope to admin, agent, auth or unrelated endpoints', async () => {
    const fetch = setup();
    for (const path of ['/admin/settlements', '/agent/bookings', '/auth/me', '/vendor/admin/bank-accounts/pending', '/public/theme']) await api.request(path);
    for (const [url] of fetch.mock.calls) expect(url).not.toContain('outletId=');
  });
  it('resets the selected outlet whenever account credentials change', async () => {
    const fetch = setup(); api.setToken('second-account-token'); await api.request('/vendor/bookings');
    expect(fetch.mock.calls[0][0]).not.toContain('outletId=');
  });
  it('preserves explicit request scope without adding duplicate parameters', async () => {
    const fetch = setup(); await api.request('/vendor/bookings?outletId=outlet-b');
    expect(fetch.mock.calls[0][0]).toContain('outletId=outlet-b'); expect(fetch.mock.calls[0][0]).not.toContain('outlet-a');
  });
});
