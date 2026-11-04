import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentActivityCards, { minimumActivityPrice, type ActivityResult } from './AgentActivityCards';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const context = { serviceDate: '2099-06-12', travellers: [{ travellerType: 'ADULT', quantity: 2 }] };
const product: ActivityResult = {
  id: 'p1', name: 'Munnar Tea Trail', shortDescription: 'Experience tea country.',
  destination: { city: 'Munnar', state: 'Kerala' }, starRating: '4.5',
  coverMedia: { kind: 'IMAGE', url: 'https://example.com/tea.jpg', description: 'Tea estate' },
  variants: [
    { id: 'v1', name: 'Guided walk', durationMinutes: 120, pickupIncluded: true, offers: [
      { sessionId: 's1', serviceDate: '2099-06-12', bookingMode: 'INSTANT', price: { finalAmount: 1200, currency: 'INR' } },
      { sessionId: 's2', serviceDate: '2099-06-12', price: { finalAmount: 1500, currency: 'INR' } },
    ] },
  ],
};

describe('Agent activity cards', () => {
  it('shows published images, destination and the lowest eligible quoted price', () => {
    const onView = vi.fn();
    render(<AgentActivityCards products={[product]} context={context} onView={onView} />);
    expect(screen.getByRole('img', { name: 'Tea estate' })).toBeDefined();
    expect(screen.getByText('Munnar, Kerala')).toBeDefined();
    expect(screen.getByText(/₹1,200/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'View complete details for Munnar Tea Trail' }));
    expect(onView).toHaveBeenCalledWith('p1', context);
  });

  it('does not invent free prices for missing quotes and does not mix currencies', () => {
    expect(minimumActivityPrice({
      ...product, variants: [{ ...product.variants[0], offers: [{ sessionId: 's1', serviceDate: '2099-06-12', price: { finalAmount: null, currency: 'INR' } }] }],
    })).toBeNull();
    expect(minimumActivityPrice({
      ...product, variants: [{ ...product.variants[0], offers: [
        { sessionId: 's1', serviceDate: '2099-06-12', price: { finalAmount: 800, currency: 'INR' } },
        { sessionId: 's2', serviceDate: '2099-06-12', price: { finalAmount: 10, currency: 'USD' } },
      ] }],
    })).toBeNull();
    expect(minimumActivityPrice({
      ...product, variants: [{ ...product.variants[0], offers: [{ sessionId: 's1', serviceDate: '2099-06-12', price: { finalAmount: 0, currency: 'INR' } }] }],
    })?.amount).toBe(0);
  });

  it('shows an honest empty state for searches with no available products', () => {
    render(<AgentActivityCards products={[]} context={context} onView={vi.fn()} />);
    expect(screen.getByText('No eligible activities for this search')).toBeDefined();
  });
});
