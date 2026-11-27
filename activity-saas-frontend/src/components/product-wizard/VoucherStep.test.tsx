import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api';
import VoucherStep from './VoucherStep';
import { emptyFulfilmentForm, emptyRevisionForm, type WizardSnapshot } from './types';
import { voucherSample } from './voucherSample';

const now = new Date('2026-11-27T12:00:00Z');
const snapshot = (): WizardSnapshot => ({ product: null, revision: null, schedules: [], variants: [{ id: 'walk', name: 'Coastal walk', status: 'ACTIVE', ticketTypes: [{ name: 'Adult', rank: 0 }], schedules: [{ id: 'dates', effectiveFrom: '2026-11-01', effectiveTo: '2027-01-01', timezone: 'Asia/Kolkata', operatingDays: ['MON', 'WED', 'FRI'] }] } as never] });
beforeEach(() => { vi.spyOn(api, 'request').mockResolvedValue([] as never); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('sample voucher dates and ticket configuration', () => {
  it('uses current option availability instead of a fixed past booking date or invented children', () => {
    const sample = voucherSample(snapshot(), now);
    expect(sample.dateLabel).toContain('27 Nov 2026');
    expect(sample.ticketLabel).toBe('Ticket types: Adult');
    expect(sample.optionName).toBe('Coastal walk');
  });
  it('honours operating weekdays and the exclusive end date', () => {
    expect(voucherSample(snapshot(), new Date('2026-11-28T12:00:00Z')).dateLabel).toContain('30 Nov 2026');
    const current = snapshot(); current.variants[0].schedules![0].effectiveTo = '2026-11-30';
    expect(voucherSample(current, new Date('2026-11-28T12:00:00Z')).dateLabel).toBe('Activity date selected when booking');
  });
  it('uses the configured timezone when the next local day has already started', () => {
    expect(voucherSample(snapshot(), new Date('2026-11-27T20:00:00Z')).dateLabel).toContain('30 Nov 2026');
  });
  it.each(['2026-02-30', 'invalid'])('does not display an invalid configured date (%s)', date => {
    const current = snapshot(); current.variants[0].schedules![0].effectiveFrom = date;
    expect(voucherSample(current, now).dateLabel).toBe('Activity date selected when booking');
  });
  it('does not use archived options or an inactive schedule shadowed by a detailed response', () => {
    const current = snapshot();
    current.variants.unshift({ id: 'old', name: 'Archived cruise', status: 'ARCHIVED' } as never);
    current.schedules = [{ id: 'dates', variantId: 'walk', status: 'INACTIVE', effectiveFrom: '2026-11-01', effectiveTo: '2027-01-01' } as never];
    expect(voucherSample(current, now)).toMatchObject({ optionName: 'Coastal walk', dateLabel: 'Activity date selected when booking' });
  });
  it('shows the configured unit for resource-priced options without inventing a traveller mix', () => {
    const current = snapshot(); current.variants[0].unitRows = [{ name: 'Private boat' } as never];
    expect(voucherSample(current, now).ticketLabel).toBe('Unit: Private boat');
  });
  it('keeps empty drafts neutral rather than inventing a coach option or ticket types', () => {
    expect(voucherSample({ product: null, revision: null, variants: [], schedules: [] }, now)).toEqual({ optionName: 'Your bookable option', dateLabel: 'Activity date selected when booking', ticketLabel: 'Ticket selection shown when configured' });
  });
});

describe('voucher preview presentation', () => {
  function props() { return { snapshot: snapshot(), revisionForm: { ...emptyRevisionForm, productName: 'Unsaved coastal title' }, fulfilment: { ...emptyFulfilmentForm }, locked: false, onRevisionChange: vi.fn(), onFulfilmentChange: vi.fn(), onSaveDraft: vi.fn(), onRefresh: vi.fn(), onError: vi.fn() }; }

  it('renders an empty draft without fetching another option or inventing booking details', () => {
    const current = props(); current.snapshot.variants = [];
    render(<VoucherStep {...current} />);
    expect(screen.getByRole('region', { name: 'Sample voucher preview' })).toHaveTextContent('Your bookable option');
    expect(screen.getByRole('region', { name: 'Sample voucher preview' })).toHaveTextContent('Activity date selected when booking');
    expect(api.request).not.toHaveBeenCalled();
  });

  it('reads the selected option schedule when the product response omits availability', async () => {
    const current = props(); current.snapshot.variants[0].schedules = [];
    vi.mocked(api.request).mockResolvedValue([{ id: 'live-dates', variantId: 'walk', status: 'ACTIVE', effectiveFrom: '2099-01-01', effectiveTo: '2099-12-31', operatingDays: [], timezone: 'Asia/Kolkata' }] as never);
    render(<VoucherStep {...current} />);
    expect(await screen.findByText(/Example activity date:.*01 Jan 2099/)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith('/variants/walk/schedules');
    expect(current.onSaveDraft).not.toHaveBeenCalled();
  });

  it('clearly labels the illustration as non-redeemable and preserves editable voucher settings', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const current = props(); render(<VoucherStep {...current} />);
    const preview = screen.getByRole('region', { name: 'Sample voucher preview' });
    expect(within(preview).getByRole('heading', { name: 'Unsaved coastal title' })).toBeInTheDocument();
    expect(preview).toHaveTextContent('No booking or redeemable voucher is created');
    expect(preview).toHaveTextContent('Not for redemption');
    expect(preview).toHaveTextContent('Ticket types: Adult');
    expect(preview).not.toHaveTextContent('Rahul Sharma');
    expect(preview).not.toHaveTextContent('Child');
    expect(preview).not.toHaveTextContent('BK-26110482');
    expect(preview).not.toHaveTextContent('Valid');
    fireEvent.change(screen.getByLabelText('Code source'), { target: { value: 'NONE' } });
    expect(current.onRevisionChange).toHaveBeenCalledWith('voucherCodeSource', 'NONE');
    expect(current.onSaveDraft).not.toHaveBeenCalled();
  });
  it.each(['PLATFORM', 'SUPPLIER_BARCODE_POOL', 'SUPPLIER_API', 'NONE'] as const)('never presents a redeemable voucher in %s mode', source => {
    const current = props(); current.revisionForm.voucherCodeSource = source;
    render(<VoucherStep {...current} locked />);
    expect(screen.getByText('Not for redemption')).toBeInTheDocument();
    expect(screen.getByLabelText('Code source')).toBeDisabled();
    expect(screen.getByLabelText('Voucher accepted as')).toBeDisabled();
    expect(screen.getByLabelText('Redemption instructions')).toBeDisabled();
  });
});
