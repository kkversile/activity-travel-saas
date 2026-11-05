import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminProductCreatePanel from './AdminProductCreatePanel';

vi.mock('../components/product-wizard/ExperienceWizardModal', () => ({ default: () => null }));

afterEach(() => vi.restoreAllMocks());

describe('Admin activity product margin rule', () => {
  it('opens with the vendor selected when launched from that vendor detail', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/vendors') return [{ id: 'vendor-1', name: 'Supplier One' }] as never;
      if (path === '/admin/products') return { productId: 'product-1' } as never;
      return {} as never;
    });
    render(<AdminProductCreatePanel onCreated={vi.fn()} initialVendorId="vendor-1" openOnLoad />);

    expect(await screen.findByRole('combobox', { name: 'Vendor' })).toHaveValue('vendor-1');
    fireEvent.change(screen.getByRole('textbox', { name: 'Activity name' }), { target: { value: 'Vendor activity' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'City' }), { target: { value: 'Goa' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'State / region' }), { target: { value: 'Goa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity and continue' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/products', expect.objectContaining({ method: 'POST' })));
    const createCall = request.mock.calls.find(([path]) => path === '/admin/products');
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ tenantId: 'vendor-1', productName: 'Vendor activity' });
  });

  it('creates a product-scoped pricing-rule draft after creating the activity', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/vendors') return [{ id: 'vendor-1', name: 'Supplier One' }] as never;
      if (path === '/admin/products') return { productId: 'product-1' } as never;
      if (path === '/admin/commercial-rules/with-initial-version') return { rule: { id: 'rule-1' }, version: { id: 'version-1', status: 'DRAFT' } } as never;
      return {} as never;
    });
    render(<AdminProductCreatePanel onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Create activity' }));

    const vendors = await screen.findAllByRole('combobox', { name: 'Vendor' });
    fireEvent.change(vendors[0], { target: { value: 'vendor-1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Activity name' }), { target: { value: 'Test kayak tour' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'City' }), { target: { value: 'Goa' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'State / region' }), { target: { value: 'Goa' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Margin override' }), { target: { value: 'CUSTOM_RULE' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Percent' }), { target: { value: '12.12345' } });
    expect(screen.getByRole('button', { name: 'Create activity and continue' })).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Percent' }), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity and continue' }));

    await screen.findByRole('status');
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/commercial-rules/with-initial-version', expect.objectContaining({ method: 'POST' })));
    const productCall = request.mock.calls.find(([path]) => path === '/admin/products');
    expect(JSON.parse(String(productCall?.[1]?.body))).toMatchObject({ marginOverride: 'CUSTOM_RULE' });
    expect(JSON.parse(String(productCall?.[1]?.body))).not.toHaveProperty('marginModel');
    const ruleWithVersionCall = request.mock.calls.find(([path]) => path === '/admin/commercial-rules/with-initial-version');
    expect(JSON.parse(String(ruleWithVersionCall?.[1]?.body))).toMatchObject({
      rule: { kind: 'VOYA_REVENUE', scopeType: 'PRODUCT', productId: 'product-1' },
      version: { config: { model: 'MARKUP_PERCENT', percent: '12.5' } },
    });
    expect(request.mock.invocationCallOrder[request.mock.calls.findIndex(([path]) => path === '/admin/products')]).toBeLessThan(
      request.mock.invocationCallOrder[request.mock.calls.findIndex(([path]) => path === '/admin/commercial-rules/with-initial-version')],
    );
  });
});
