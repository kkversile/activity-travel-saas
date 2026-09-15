import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import Products, { formatRelativeTime } from './Products';

vi.mock('./ProductBuilder', () => ({ default: ({ onDone }: { onDone: () => void }) => <div role="dialog"><button onClick={onDone}>Close editor</button></div> }));
const response = { items: [{ id: 'p1', productCode: 'PRD-1', experienceName: 'Tea Walk', destination: 'Munnar, Kerala', optionCount: 2, productStatus: 'LIVE', displayStatus: 'PUBLISHED', currentRevisionId: 'r1', workingRevisionId: null, workingRevisionStatus: null, updatedAt: new Date().toISOString(), bookability: { status: 'BOOKABLE', reasonCodes: [] }, quality: { score: null, status: 'NOT_SCORED' }, action: 'OPEN' }], summary: { live: 1, review: 2, draft: 3 }, pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } } as const;
afterEach(() => vi.restoreAllMocks());

describe('Products table', () => {
  it('formats authoritative timestamps as relative time', () => { expect(formatRelativeTime(new Date().toISOString())).toBe('just now'); });
  it('renders projection columns, summary counters and row action', async () => { vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products />); await waitFor(() => expect(screen.getByText('Tea Walk')).toBeInTheDocument()); expect(screen.getByText('Destination')).toBeInTheDocument(); expect(screen.getByText('Bookability')).toBeInTheDocument(); expect(screen.getByText('Quality')).toBeInTheDocument(); expect(screen.getAllByText('Live').length).toBeGreaterThan(0); expect(screen.getByText('Review')).toBeInTheDocument(); expect(screen.getByText('Draft')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument(); });
  it('debounces search and sends the server query', async () => { const request = vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products />); await waitFor(() => expect(request).toHaveBeenCalled()); fireEvent.change(screen.getByPlaceholderText('Search products…'), { target: { value: 'tea' } }); await waitFor(() => expect(request.mock.calls.some(([path]) => String(path).includes('search=tea'))).toBe(true), { timeout: 1000 }); });
  it('restores focus to the row trigger after closing the editor', async () => { vi.spyOn(api, 'request').mockResolvedValue(response as never); render(<Products />); const action = await screen.findByRole('button', { name: 'Open' }); fireEvent.click(action); fireEvent.click(screen.getByRole('button', { name: 'Close editor' })); await waitFor(() => expect(action).toHaveFocus()); });
  it('keeps the empty state inside the shell with one create CTA', async () => { vi.spyOn(api, 'request').mockResolvedValue({ ...response, items: [], pagination: { ...response.pagination, total: 0 } } as never); render(<Products />); await waitFor(() => expect(screen.getByText('No products yet')).toBeInTheDocument()); expect(screen.getAllByRole('button', { name: '+ Create experience' })).toHaveLength(1); });
});
