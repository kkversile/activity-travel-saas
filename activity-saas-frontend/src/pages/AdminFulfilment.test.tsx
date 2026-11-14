import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminFulfilment from './AdminFulfilment';

afterEach(() => vi.restoreAllMocks());
const ready = { id: 'fulfilment-1', bookingId: 'booking-1', bookingCode: 'BOOKING-1', mode: 'AUTO', status: 'VOUCHER_READY', generationStatus: 'SUCCEEDED', readiness: { ready: true }, booking: { status: 'CONFIRMED' } };

it('queues regeneration through the existing versioned workflow and excludes cancelled bookings', async () => {
  let requested = false;
  const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
    if (path === '/admin/fulfilment/booking-1/voucher/retry') { requested = true; return {} as never; }
    return [{ ...ready, ...(requested ? { generationStatus: 'PENDING' } : {}) }, { ...ready, id: 'cancelled', bookingId: 'booking-2', bookingCode: 'CANCELLED-BOOKING', booking: { status: 'CANCELLED' } }] as never;
  });
  render(<AdminFulfilment />);
  const button = await screen.findByRole('button', { name: 'Regenerate voucher' });
  expect(screen.getAllByRole('button', { name: 'Regenerate voucher' })).toHaveLength(1);
  expect(within(screen.getByRole('row', { name: /CANCELLED-BOOKING/ })).queryByRole('button')).not.toBeInTheDocument();
  fireEvent.click(button);
  await screen.findByRole('status');
  await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/fulfilment/booking-1/voucher/retry', { method: 'POST' }));
  expect(screen.queryByRole('button', { name: 'Regenerate voucher' })).not.toBeInTheDocument();
  expect(screen.getByText(/current voucher remains valid/)).toBeInTheDocument();
});

it('keeps a rejected regeneration visible without pretending the voucher was regenerated', async () => {
  vi.spyOn(api, 'request').mockImplementation(async (path) => {
    if (path.includes('/voucher/retry')) throw new Error('Booking is no longer confirmed');
    return [ready] as never;
  });
  render(<AdminFulfilment />);
  fireEvent.click(await screen.findByRole('button', { name: 'Regenerate voucher' }));
  expect(await screen.findByText('Booking is no longer confirmed')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
