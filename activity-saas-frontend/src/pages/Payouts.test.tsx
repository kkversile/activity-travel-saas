import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import Payouts from './Payouts';

afterEach(() => vi.restoreAllMocks());

describe('vendor payments prototype parity', () => {
  it('shows activity dates, unique bookings and captured payout tax components', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({
      batches: [{
        id: 'batch-1', batchCode: 'SET-1', currency: 'INR', netPayable: '1197.60', status: 'READY_FOR_PAYOUT', createdAt: '2026-10-26T00:00:00.000Z',
        periodFrom: '2026-10-19T00:00:00.000Z', periodTo: '2026-10-25T00:00:00.000Z',
        lines: [
          { bookingId: 'booking-1', grossBookingValue: '1000.00', vendorPayableBase: '820.00', adjustmentAmount: '0', netVendorPayable: '798.40', taxInformational: '0', components: { supplierCommission: '180.00' }, gstOnCommissionAmount: '32.40', tds194OAmount: '10.00', gstTcsAmount: '2.00' },
          { bookingId: 'booking-1', grossBookingValue: '500.00', vendorPayableBase: '410.00', adjustmentAmount: '0', netVendorPayable: '399.20', taxInformational: '0', components: { supplierCommission: '90.00' }, gstOnCommissionAmount: '16.20', tds194OAmount: '5.00', gstTcsAmount: '1.00' },
        ],
      }], payouts: [], legacyPayouts: [], summary: {
        paidInSelectedMonth: 0, onHold: 0, nextPayout: { amount: 4500, dueDate: '2026-11-04T00:00:00.000Z', currency: 'INR', periodFrom: '2026-10-19T00:00:00.000Z', periodTo: '2026-10-25T00:00:00.000Z' },
        payoutAccount: { masked: '••4417', holder: 'Savio Fernandes', bankName: null, currency: 'INR', verificationStatus: 'VERIFIED' },
      },
    } as never);

    render(<Payouts />);
    const table = await screen.findByRole('table');
    for (const column of ['Activity dates', 'Bookings', 'Gross sales', 'Commission', 'GST on commission', 'TDS 194-O', 'GST TCS', 'Net payout', 'Status']) {
      expect(within(table).getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    const row = within(table).getByRole('row', { name: /SET-1/ });
    expect(within(row).getByText(/19 Oct 2026 – 25 Oct 2026/)).toBeInTheDocument();
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(within(row).getByText('₹1,500.00')).toBeInTheDocument();
    expect(within(row).getByText('₹270.00')).toBeInTheDocument();
    expect(within(row).getByText('₹48.60')).toBeInTheDocument();
    expect(within(row).getByText('₹15.00')).toBeInTheDocument();
    expect(within(row).getByText('₹3.00')).toBeInTheDocument();
    expect(within(row).getByText('₹1,197.60')).toBeInTheDocument();
    expect(screen.getByText(/VERIFIED · change needs re-verification/i)).toBeInTheDocument();
    expect(screen.getByText('Due 04 Nov 2026 · activities 19 Oct 2026–25 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/Commission is invoiced to you with GST; the invoice is in Reports\./i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All statements' })).toHaveAttribute('href', '/vendor/reports');
  });
});
