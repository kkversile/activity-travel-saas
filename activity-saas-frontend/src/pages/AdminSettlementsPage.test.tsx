import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import AdminSettlements from './AdminSettlements';

afterEach(() => vi.restoreAllMocks());

function mockFinanceApi() {
  return vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
    if (path === '/admin/finance/configuration') return {
      paymentCollectionMode: 'UNCONFIGURED', baseCurrency: 'INR',
      gstOnCommissionPercent: null, tds194OPercent: null, gstTcsPercent: null,
      version: 1,
    } as never;
    if (path === '/admin/agents') return [] as never;
    return [] as never;
  });
}

describe('Finance configuration role controls', () => {
  it('keeps configuration read-only for a normal Admin', async () => {
    mockFinanceApi();
    render(<AdminSettlements canConfigure={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Finance Configuration' }));
    expect(screen.getByRole('combobox', { name: 'Payment collection mode' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'GST on commission (%)' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save configuration' })).not.toBeInTheDocument();
  });

  it('allows a Super Admin to edit rates without assuming defaults', async () => {
    mockFinanceApi();
    render(<AdminSettlements canConfigure />);
    fireEvent.click(await screen.findByRole('button', { name: 'Finance Configuration' }));
    expect(screen.getByRole('spinbutton', { name: 'TDS 194-O (%)' })).toBeEnabled();
    expect((screen.getByRole('spinbutton', { name: 'GST TCS (%)' }) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
  });
});

describe('Finance payout bank verification mapping', () => {
  it('shows the persisted bank-proof verification status beside payout details', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/settlements') return [{
        id: 'batch-1', batchCode: 'PB-20261104', publicCode: 'PB-20261104', vendorTenantId: 'vendor-1',
        currency: 'INR', netPayable: '852.00', status: 'PREPARED', lineCount: 1, heldAmount: '0.00',
        lines: [{ bookingId: 'booking-1', grossBookingValue: '1000.00', adjustmentAmount: '0.00', components: {
          supplierCommission: '100.00', gstOnCommissionAmount: '18.00', tds194OAmount: '20.00', gstTcsAmount: '10.00',
        } }],
      }] as never;
      if (path === '/admin/vendors') return [{
        id: 'vendor-1', name: 'Coastal Adventures', vendorProfile: { payoutBankName: 'HDFC Bank', payoutAccountMasked: '••••4821' },
        vendorDocuments: [{ type: 'BANK_PROOF', currentStatus: 'VERIFIED', versions: [{ status: 'VERIFIED' }] }],
      }] as never;
      if (path === '/admin/finance/configuration') return { paymentCollectionMode: 'UNCONFIGURED', baseCurrency: 'INR', version: 1 } as never;
      if (path === '/admin/agents') return [] as never;
      return [] as never;
    });

    render(<AdminSettlements />);

    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('HDFC Bank')).toBeInTheDocument();
    expect(screen.getByText('−₹118.00')).toBeInTheDocument();
    expect(screen.getByText('−₹30.00')).toBeInTheDocument();
  });
});

describe('Finance wallet credit approvals', () => {
  it('loads persisted requests and sends approval through maker-checker API', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/admin/finance/configuration') return { paymentCollectionMode: 'UNCONFIGURED', baseCurrency: 'INR', version: 1 } as never;
      if (path === '/admin/agents') return [] as never;
      if (path === '/admin/approvals?type=AGENT_WALLET_CREDIT') return [{ id: 'credit-1', publicCode: 'APR-000001', title: 'Manual wallet credit · Demo Agent', ownerName: 'Demo Agent', amount: 250, currency: 'INR', paymentMethod: 'UPI', reference: 'UPI-123', requestReason: 'Verified receipt', requesterName: 'Maker Admin', canDecide: true, updatedAt: '2026-11-02T10:00:00.000Z' }] as never;
      return [] as never;
    });
    render(<AdminSettlements />);
    fireEvent.click(await screen.findByRole('button', { name: /Wallet credits/ }));
    expect(await screen.findByText('Verified receipt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verify & credit' }));
    expect(request).toHaveBeenCalledWith('/admin/agent-wallet-credit-requests/credit-1/approve', expect.objectContaining({ method: 'POST' }));
  });
});

describe('Commission invoice register', () => {
  it('creates a draft from a reconciled batch and shows the persisted invoice ID', async () => {
    let stored: any[] = [];
    const request = vi.spyOn(api, 'request').mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/admin/finance/configuration') return { paymentCollectionMode: 'UNCONFIGURED', baseCurrency: 'INR', version: 1 } as never;
      if (path === '/admin/agents') return [] as never;
      if (path === '/admin/settlements') return [{ id: 'batch-1', batchCode: 'PB-20261104', publicCode: 'PB-20261104', vendorTenantId: 'vendor-1', currency: 'INR', netPayable: '1000.00', status: 'RECONCILED', lineCount: 2 }] as never;
      if (path === '/admin/vendors') return [{ id: 'vendor-1', name: 'Coastal Adventures' }] as never;
      if (path === '/admin/commission-invoices' && init?.method === 'POST') {
        const created = { id: 'invoice-1', invoiceNumber: 'INV/2627/000184', publicCode: 'INV/2627/000184', financialYear: '2627', settlementBatchId: 'batch-1', vendorTenantId: 'vendor-1', vendorLegalName: 'Coastal Adventures', currency: 'INR', commissionSubtotal: '100.00', gstOnCommissionAmount: '18.00', totalAmount: '118.00', status: 'DRAFT', createdById: 'maker-1' };
        stored = [created];
        return created as never;
      }
      if (path === '/admin/commission-invoices') return stored as never;
      return [] as never;
    });

    render(<AdminSettlements currentUserId="maker-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Commission invoices' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Reconciled settlement batch' }), { target: { value: 'batch-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft invoice' }));

    expect(await screen.findByText('INV/2627/000184')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/admin/commission-invoices', expect.objectContaining({ method: 'POST', body: JSON.stringify({ settlementBatchId: 'batch-1' }) }));
    expect(screen.getByRole('button', { name: 'Issue' })).toBeDisabled();
  });
});
