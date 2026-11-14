import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminSettlements from './AdminSettlements';
afterEach(() => vi.restoreAllMocks());
describe('Finance refund evidence', () => {
  it('resolves vendor liability even after the customer refund has been recorded', async () => {
    let vendorResolved = false;
    const openReview = vi.fn();
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path.endsWith('/vendor-settlement-resolution')) { vendorResolved = true; return {} as never; }
      if (path === '/admin/cancellations') return [{ cancellationId: 'cancel-1', bookingCode: 'VY-1', publicCode: 'AG-26110005', bookingAmount: '2520', vendorPayable: '2400', currency: 'INR', refundEntitlement: '2520', financialState: 'REFUNDED', vendorSettlementResolved: vendorResolved }] as never;
      if (path === '/admin/finance/configuration') return { paymentCollectionMode: 'UNCONFIGURED', baseCurrency: 'INR' } as never;
      return [] as never;
    });
    render(<AdminSettlements onOpenRefunds={openReview} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve Vendor liability' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Resolve vendor liability' }));
    expect(dialog.getByText(/2,400.00/)).toBeInTheDocument();
    expect(dialog.getByText('AG-26110005')).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('Final Vendor payable'), { target: { value: '0' } });
    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: 'Service not delivered' } });
    fireEvent.change(dialog.getByLabelText('Reference'), { target: { value: 'LOCAL-VENDOR-RESOLUTION' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Resolve Vendor liability' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/cancellations/cancel-1/vendor-settlement-resolution', expect.objectContaining({ body: JSON.stringify({ finalVendorPayable: '0', reason: 'Service not delivered', reference: 'LOCAL-VENDOR-RESOLUTION' }) })));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resolve Vendor liability' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Refunds 0/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Customer cancellation review' }));
    expect(openReview).toHaveBeenCalledTimes(1);
  });

  it('records a partial refund using a required reference and preserves its amount', async () => {
    let confirmed = false;
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/refunds/refund-1/confirm') { confirmed = true; return {} as never; }
      if (path === '/admin/refunds') return [{ id: 'refund-1', amount: '1260', currency: 'INR', status: confirmed ? 'CONFIRMED' : 'PENDING', externalReference: confirmed ? 'LOCAL-PARTIAL' : null, booking: { bookingCode: 'VY-1', publicCode: 'AG-26110004', customerName: 'Rohan Shah' }, cancellation: { reason: 'Guest request' } }] as never;
      if (path === '/admin/finance/configuration') return { paymentCollectionMode: 'UNCONFIGURED', baseCurrency: 'INR' } as never;
      return [] as never;
    });
    render(<AdminSettlements />);
    fireEvent.click(await screen.findByRole('button', { name: /Refunds 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Record completion' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Record refund completion' }));
    expect(dialog.getByText(/1,260.00/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Record completion' })).toBeDisabled();
    expect(dialog.getByText(/does not transfer funds/)).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('External reference'), { target: { value: 'LOCAL-PARTIAL' } });
    fireEvent.change(dialog.getByLabelText('Optional note'), { target: { value: 'Simulated partial refund; no funds transferred.' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Record completion' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(request).toHaveBeenCalledWith('/admin/refunds/refund-1/confirm', { method: 'POST', body: JSON.stringify({ externalReference: 'LOCAL-PARTIAL', note: 'Simulated partial refund; no funds transferred.' }) });
    expect(screen.getByText('LOCAL-PARTIAL')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
  });
});
