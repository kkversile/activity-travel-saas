import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { money } from '../components/Ui';
import Products, { formatRelativeTime } from './Products';

vi.mock('./ProductBuilder', () => ({ default: ({ onDone, initialStep }: { onDone: () => void; initialStep?: number }) => <div role="dialog"><span data-testid="builder-step">{initialStep || 1}</span><button onClick={onDone}>Close editor</button></div> }));
const response = { items: [{ id: 'p1', productCode: 'PRD-1', experienceName: 'Tea Walk', type: 'ACTIVITY', subType: 'GUIDED_TOUR', destination: 'Munnar, Kerala', optionCount: 2, bookings30d: 12, startingPrice: 1499, productStatus: 'LIVE', displayStatus: 'PUBLISHED', currentRevisionId: 'r1', workingRevisionId: null, workingRevisionStatus: null, updatedAt: new Date().toISOString(), bookability: { status: 'BOOKABLE', reasonCodes: [] }, quality: { score: 82, status: 'SCORED' }, action: 'OPEN' }], summary: { live: 1, review: 2, draft: 3 }, pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } as const;
afterEach(() => vi.restoreAllMocks());

describe('Products table', () => {
  it.each([
    [{ startingPrice: 90.25, startingPriceCurrency: 'USD' }, '$90.25'],
    [{ startingPrice: 1499, startingPriceCurrency: 'INR' }, '₹1,499.00'],
    [{ startingPrice: 80, startingPriceCurrency: 'EUR' }, '€80.00'],
    [{ startingPrice: 0, startingPriceCurrency: 'USD' }, '$0.00'],
    [{ startingPrice: 175.5, startingPriceCurrency: 'P9X' }, 'P9X 175.5'],
    [{ startingPrice: 1499 }, '₹1,499.00'],
    [{ startingPrice: null, startingPriceCurrency: null, startingPrices: [] }, '—'],
  ])('renders the starting price with its currency (%j)', async (price, expected) => {
    vi.spyOn(api, 'request').mockResolvedValue({ ...response, items: [{ ...response.items[0], ...price }] } as never);
    render(<Products />);
    const row = (await screen.findByText('Tea Walk')).closest('tr')!;
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent(expected);
    if ('startingPriceCurrency' in price && price.startingPriceCurrency === 'USD') expect(within(row).getAllByRole('cell')[3]).not.toHaveTextContent('₹');
  });
  it('shows currency-specific minima together without labelling them all INR', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({ ...response, items: [{ ...response.items[0], startingPrice: null, startingPriceCurrency: null, startingPrices: [{ currency: 'INR', amount: 900 }, { currency: 'USD', amount: 45 }] }] } as never);
    render(<Products />);
    const row = (await screen.findByText('Tea Walk')).closest('tr')!;
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('₹900.00 / $45.00');
  });
  it('keeps each product currency independent in the same list', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({ ...response, items: [
      { ...response.items[0], startingPriceCurrency: 'INR', startingPrices: [{ currency: 'INR', amount: 1499 }] },
      { ...response.items[0], id: 'p2', productCode: 'PRD-2', experienceName: 'Harbour Cruise', startingPrice: 90, startingPriceCurrency: 'USD', startingPrices: [{ currency: 'USD', amount: 90 }] },
    ] } as never);
    render(<Products />);
    const usdRow = (await screen.findByText('Harbour Cruise')).closest('tr')!;
    const inrRow = screen.getByText('Tea Walk').closest('tr')!;
    expect(within(usdRow).getAllByRole('cell')[3]).toHaveTextContent('$90.00');
    expect(within(inrRow).getAllByRole('cell')[3]).toHaveTextContent('₹1,499.00');
  });
  it('does not crash when legacy data contains an invalid currency code', () => { expect(money('175.50', 'P9X')).toBe('P9X 175.5'); });
  it('formats authoritative timestamps as relative time', () => { expect(formatRelativeTime(new Date().toISOString())).toBe('just now'); });
  it('renders the reference columns, score, counts and row action', async () => { vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products />); await waitFor(() => expect(screen.getByText('Tea Walk')).toBeInTheDocument()); expect(screen.getByText('Product')).toBeInTheDocument(); expect(screen.getByText('Type')).toBeInTheDocument(); expect(screen.getByText('Bookings · 30 days')).toBeInTheDocument(); expect(screen.getByText('Content')).toBeInTheDocument(); expect(screen.getByText('82%')).toBeInTheDocument(); expect(screen.getAllByText('Live').length).toBeGreaterThan(0); expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument(); });
  it('keeps the reference action header visually blank and uses the primary add-product style', async () => { vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products />); await waitFor(() => expect(screen.getByText('Tea Walk')).toBeInTheDocument()); expect(screen.getByRole('columnheader', { name: 'Actions' })).toHaveTextContent(''); expect(screen.getByRole('button', { name: '+ Add product' })).toHaveClass('primary'); });
  it('routes the prototype bulk upload action to the dedicated bulk upload page', async () => { const onBulkUploadRoute = vi.fn(); vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products onBulkUploadRoute={onBulkUploadRoute} />); await screen.findByText('Tea Walk'); fireEvent.click(screen.getByRole('button', { name: 'Bulk upload' })); expect(onBulkUploadRoute).toHaveBeenCalledOnce(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); });
  it('routes the prototype add-product action to the dedicated product builder page', async () => { const onAddProductRoute = vi.fn(); vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products onAddProductRoute={onAddProductRoute} />); await screen.findByText('Tea Walk'); fireEvent.click(screen.getByRole('button', { name: '+ Add product' })); expect(onAddProductRoute).toHaveBeenCalledOnce(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); });
  it('debounces search and sends the server query', async () => { const request = vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products />); await waitFor(() => expect(request).toHaveBeenCalled()); fireEvent.change(screen.getByPlaceholderText('Search by name, city or product code'), { target: { value: 'tea' } }); await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('search=tea'))).toBe(true), { timeout: 1000 }); });
  it('restores focus to the row trigger after closing the editor', async () => { vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products />); const action = await screen.findByRole('button', { name: 'Edit' }); fireEvent.click(action); fireEvent.click(screen.getByRole('button', { name: 'Close editor' })); await waitFor(() => expect(action).toHaveFocus()); });
  it('opens the review step from a list Submit action', async () => { const submitResponse = { ...response, items: [{ ...response.items[0], action: 'SUBMIT' }] }; vi.spyOn(api, 'request').mockResolvedValue(submitResponse as never); render(<Products />); const submit = await screen.findByRole('button', { name: 'Submit' }); fireEvent.click(submit); expect(screen.getByTestId('builder-step')).toHaveTextContent('6'); });
  it('keeps the empty state inside the shell with one create CTA', async () => { vi.spyOn(api, 'request').mockResolvedValue({ ...response, items: [], pagination: { ...response.pagination, total: 0 } } as never); render(<Products />); await waitFor(() => expect(screen.getByText('No products yet')).toBeInTheDocument()); expect(screen.getAllByRole('button', { name: '+ Add product' })).toHaveLength(1); });
});
