import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { api } from '../../api';
import ProductImportModal from './ProductImportModal';
import { createSampleWorkbook } from './productImport';

afterEach(() => vi.restoreAllMocks());

describe('ProductImportModal backend validation flow', () => {
  it('sends a single-product workbook to the server-side validated import endpoint', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ productId: 'product-1', status: 'DRAFT' } as never);
    const onComplete = vi.fn();
    const bytes = XLSX.write(createSampleWorkbook(), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const file = new File([bytes], 'sample.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    render(<ProductImportModal onClose={vi.fn()} onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [file] } });
    await screen.findByText(/1 valid product/);
    fireEvent.click(screen.getByRole('button', { name: 'Import valid products (1)' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('/products/import/json', expect.objectContaining({ method: 'POST' }));
    const [, options] = request.mock.calls[0];
    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject({
      Basic_Info: [expect.objectContaining({ product_name: 'Munnar Sunrise Spice Garden Walk' })],
      Experience: [expect.any(Object)],
      Options: expect.arrayContaining([expect.any(Object)]),
      Ticket_Types: expect.arrayContaining([expect.objectContaining({ ticket_type: 'Child', needs_adult: true })]),
      Rate_Plans: expect.arrayContaining([expect.any(Object)]),
      Availability: expect.arrayContaining([expect.any(Object)]),
      Media: [],
      Booking_Questions: [],
      Fulfilment: [],
    });
    expect(onComplete).toHaveBeenCalledWith('product-1', 1, 'COMPLETED', undefined, 'PRODUCTS');
  });

  it('sends multiple product groups through the batch API after workbook validation', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ status: 'COMPLETED', importedCount: 2, products: [{ productId: 'product-1' }, { productId: 'product-2' }] } as never);
    const onComplete = vi.fn();
    const workbook = createSampleWorkbook();
    for (const sheetName of ['Products', 'Options', 'Ticket types', 'Rates', 'Time slots']) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      XLSX.utils.sheet_add_json(sheet, rows.map((row) => ({ ...row, product_code: 'SECOND_PRODUCT', ...(sheetName === 'Products' ? { product_name: 'Second Munnar Walk' } : {}) })), { origin: -1, skipHeader: true });
    }
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const file = new File([bytes], 'batch.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    render(<ProductImportModal onClose={vi.fn()} onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [file] } });
    expect(await screen.findByText(/2 valid products/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import valid products (2)' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/products/import/batch', expect.objectContaining({ method: 'POST' })));
    const [, options] = request.mock.calls[0];
    expect(JSON.parse(String(options?.body)).products).toHaveLength(2);
    expect(onComplete).toHaveBeenCalledWith('product-1', 2, 'COMPLETED', undefined, 'PRODUCTS');
  });

  it('sends validated rate rows to the existing-product rate update endpoint', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ status: 'COMPLETED', updatedProductCount: 1 } as never);
    const onComplete = vi.fn();
    const file = new File([
      'product_code,option_code,valid_from,valid_to,adult_sell_inr,child_sell_inr,senior_sell_inr,base_sell_inr,mrp_inr\nTA-GA-0318,OPT-1,2026-12-01,2027-01-01,750,,,,1000',
    ], 'rate-update.csv', { type: 'text/csv' });
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'UPDATE_RATES' } });
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [file] } });
    expect(await screen.findByText(/1 valid option rate/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply valid rate updates (1)' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/products/rates/import/batch', expect.objectContaining({ method: 'POST' })));
    const [, options] = request.mock.calls[0];
    expect(JSON.parse(String(options?.body))).toMatchObject({ rows: [{ productCode: 'TA-GA-0318', optionCode: 'OPT-1', adultSellInr: '750' }] });
    expect(onComplete).toHaveBeenCalledWith(null, 1, 'COMPLETED', undefined, 'RATES');
  });
});
