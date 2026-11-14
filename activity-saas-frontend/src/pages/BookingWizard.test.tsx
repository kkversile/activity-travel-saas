import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import BookingWizard from './BookingWizard';

afterEach(() => vi.restoreAllMocks());
describe('Booking confirmation references', () => {
  it.each([['AG-26110012', 'AG-26110012'], [null, 'VY-INTERNAL']])('shows the public booking reference when available (%s)', async (publicCode, displayed) => {
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => (path.endsWith('/preview') ? { eligible: true, price: { finalAmount: 2000, currency: 'INR' }, cancellationPolicy: [], quoteFingerprint: 'quote', cancellationPolicyFingerprint: 'policy', contextFingerprint: 'context' } : { status: 'CONFIRMED', bookingCode: 'VY-INTERNAL', publicCode }) as never);
    render(<BookingWizard product={{ name: 'Madurai Heritage Walk' }} offer={{ ratePlanId: 'plan', sessionId: 'session', price: { finalAmount: 2000 } }} context={{ serviceDate: '2026-11-15', travellers: [{ travellerType: 'ADULT', quantity: 1 }] }} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview current price & policy' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'I have reviewed and accept the cancellation policy.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create booking' }));
    expect(await screen.findByRole('heading', { name: displayed })).toBeInTheDocument();
    if (publicCode) expect(screen.queryByRole('heading', { name: 'VY-INTERNAL' })).not.toBeInTheDocument();
  });
});
