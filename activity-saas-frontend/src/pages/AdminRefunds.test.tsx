import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminRefunds from './AdminRefunds';

afterEach(() => vi.restoreAllMocks());
describe('Admin refund queues', () => {
  it('rejects a mismatched resolution total and accepts exact fractional currency amounts', async () => {
    let resolved = false;
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path.endsWith('/resolve-financial')) { resolved = true; return {} as never; }
      if (path.startsWith('/admin/cancellations')) return (resolved ? [] : [{ cancellationId: 'cancel-1', bookingCode: 'VY-1', publicCode: 'AG-26110005', initiator: 'VENDOR', reason: 'Supplier cancelled', reasonCategory: 'WEATHER', bookingAmount: '0.30', currency: 'INR', cancellationCharge: '0', refundEntitlement: '0', financialState: 'CANCELLED_PENDING_FINANCIAL' }]) as never;
      return [] as never;
    });
    render(<AdminRefunds />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve financial' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('AG-26110005')).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('Cancellation charge'), { target: { value: '0.09' } });
    fireEvent.change(dialog.getByLabelText('Refund entitlement'), { target: { value: '0.20' } });
    fireEvent.change(dialog.getByLabelText('Resolution reason'), { target: { value: 'Reviewed supplier cancellation' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save financial resolution' }));
    expect(await dialog.findByText('Cancellation charge plus refund entitlement must equal the booking amount.')).toBeInTheDocument();
    expect(request.mock.calls.some(([path]) => path.endsWith('/resolve-financial'))).toBe(false);
    fireEvent.change(dialog.getByLabelText('Cancellation charge'), { target: { value: '0.10' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save financial resolution' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/cancellations/cancel-1/resolve-financial', expect.objectContaining({ body: JSON.stringify({ cancellationCharge: '0.10', refundEntitlement: '0.20', reason: 'Reviewed supplier cancellation' }) })));
    await screen.findByText('Financial resolution recorded. Refunds and vendor settlement are reviewed separately.');
  });

  it('records failure, retries and records completion with a required reference', async () => {
    let status = 'PENDING';
    let reference = '';
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith('/fail')) status = 'FAILED';
      if (path.endsWith('/retry')) status = 'PENDING';
      if (path.endsWith('/confirm')) { status = 'CONFIRMED'; reference = JSON.parse(options?.body as string).externalReference; }
      if (path.startsWith('/admin/cancellations')) return [] as never;
      if (path === '/admin/refunds') return [{ id: 'refund-1', amount: '2520', currency: 'INR', status, externalReference: reference, failureReason: status === 'FAILED' ? 'Simulated failure' : null, booking: { bookingCode: 'VY-INTERNAL', publicCode: 'AG-26110002', customerName: 'Arjun Menon' }, cancellation: { id: 'cancel-1', financialState: 'REFUND_PENDING', reason: 'Guest request' } }] as never;
      return {} as never;
    });
    render(<AdminRefunds />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pending refunds' }));
    expect(screen.getByText('AG-26110002')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark failed' }));
    expect(screen.getByRole('button', { name: 'Record failure' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Failure reason'), { target: { value: 'Simulated failure' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record failure' }));
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Failed refunds' }));
    expect(screen.getByText('Simulated failure')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Refund returned to Pending refunds.');
    fireEvent.click(screen.getByRole('button', { name: 'Pending refunds' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record refund completion' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('button', { name: 'Record completion' })).toBeDisabled();
    expect(dialog.getByText(/does not transfer funds/)).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('External reference'), { target: { value: 'LOCAL-DEMO-REF' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Record completion' }));
    await screen.findByText('Refund completion recorded.');
    fireEvent.click(screen.getByRole('button', { name: /^Refunded$/ }));
    await waitFor(() => expect(screen.getByText('LOCAL-DEMO-REF')).toBeInTheDocument());
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/refunds/refund-1/confirm', expect.objectContaining({ method: 'POST' }));
  });
});
