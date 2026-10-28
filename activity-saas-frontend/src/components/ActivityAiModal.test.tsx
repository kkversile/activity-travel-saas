import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import ActivityAiModal from './ActivityAiModal';

const generated = { generationId: 'AI-TEST-1', model: 'mock', draft: { Basic_Info: [{ product_name: 'Dream Land Fun and Adventure', type: 'ACTIVITY', sub_type: 'Adventure park', city: 'Munnar', state: 'Kerala', country: 'India', short_description: 'Draft' }], Experience: [{ full_description: 'Supplier-confirmed description', highlights: ['Family activity'] }], Options: [{ option_code: 'STANDARD', option_name: 'Standard entry', description: 'Supplier-confirmed option' }], Media: [{ kind: 'IMAGE', url: 'https://images.example.com/park.jpg', source_url: 'https://example.com/park', description: 'Park entrance', requires_review: true }], Rate_Plans: [{ rate_plan_name: 'Do not import this' }], Availability: [{ schedule_name: 'Do not import this' }] }, missingSupplierData: ['Supplier pricing and rate-plan rules'], warnings: [], requiresVerification: ['Meeting point'] };
afterEach(() => vi.restoreAllMocks());

describe('ActivityAiModal', () => {
  it('requires explicit acceptance before saving and saves reviewed content through the AI draft endpoint', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => { if (path === '/activity-ai/generate') return generated as never; if (path === '/activity-ai/save-draft') return { productId: 'p1' } as never; return {} as never; });
    const onSaved = vi.fn(); render(<ActivityAiModal onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Dream Land Fun and Adventure' } }); fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));
    await screen.findByText(/Nothing is accepted automatically/);
    expect(screen.getByText(/No verified exact address was found/)).toBeInTheDocument();
    expect(screen.getByText('Suggested images')).toBeInTheDocument(); expect(screen.getByText('Park entrance')).toBeInTheDocument(); expect(screen.getByAltText('Park entrance')).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute('href', 'https://example.com/park');
    expect(screen.getByRole('button', { name: 'Save draft & open product wizard' })).toBeDisabled();
    expect(screen.queryByText('Complete supplier information')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Adult price 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Availability capacity 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview draft structure' }));
    expect(await screen.findByText('Existing import preview')).toBeInTheDocument();
    expect(screen.getByText('Rate_Plans: Add at least one rate plan.')).toBeInTheDocument();
    expect(screen.getByText('Availability: Add at least one availability schedule.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Accept Description')); fireEvent.click(screen.getByRole('button', { name: 'Save draft & open product wizard' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('p1'));
    expect(request.mock.calls.some(([path]) => path === '/products/drafts')).toBe(false);
    const save = request.mock.calls.find(([path]) => path === '/activity-ai/save-draft'); expect(save?.[1]?.body).toContain('AI-TEST-1'); expect(save?.[1]?.body).not.toContain('Do not import this'); expect(save?.[1]?.body).not.toContain('Rate_Plans'); expect(save?.[1]?.body).not.toContain('Availability');
  });

  it('accepts every content field and option when Accept all is clicked', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => path === '/activity-ai/generate' ? generated as never : {} as never);
    render(<ActivityAiModal onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Dream Land Fun and Adventure' } }); fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));
    await screen.findByText(/Nothing is accepted automatically/);
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    for (const label of ['Accept Short description', 'Accept Description', 'Accept Highlights', 'Accept Important information', 'Accept Things to carry', 'Accept Safety measures', 'Accept Terms', 'Accept How to redeem', 'Accept Additional information']) expect(screen.getByLabelText(label)).toBeChecked();
    const checkboxes = screen.getAllByRole('checkbox'); expect(checkboxes[checkboxes.length - 1]).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save draft & open product wizard' })).not.toBeDisabled();
  });
});
