import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AgentBooking } from '../api';
import AgentBookings from './AgentBookings';

const booking: AgentBooking = {
  id: 'booking-1', bookingCode: 'VY-BOOKING', publicCode: 'AG-26110012', recordType: 'CANONICAL', status: 'CONFIRMED',
  bookingMode: 'INSTANT', serviceDate: '2026-11-20', customerName: 'Arjun Menon',
  amount: 2520, currency: 'INR', travellers: [{ fullName: 'Arjun Menon', travellerType: 'ADULT' }],
  snapshot: { productSnapshot: { productName: 'Madurai Heritage Walk' }, variantSnapshot: { name: 'Shared walk' }, ratePlanSnapshot: {}, sessionSnapshot: {}, travellerSummary: {}, cancellationPolicySnapshot: [], questionsSnapshot: [], agentSnapshot: { tenantId: 'agent-1', tenantName: 'Travel Agency', userId: 'user-1' } },
  timeline: [{ eventType: 'BOOKING_CREATED', createdAt: '2026-11-14T12:00:00Z' }],
};
const cancellation = { id: 'cancel-1', initiator: 'AGENT', reasonCategory: 'CUSTOMER_REQUEST', reason: 'Guests cannot travel', cancellationCharge: '0', refundEntitlement: '2520', financialState: 'REFUND_PENDING', refund: { id: 'refund-1', amount: '2520', currency: 'INR', status: 'PENDING' } };
afterEach(() => vi.restoreAllMocks());

describe('Agent cancellation and refund details', () => {
  it.each([
    ['50 percent refund', '1260', '1260', 'REFUND_PENDING'],
    ['no refund', '2520', '0', 'CANCELLED_NO_REFUND'],
  ])('shows the full outcome before confirming %s', async (_scenario, charge, refund, financialState) => {
    let cancelled = false;
    const refundRecord = refund === '0' ? null : { ...cancellation.refund, amount: refund };
    const outcome = { ...cancellation, cancellationCharge: charge, refundEntitlement: refund, financialState, refund: refundRecord };
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path.endsWith('/cancellation/preview')) return { eligible: true, bookingAmount: '2520', cancellationCharge: charge, refundEntitlement: refund, financialState, currency: 'INR', cancellationFingerprint: 'booked-terms' } as never;
      if (path.endsWith('/cancellation')) { cancelled = true; return { id: booking.id, status: 'CANCELLED', cancellation: outcome, financialState, refund: refundRecord } as never; }
      if (path.endsWith('/voucher')) return { currentVoucher: null } as never;
      const detail = cancelled ? { ...booking, status: 'CANCELLED', cancellation: outcome } : booking;
      return (path.includes('?') ? [detail] : detail) as never;
    });
    render(<AgentBookings canBook />);
    expect(await screen.findByText('AG-26110012')).toBeInTheDocument();
    expect(screen.queryByText('VY-BOOKING')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /^Cancel$/ }));
    const dialog = within(await screen.findByRole('dialog'));
    await dialog.findByText(/Expected refund/);
    expect(dialog.getByText(/Booking amount:/)).toHaveTextContent('2,520.00');
    expect(dialog.getByText(/Cancellation charge:/)).toHaveTextContent(charge === '2520' ? '2,520.00' : '1,260.00');
    expect(dialog.getByText(/Expected refund:/)).toHaveTextContent(refund === '0' ? '0.00' : '1,260.00');
    if (refund === '0') expect(dialog.getByText('No refund will be issued. The full booking amount is the cancellation charge.')).toHaveAttribute('role', 'status');
    fireEvent.change(dialog.getByLabelText('Reason', { exact: true }), { target: { value: 'Guests cannot travel' } });
    fireEvent.click(dialog.getByRole('checkbox'));
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm cancellation' }));
    await dialog.findByText('Cancellation recorded.');
    await waitFor(() => expect(dialog.getByRole('status')).toHaveTextContent(financialState.replaceAll('_', ' ')));
    if (refund === '0') expect(dialog.getByText('No refund is due under the booked cancellation policy.')).toBeInTheDocument();
    expect(request.mock.calls.filter(([path]) => path.endsWith('/cancellation'))).toHaveLength(1);
  });

  it('retains booking detail after a partial cancellation response and refreshes its timeline', async () => {
    let cancelled = false;
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path.includes('/cancellation/preview')) return { eligible: true, refundEntitlement: '2520', currency: 'INR', cancellationFingerprint: 'terms-1' } as never;
      if (path.endsWith('/cancellation')) { cancelled = true; return { id: booking.id, status: 'CANCELLED', cancellation, financialState: 'REFUND_PENDING', refund: cancellation.refund } as never; }
      const detail = cancelled ? { ...booking, status: 'CANCELLED', cancellation, timeline: [...booking.timeline, { eventType: 'AGENT_CANCELLED', createdAt: '2026-11-14T13:00:00Z' }] } : booking;
      if (path.includes('/voucher')) return { reason: cancelled ? 'CANCELLED' : 'PENDING', currentVoucher: null } as never;
      if (path.includes('?')) return [detail] as never;
      return detail as never;
    });
    render(<AgentBookings canBook />);
    fireEvent.click(await screen.findByRole('button', { name: /^Cancel$/ }));
    await screen.findByText(/Expected refund/);
    expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason', { exact: true }), { target: { value: 'Guests cannot travel' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await within(screen.getByRole('dialog')).findByText('Cancellation recorded.');
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('heading', { name: /Madurai Heritage Walk.*Shared walk/ })).toBeInTheDocument();
    expect(dialog.getByText(/Arjun Menon/)).toBeInTheDocument();
    expect(dialog.getByText('Voucher voided. This booking cannot be used for entry.')).toBeInTheDocument();
    await waitFor(() => expect(dialog.getByText('AGENT_CANCELLED')).toBeInTheDocument());
    expect(dialog.getByRole('status')).toHaveTextContent('REFUND PENDING');
    expect(screen.queryByRole('button', { name: 'Confirm cancellation' })).not.toBeInTheDocument();
  });

  it('fetches the latest refund status when opening an older booking row', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path.includes('?')) return [{ ...booking, status: 'CANCELLED', cancellation }] as never;
      if (path.includes('/voucher')) return { currentVoucher: null } as never;
      return { ...booking, status: 'CANCELLED', cancellation: { ...cancellation, financialState: 'REFUNDED', refund: { ...cancellation.refund, status: 'CONFIRMED' } } } as never;
    });
    render(<AgentBookings canBook />);
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('REFUNDED'));
    expect(screen.getByRole('status')).toHaveTextContent('CONFIRMED');
    expect(screen.queryByRole('button', { name: 'Download voucher' })).not.toBeInTheDocument();
  });
});
