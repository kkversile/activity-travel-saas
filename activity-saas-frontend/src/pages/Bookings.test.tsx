import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import Bookings from './Bookings';

afterEach(() => vi.restoreAllMocks());

describe('vendor bookings prototype parity', () => {
  it('does not imply a zero refund when vendor cancellation needs a finance decision', async () => {
    const row = { id: 'supplier-cancel', bookingCode: 'VY-1', recordType: 'CANONICAL', status: 'CONFIRMED', serviceDate: '2026-11-22', currency: 'INR', travellers: [], timeline: [], economics: { vendorPayable: '2400' } };
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.includes('/page?')) return { items: [row], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } as never;
      if (path.endsWith('/preview')) return { eligible: true, financialState: 'CANCELLED_PENDING_FINANCIAL' } as never;
      return {} as never;
    });
    render(<Bookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel service' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Cancel service' }));
    expect(dialog.getByRole('status')).toHaveTextContent('No refund amount has been decided yet');
    expect(dialog.queryByText(/Estimated refund/)).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText('Supplier cancellation reason'), { target: { value: 'Unsafe weather' } });
    fireEvent.change(dialog.getByLabelText('Reason category'), { target: { value: 'WEATHER' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm cancellation' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/bookings/supplier-cancel/cancellation', expect.objectContaining({ body: JSON.stringify({ reason: 'Unsafe weather', reasonCategory: 'WEATHER' }) })));
  });

  it('does not present the original payable as a current payout after cancellation', async () => {
    const row = { id: 'cancelled-1', bookingCode: 'BK-CANCELLED', status: 'CANCELLED', serviceDate: '2026-11-20', currency: 'INR', travellers: [], timeline: [], economics: { vendorPayable: '2400' }, cancellation: { reason: 'Guest request', cancellationCharge: '0', refundEntitlement: '2520', financialState: 'REFUNDED', refund: { status: 'CONFIRMED' } } };
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.includes('/page?')) return { items: [row], pagination: { page: 1, totalPages: 1, total: 1, limit: 25 } } as never;
      return row as never;
    });
    render(<Bookings />);
    const table = await screen.findByRole('table');
    expect(within(table).queryByText(/2,400/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Original vendor amount:')).toBeInTheDocument();
    expect(dialog.getByRole('status')).toHaveTextContent('REFUNDED');
    expect(dialog.getByText(/Cancellation settlement is handled separately/)).toBeInTheDocument();
  });

  it('shows the prototype booking columns using the canonical booking projection', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith('/vendor/bookings/page?')) return { items: [{
        id: 'booking-1', bookingCode: 'BK-1', publicCode: 'TA-BK-1', recordType: 'CANONICAL', status: 'CONFIRMED',
        serviceDate: '2026-11-14T00:00:00.000Z', customerName: 'Sophie Fernandes', customerEmail: 'sophie@example.com', currency: 'INR',
        snapshot: { productSnapshot: { productName: 'Sunset boat tour' }, variantSnapshot: { name: 'Private boat' }, travellerSummary: {} },
        travellers: [{ isLead: true, fullName: 'Sophie Fernandes', quantity: 2 }, { quantity: 1 }],
        timeline: [], agent: { id: 'agent-1', name: 'Coastal Travel' }, economics: { netVendorPayable: '2450.00', currency: 'INR' },
      }], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<Bookings />);
    expect(await screen.findByRole('heading', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.getByText('Every booking for your products. Accept on-request bookings before the timer runs out.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveAttribute('title', 'Download the current booking results as CSV');
    const table = await screen.findByRole('table');
    for (const column of ['Booking', 'Activity date', 'Product · option', 'Lead guest', 'Guests', 'You receive', 'Status']) {
      expect(within(table).getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    const row = within(table).getByRole('row', { name: /TA-BK-1/ });
    expect(within(row).getByText('Sophie Fernandes')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText('₹2,450.00')).toBeInTheDocument();
    expect(within(row).getByText('Private boat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redeemed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelled' })).toBeInTheDocument();
  });

  it('collects a rejection reason in the page dialog and persists it through the booking API', async () => {
    const booking = {
      id: 'booking-pending', bookingCode: 'BK-PENDING', publicCode: 'TA-BK-PENDING', recordType: 'CANONICAL', status: 'PENDING_VENDOR_CONFIRMATION',
      serviceDate: '2026-11-14T00:00:00.000Z', currency: 'INR', snapshot: { productSnapshot: { productName: 'Sunset boat tour' }, variantSnapshot: { name: 'Private boat' }, travellerSummary: {} },
      travellers: [], timeline: [], economics: { netVendorPayable: '2450.00', currency: 'INR' },
    };
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith('/vendor/bookings/page?')) return { items: [booking], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } as never;
      if (path === '/vendor/bookings/booking-pending/reject') return {} as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<Bookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject booking' });
    fireEvent.change(within(dialog).getByLabelText('Rejection reason'), { target: { value: 'Unsafe sea conditions' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject booking' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/bookings/booking-pending/reject', expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Unsafe sea conditions' }) })));
  });

  it('loads the next server page and applies queue filters on the API request', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path.startsWith('/vendor/bookings/page?')) return { items: [], pagination: { page: Number(new URLSearchParams(path.split('?')[1]).get('page')), limit: 25, total: 30, totalPages: 2 } } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<Bookings />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/bookings/page?page=2&limit=25'));
    fireEvent.click(screen.getByRole('button', { name: /^Confirmed$/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/vendor/bookings/page?page=1&limit=25&status=CONFIRMED'));
    expect(screen.getByText('Page 1 of 2 · 30 results')).toBeInTheDocument();
  });
});
