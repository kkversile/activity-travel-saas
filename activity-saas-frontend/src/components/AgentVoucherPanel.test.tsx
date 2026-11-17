import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AgentBooking } from '../api';
import AgentVoucherPanel from './AgentVoucherPanel';

const booking = { id: 'booking-1', bookingCode: 'VY-ONE', publicCode: 'AG-ONE', status: 'CONFIRMED' } as AgentBooking;
const ready = { currentVoucher: { id: 'voucher-1', version: 1, voucherCode: 'VOY-READY', generatedAt: '2026-11-17T05:20:00Z', fileId: 'file-1' }, readiness: { ready: true } };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Agent voucher display', () => {
  it('shows loading, never supplier-evidence pending, until the response arrives', async () => {
    let resolve!: (value: unknown) => void;
    vi.spyOn(api, 'request').mockImplementation(() => new Promise((done) => { resolve = done; }) as never);
    render(<AgentVoucherPanel booking={booking} canBook />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading voucher');
    expect(screen.queryByText('Waiting for supplier evidence')).not.toBeInTheDocument();
    await act(async () => resolve(ready));
    expect(screen.getByText('VOY-READY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download voucher' })).toBeEnabled();
  });
  it('shows a request failure and allows a successful retry', async () => {
    vi.spyOn(api, 'request').mockRejectedValueOnce(new Error('Temporary network failure')).mockResolvedValueOnce(ready);
    render(<AgentVoucherPanel booking={booking} canBook />);
    expect(await screen.findByText('Could not load the voucher.')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for supplier evidence')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh voucher' }));
    expect(await screen.findByText('VOY-READY')).toBeInTheDocument();
  });
  it('automatically refreshes an asynchronous generation and stops after success', async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce({ currentVoucher: null, readiness: { ready: true }, reason: 'VOUCHER_NOT_READY' }).mockResolvedValue(ready);
    render(<AgentVoucherPanel booking={booking} canBook />);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Generating voucher');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText('VOY-READY')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('shows supplier-evidence pending only after the API reports it', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ currentVoucher: null, readiness: { ready: false }, reason: 'FULFILMENT_EVIDENCE_PENDING' });
    render(<AgentVoucherPanel booking={booking} canBook />);
    expect(await screen.findByText('Waiting for supplier evidence')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('shows generation failure without claiming missing supplier evidence', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({ currentVoucher: null, readiness: { ready: true }, reason: 'VOUCHER_GENERATION_FAILED' });
    render(<AgentVoucherPanel booking={booking} canBook />);
    expect(await screen.findByText(/Voucher generation failed/)).toBeInTheDocument();
    expect(screen.queryByText('Waiting for supplier evidence')).not.toBeInTheDocument();
  });
  it('cancels pending polling when the modal unmounts', async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(api, 'request').mockResolvedValue({ currentVoucher: null, readiness: { ready: true } });
    const view = render(<AgentVoucherPanel booking={booking} canBook />);
    await act(async () => {}); view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('hides a previously valid voucher immediately after cancellation', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue(ready);
    const view = render(<AgentVoucherPanel booking={booking} canBook />);
    await screen.findByText('VOY-READY');
    view.rerender(<AgentVoucherPanel booking={{ ...booking, status: 'CANCELLED' }} canBook />);
    expect(screen.getByText(/Voucher voided/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download voucher' })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retains viewer restrictions when a current voucher exists', async () => {
    vi.spyOn(api, 'request').mockResolvedValue(ready);
    render(<AgentVoucherPanel booking={booking} canBook={false} />);
    await screen.findByText('VOY-READY');
    expect(screen.getByRole('button', { name: 'Download voucher' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
  });
});
