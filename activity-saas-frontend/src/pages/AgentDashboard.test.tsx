import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AgentBooking, type User } from '../api';
import AgentDashboard, { summarizeAgentBookings } from './AgentDashboard';

const user = { email: 'agent@example.test', fullName: 'Maya Travel', role: 'TRAVEL_AGENT', tenantId: 'agency-1' } as User;

function booking(status: string, serviceDate: string, id: string): AgentBooking {
  return {
    id, bookingCode: `VOYA-${id}`, recordType: 'CANONICAL', status,
    serviceDate, customerName: 'Guest', travellers: [], timeline: [],
  } as AgentBooking;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Agent Overview dashboard', () => {
  it('counts only genuine booking statuses and excludes cancelled upcoming services', () => {
    const rows = [
      booking('CONFIRMED', '2099-04-10', 'a'),
      booking('PENDING_VENDOR_CONFIRMATION', '2099-04-11', 'b'),
      booking('CANCELLED', '2099-04-13', 'c'),
      booking('CONFIRMED', '2000-01-01', 'd'),
    ];
    expect(summarizeAgentBookings(rows, '2099-04-01')).toEqual({
      total: 4, upcoming: 2, confirmed: 2, awaiting: 1,
    });
  });

  it('loads the existing agent booking endpoint and displays accurate totals', async () => {
    const rows = [
      booking('CONFIRMED', '2099-04-10', 'a'),
      booking('PENDING_MANUAL_REVIEW', '2099-04-12', 'b'),
    ];
    const request = vi.spyOn(api, 'request').mockResolvedValue(rows);
    render(<AgentDashboard user={user} canBook onExplore={vi.fn()} onViewBookings={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Total bookings').textContent).toBe('2'));
    expect(request).toHaveBeenCalledWith('/agent/bookings');
    expect(screen.getByText(/Good to see you,/)).toBeDefined();
    expect(screen.getByText('VOYA-a')).toBeDefined();
  });

  it('shows an error instead of invented counts when fetching bookings fails', async () => {
    vi.spyOn(api, 'request').mockRejectedValue(new Error('Unable to reach the API'));
    render(<AgentDashboard user={user} canBook={false} onExplore={vi.fn()} onViewBookings={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the API');
    expect(screen.getByLabelText('Total bookings').textContent).toBe('—');
  });

  it('passes destination, date and traveller counts to the existing Marketplace workflow', async () => {
    vi.spyOn(api, 'request').mockResolvedValue([]);
    const onExplore = vi.fn();
    render(<AgentDashboard user={user} canBook onExplore={onExplore} onViewBookings={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('City or state (optional)'), { target: { value: 'Kochi' } });
    fireEvent.change(screen.getByLabelText('Service date'), { target: { value: '2099-06-12' } });
    fireEvent.change(screen.getByLabelText('Adults'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Children'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Find experiences/i }));
    await waitFor(() => expect(onExplore).toHaveBeenCalledTimes(1));
    expect(onExplore).toHaveBeenCalledWith(expect.objectContaining({
      destination: 'Kochi',
      serviceDate: '2099-06-12',
      travellers: [
        { travellerType: 'ADULT', quantity: 3 },
        { travellerType: 'CHILD', quantity: 1 },
      ],
    }));
  });
});
