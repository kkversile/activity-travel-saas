import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { api, ApiError } from '../../api';
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
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' }));
    await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button', { name: 'Import valid products (1)' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request).toHaveBeenCalledWith('/products/import/json', expect.objectContaining({ method: 'POST' }));
    const [, options] = request.mock.calls[1];
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
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' }));
    await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button', { name: 'Import valid products (2)' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/products/import/batch', expect.objectContaining({ method: 'POST' })));
    const [, options] = request.mock.calls[1];
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
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' }));
    await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button', { name: 'Apply valid rate updates (1)' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/products/rates/import/batch', expect.objectContaining({ method: 'POST' })));
    const [, options] = request.mock.calls[1];
    expect(JSON.parse(String(options?.body))).toMatchObject({ rows: [{ productCode: 'TA-GA-0318', optionCode: 'OPT-1', adultSellInr: '750' }] });
    expect(onComplete).toHaveBeenCalledWith(null, 1, 'COMPLETED', undefined, 'RATES');
  });
});

describe('import validation safety', () => {
  it('retains only unsaved rate groups after a partial update', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce({ valid: true } as never).mockResolvedValueOnce({ status: 'PARTIAL', updatedProductCount: 1, failedProductCode: 'SECOND' } as never);
    const onComplete = vi.fn();
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'UPDATE_RATES' } });
    const csv = 'product_code,option_code,valid_from,valid_to,adult_sell_inr\nFIRST,OPT1,2026-12-01,2027-01-01,750\nSECOND,OPT2,2026-12-01,2027-01-01,850';
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([csv], 'rates.csv')] } });
    await screen.findByText(/2 valid option rates/);
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' })); await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button', { name: 'Apply valid rate updates (2)' }));
    await screen.findByText(/Only unsaved records remain/);
    expect(screen.getByRole('button', { name: 'Apply valid rate updates (1)' })).toBeDisabled();
    request.mockResolvedValueOnce({ valid: true } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' })); await screen.findByText(/Server validation passed/);
    expect(JSON.parse(String(request.mock.calls[2][1]?.body)).rows.map((row: any) => row.productCode)).toEqual(['SECOND']);
    expect(onComplete).not.toHaveBeenCalled();
  });
  it('keeps saving disabled when server validation fails and displays row details', async () => {
    const request = vi.spyOn(api, 'request').mockRejectedValue(new ApiError(400, 'Invalid product', 'IMPORT_BATCH_VALIDATION_FAILED', [{ productIndex: 1, productKey: 'WALK', issues: ['Invalid rates'] }]));
    render(<ProductImportModal onClose={vi.fn()} onComplete={vi.fn()} />);
    const bytes = XLSX.write(createSampleWorkbook(), { bookType: 'xlsx', type: 'array' });
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([bytes], 'walk.xlsx')] } });
    await screen.findByText(/1 valid product/);
    expect(screen.getByRole('button', { name: 'Import valid products (1)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' }));
    await screen.findByText(/Invalid rates/);
    expect(screen.getByRole('button', { name: 'Import valid products (1)' })).toBeDisabled();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('reports file read errors and permits selecting another file', async () => {
    render(<ProductImportModal onClose={vi.fn()} onComplete={vi.fn()} />);
    const file = new File(['broken'], 'broken.xlsx');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('unreadable'));
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [file] } });
    await screen.findByText(/This file could not be read/);
    expect(screen.getByLabelText('Completed Excel, CSV or JSON file')).toBeEnabled();
  });
  it('retains only unsaved product groups after a partial import', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce({ valid: true } as never).mockResolvedValueOnce({ status: 'PARTIAL', importedCount: 1, failedProductIndex: 2, products: [{ productId: 'saved' }] } as never);
    const onComplete = vi.fn();
    const workbook = createSampleWorkbook();
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      XLSX.utils.sheet_add_json(sheet, rows.map(row => ({ ...row, product_code: 'SECOND_PRODUCT', ...(sheetName === 'Products' ? { product_name: 'Second Munnar Walk' } : {}) })), { origin: -1, skipHeader: true });
    }
    render(<ProductImportModal onClose={vi.fn()} onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], 'walks.xlsx')] } });
    await screen.findByText(/2 valid products/);
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' })); await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button', { name: 'Import valid products (2)' }));
    await screen.findByText(/Only unsaved records remain/);
    expect(screen.getByRole('button', { name: 'Import valid products (1)' })).toBeDisabled();
    request.mockResolvedValueOnce({ valid: true } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' })); await screen.findByText(/Server validation passed/);
    expect(JSON.parse(String(request.mock.calls[2][1]?.body)).products[0].Basic_Info[0].product_key).toBe('SECOND_PRODUCT');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
