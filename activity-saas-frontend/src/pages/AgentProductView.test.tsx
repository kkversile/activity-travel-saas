import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AgentProductView from './AgentProductView';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const context = { serviceDate: '2099-06-12', travellers: [{ travellerType: 'ADULT', quantity: 2 }] };
const product = {
  id: 'p1', name: 'Tea Estate Experience', type: 'ACTIVITY', subType: 'GUIDED_TOUR', subCategory: 'Nature & culture', starRating: '4.8',
  description: 'Walk through the lush tea estate.',
  highlights: ['Guided tea tasting'], terms: ['Carry valid ID'],
  thingsToCarry: ['Comfortable walking shoes'], safetyMeasures: ['Follow the guide'],
  howToRedeem: ['Show your voucher'], additionalInfo: ['Arrive early'],
  importantInfo: ['Weather dependent'],
  meetingPoint: 'Main estate entrance', address: 'Tea Estate Road', meetingModel: 'FIXED_MEETING_POINT',
  destination: { city: 'Munnar', state: 'Kerala', country: 'India' },
  media: [{ id: 'im1', kind: 'IMAGE', url: 'https://example.com/tea.jpg', description: 'Tea hills' }],
  bookingQuestions: [{ code: 'TRAVELLER_ID', label: 'Traveller ID', type: 'TEXT', required: true, appliesPerTraveller: true }],
  variants: [{
    id: 'v1', name: 'Guided Tea Walk', variantCode: 'GUIDED', description: 'A guided walk', durationMinutes: 120,
    privateShared: 'SHARED', pickupIncluded: true, pickupType: 'HOTEL', pickupTimings: '09:00',
    mealIncluded: true, mealType: 'TEA', menu: ['Fresh tea'], pointsOfInterest: ['Tea garden viewpoint'],
    inclusions: ['Tea tasting'], exclusions: ['Personal expenses'], suitableFor: ['Adults'], offers: [{
      ratePlanId: 'rp1', sessionId: 'sess1', serviceDate: '2099-06-12',
      localStartTime: '09:00', bookingMode: 'INSTANT',
      price: { finalAmount: 1800, currency: 'INR' },
    }],
  }],
};

describe('Agent published activity detail', () => {
  it('renders all public activity sections from the approved-Agent view endpoint', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(product as never);
    render(<AgentProductView productId="p1" context={context} onBack={vi.fn()} canBook />);
    expect(await screen.findByText('Walk through the lush tea estate.')).toBeDefined();
    expect(request).toHaveBeenCalledWith('/marketplace/products/p1/view', {
      method: 'POST', body: JSON.stringify(context),
    });
    expect(screen.getByText('Tea Estate Road')).toBeDefined();
    expect(screen.getByText('Comfortable walking shoes')).toBeDefined();
    expect(screen.getByText('Follow the guide')).toBeDefined();
    expect(screen.getByText('Show your voucher')).toBeDefined();
    expect(screen.getByText('Traveller ID *')).toBeDefined();
    expect(screen.getByText('Tea garden viewpoint')).toBeDefined();
    expect(screen.getByRole('img', { name: 'Tea hills' })).toBeDefined();
    expect(screen.getAllByText('₹1,800').length).toBeGreaterThan(0);
  });

  it('does not expose booking CTA to view-only agent roles', async () => {
    vi.spyOn(api, 'request').mockResolvedValue(product as never);
    render(<AgentProductView productId="p1" context={context} onBack={vi.fn()} canBook={false} />);
    expect(await screen.findByText('Walk through the lush tea estate.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Book this option/i })).toBeNull();
    expect(screen.getByText('Booking is unavailable for your account role.')).toBeDefined();
  });

  it('opens the current Booking Wizard for an eligible offer without replacing the booking API', async () => {
    vi.spyOn(api, 'request').mockResolvedValue(product as never);
    render(<AgentProductView productId="p1" context={context} onBack={vi.fn()} canBook />);
    const book = await screen.findByRole('button', { name: /Book this option/i });
    fireEvent.click(book);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Book this option/i })).toBeNull());
  });
});
