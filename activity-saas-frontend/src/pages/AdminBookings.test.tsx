import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminBookings, { adminBookingsCsv } from './AdminBookings';

afterEach(() => vi.restoreAllMocks());

const booking = {
  id: 'booking-1', bookingCode: 'VY-INT-1', publicCode: 'AG-26110001',
  recordType: 'CANONICAL', status: 'VENDOR_REJECTED', bookingMode: 'INSTANT',
  channel: 'VOYA_AGENT', serviceDate: '2026-11-04T00:00:00.000Z',
  customerName: 'Asha Rao', amount: 1000, currency: 'INR',
  snapshot: { productSnapshot: { productName: 'Harbour Kayak' } },
  vendorTenant: { name: 'Supplier One' }, timeline: [],
};

describe('Admin bookings search and channels', () => {
  it('exports the prototype booking columns including persisted Voya margin', () => {
    const csv = adminBookingsCsv([{
      ...booking,
      economicsSnapshot: { voyaRevenue: '125.00' },
      vendorTenant: { name: 'Supplier One' },
      currency: 'INR',
    } as any]);
    expect(csv.split('\n')[0]).toBe('"Booking","Channel","Activity","Vendor","Date","Customer paid","Our margin","Currency","Status"');
    expect(csv).toContain('"AG-26110001","Agents","Harbour Kayak","Supplier One"');
    expect(csv).toContain('"1000","125.00","INR","VENDOR_REJECTED"');
  });

  it('includes the API partner public ID and name in booking exports', () => {
    const csv = adminBookingsCsv([{
      ...booking,
      channel: 'TRAVEL_OTA_BLUE',
      snapshot: { ...booking.snapshot, channelSnapshot: { code: 'TRAVEL_OTA_BLUE', name: 'Blue Travel OTA', type: 'PARTNER_API', publicCode: 'APP-0003' } },
    } as any]);
    expect(csv).toContain('"AG-26110001","API · APP-0003 · Blue Travel OTA"');
  });

  it('sends search and channel filters to the paginated API and displays channel labels', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({
      items: [booking], pagination: { page: 1, limit: 25, total: 51, totalPages: 3 },
    } as never);
    render(<AdminBookings />);
    expect(await screen.findByRole('cell', { name: 'Agents' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Booking ID, voucher code, guest, phone'), { target: { value: 'Asha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('q=Asha') && String(path).includes('channelType=INTERNAL_MARKETPLACE') && String(path).includes('limit=25'))).toBe(true));
    expect(screen.getByText('Page 1 of 3 · 51 results')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Website & app' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('channelType=DIRECT'))).toBe(true));
  });

  it('filters every partner-specific API channel by channel type and shows its public partner ID', async () => {
    const apiBooking = {
      ...booking,
      channel: 'TRAVEL_OTA_BLUE',
      snapshot: { ...booking.snapshot, channelSnapshot: { id: 'channel-1', code: 'TRAVEL_OTA_BLUE', name: 'Blue Travel OTA', type: 'PARTNER_API', publicCode: 'APP-0003' } },
    };
    const request = vi.spyOn(api, 'request').mockResolvedValue({
      items: [apiBooking], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    } as never);
    render(<AdminBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'API' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('channelType=PARTNER_API'))).toBe(true));
    expect(screen.getByRole('cell', { name: /API/ })).toBeInTheDocument();
    expect(screen.getByText('APP-0003 · Blue Travel OTA')).toBeInTheDocument();
  });

  it('queries both rejection statuses and requests subsequent pages from the server', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({
      items: [booking], pagination: { page: 1, limit: 25, total: 51, totalPages: 3 },
    } as never);
    render(<AdminBookings />);
    await screen.findByText('Harbour Kayak');
    fireEvent.click(screen.getByRole('button', { name: 'Rejected' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('statusGroup=REJECTED'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('page=2'))).toBe(true));
  });

  it('uses the backend manual-confirm route for bookings awaiting Admin review', async () => {
    const pendingBooking = { ...booking, status: 'PENDING_MANUAL_REVIEW' };
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/bookings?')) return { items: [pendingBooking], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } as never;
      return pendingBooking as never;
    });
    render(<AdminBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manual confirm' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/admin/bookings/booking-1/manual-confirm', expect.objectContaining({ method: 'POST' })));
  });
});
