import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import Bookings from './Bookings';

afterEach(() => vi.restoreAllMocks());
const booking = { id: 'booking-1', bookingCode: 'VY-1', publicCode: 'AG-1', recordType: 'CANONICAL', status: 'REDEEMED', serviceDate: '2026-11-15', currency: 'INR', customerName: 'Sanjay Nair', travellers: [], timeline: [], snapshot: { productSnapshot: { productName: 'Sunrise Trek' }, sessionSnapshot: { endsAt: '2026-11-15T10:00:00Z' } } };

describe('Vendor completion workflow', () => {
  it('shows an early-completion error inside the dialog and allows a corrected retry', async () => {
    let ended = false, completed = false;
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path.endsWith('/complete')) { if (!ended) throw new Error('SERVICE_NOT_ENDED'); completed = true; return {} as never; }
      const row = { ...booking, status: completed ? 'COMPLETED' : 'REDEEMED' };
      return (path.includes('/page?') ? { items: [row], pagination: { page: 1, totalPages: 1, total: 1, limit: 25 } } : row) as never;
    });
    render(<Bookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete service' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Complete service' }));
    fireEvent.change(dialog.getByLabelText('Completion note (optional)'), { target: { value: 'Walk delivered' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm completion' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('The service has not ended yet.');
    expect(dialog.getByLabelText('Completion note (optional)')).toHaveValue('Walk delivered');
    ended = true;
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm completion' }));
    await screen.findByText('Booking completed.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete service' })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/vendor/manifest/bookings/booking-1/complete', expect.objectContaining({ body: JSON.stringify({ reason: 'Walk delivered' }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => path.includes('status=COMPLETED'))).toBe(true));
  });
  it('requires a reason if the booking has no scheduled end time', async () => {
    const row = { ...booking, snapshot: { ...booking.snapshot, sessionSnapshot: {} } };
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => (path.includes('/page?') ? { items: [row], pagination: { page: 1, totalPages: 1, total: 1, limit: 25 } } : row) as never);
    render(<Bookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete service' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Complete service' }));
    expect(dialog.getByRole('button', { name: 'Confirm completion' })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText('Completion reason (required)'), { target: { value: 'Service delivered' } });
    expect(dialog.getByRole('button', { name: 'Confirm completion' })).toBeEnabled();
  });
  it('does not offer completion for an unredeemed booking', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({ items: [{ ...booking, status: 'CONFIRMED' }], pagination: { page: 1, totalPages: 1, total: 1, limit: 25 } } as never);
    render(<Bookings />); await screen.findByText('AG-1');
    expect(screen.queryByRole('button', { name: 'Complete service' })).not.toBeInTheDocument();
  });
});
