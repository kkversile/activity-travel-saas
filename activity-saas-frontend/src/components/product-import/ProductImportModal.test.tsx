import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { api, ApiError } from '../../api';
import ProductImportModal from './ProductImportModal';
import { createSampleWorkbook, createSampleImportJson } from './productImport';

afterEach(() => vi.restoreAllMocks());

describe('ProductImportModal backend validation flow', () => {
  const rateCsv = 'product_code,option_code,valid_from,valid_to,adult_sell_inr\nPRD,OPT,2026-12-01,2027-01-01,1900';
  it('calls rows parsed until server validation resolves public/internal aliases into one product', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({ valid: true, productCount: 1 } as never);
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'UPDATE_RATES' } });
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([rateCsv + '\nPUBLIC,OTHER,2026-12-01,2027-01-01,1500'], 'aliases.csv')] } });
    await screen.findByText(/2 parsed rate rows/);
    expect(screen.queryByText(/across \d+ existing products?/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' }));
    await screen.findByText(/2 validated option rates/);
    expect(screen.getByText(/across 1 existing product\./)).toBeInTheDocument();
    expect(screen.queryByText(/across 2/)).not.toBeInTheDocument();
  });

  it('keeps rejected rows labelled parsed with no records ready after server failure', async () => {
    vi.spyOn(api, 'request').mockRejectedValue(new ApiError(400, 'No rates were saved.', 'RATE_IMPORT_VALIDATION_FAILED', [{ row: 3, productCode: 'MISSING', optionCode: 'OPT', field: 'productCode', message: 'Product unavailable.', correction: 'Select an authorized outlet or remove this row.' }]));
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'UPDATE_RATES' } });
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([rateCsv + '\nMISSING,OPT,2026-12-01,2027-01-01,1500'], 'mixed.csv')] } });
    await screen.findByText(/2 parsed rate rows/);
    fireEvent.click(screen.getByRole('button', { name: 'Validate file' }));
    await screen.findByText(/0 records are ready to save/);
    expect(screen.getByText(/CSV!A3/)).toHaveTextContent('MISSING');
    expect(screen.getByRole('button', { name: 'Download error rows' })).toBeEnabled();
    expect(screen.queryByText(/validated option rates|across 2 existing products/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply valid rate updates (2)' })).toBeDisabled();
  });

  it.each(['validated', 'invalid'])('clears %s file state before showing an empty replacement file', async (state) => {
    vi.spyOn(api, 'request').mockResolvedValue({ valid: true, productCount: 1 } as never);
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'UPDATE_RATES' } });
    const contents = state === 'validated' ? rateCsv : rateCsv.replace('1900', 'banana');
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([contents], 'previous.csv')] } });
    await screen.findByText('Selected: previous.csv');
    if (state === 'validated') {
      await screen.findByText(/1 parsed rate row/);
      fireEvent.click(screen.getByRole('button', { name: 'Validate file' })); await screen.findByText(/Server validation passed/);
    } else await screen.findByRole('button', { name: 'Download error rows' });
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([], 'empty.csv')] } });
    await screen.findByText(/This file is empty/);
    expect(screen.getByText('Selected: empty.csv')).toBeInTheDocument();
    expect(screen.queryByText(/previous.csv|Server validation passed|Rate update preview|banana/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download error rows' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate file' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply valid rate updates' })).toBeDisabled();
  });

  it('validates and saves an explicit zero child price without replacing it with a blank',async()=>{
    const request=vi.spyOn(api,'request').mockResolvedValueOnce({valid:true} as never).mockResolvedValueOnce({status:'COMPLETED',updatedProductCount:1} as never),complete=vi.fn();
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={complete}/>);
    fireEvent.change(screen.getByLabelText('Import mode'),{target:{value:'UPDATE_RATES'}});
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[new File(['product_code,option_code,valid_from,valid_to,child_sell_inr\nPRD,OPT,2026-12-01,2027-01-01,0'],'free-child.csv')]}});
    await screen.findByRole('button',{name:'Apply valid rate updates (1)'});
    fireEvent.click(screen.getByRole('button',{name:'Validate file'}));await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button',{name:'Apply valid rate updates (1)'}));
    await waitFor(()=>expect(complete).toHaveBeenCalledWith(null,1,'COMPLETED',undefined,'RATES'));
    expect(JSON.parse(String(request.mock.calls[1][1]?.body)).rows).toEqual([{productCode:'PRD',optionCode:'OPT',validFrom:'2026-12-01',validTo:'2027-01-01',childSellInr:'0'}]);
  });
  it('blocks oversized money locally with the original value and supported maximum',async()=>{
    const request=vi.spyOn(api,'request');render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('Import mode'),{target:{value:'UPDATE_RATES'}});
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[new File(['product_code,option_code,valid_from,valid_to,adult_sell_inr\nPRD,OPT,2026-12-01,2027-01-01,100000000000000'],'amount.csv')]}});
    await screen.findByText('100000000000000',{exact:true});expect(screen.getByText(/CSV!E2/)).toBeInTheDocument();expect(screen.getByText(/99999999999999.9999/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Validate file'})).toBeDisabled();expect(request).not.toHaveBeenCalled();
  });
  it('shows both duplicate JSON key paths and offers the corrective error download',async()=>{
    const request=vi.spyOn(api,'request'),first:any=createSampleImportJson(),second=structuredClone(first);
    second.Basic_Info[0].product_name='Different coastal walk';
    render(<ProductImportModal onClose={vi.fn()} onComplete={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[new File([JSON.stringify({products:[first,second]})],'duplicates.json')]}});
    await screen.findByText(/products\[0\]\.Basic_Info\[0\]\.product_key/);expect(screen.getByText(/products\[1\]\.Basic_Info\[0\]\.product_key/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Download error rows'})).toBeEnabled();expect(screen.getByRole('button',{name:'Validate file'})).toBeDisabled();expect(request).not.toHaveBeenCalled();
  });
  it('blocks a misspelled rate-update header before contacting the server', async () => {
    const request = vi.spyOn(api, 'request');
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'UPDATE_RATES' } });
    const contents = 'product_code,option_code,valid_from,valid_to,adult_sell_inrs,child_sell_inr\nPRODUCT,OPTION,2026-12-01,2026-12-31,1800,900';
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([contents], 'rate-header-typo.csv')] } });
    expect(await screen.findByText(/Unknown column header: adult_sell_inrs/)).toBeInTheDocument();
    expect(screen.getByText(/Rename this column to adult_sell_inr/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Apply valid rate updates$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Validate file' })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });

  it('shows the missing product sheet rather than asking vendors to switch to rate-update mode', async () => {
    const w = createSampleWorkbook(); delete w.Sheets.Options; w.SheetNames = w.SheetNames.filter((name) => name !== 'Options');
    render(<ProductImportModal onClose={vi.fn()} onComplete={vi.fn()} allowRateUpdates />);
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([XLSX.write(w, { bookType: 'xlsx', type: 'array' })], 'missing-options.xlsx')] } });
    expect(await screen.findByText(/Missing required sheet: Options/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate file' })).toBeDisabled();
    expect(screen.queryByText(/Choose.*Update rates on existing products.*before uploading/)).not.toBeInTheDocument();
  });

  it('explains duplicate product codes using the uploaded sheet and both cell locations', async () => {
    const request = vi.spyOn(api, 'request');
    const workbook = createSampleWorkbook();
    XLSX.utils.sheet_add_json(workbook.Sheets.Products, XLSX.utils.sheet_to_json(workbook.Sheets.Products), { origin: -1, skipHeader: true });
    render(<ProductImportModal onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], 'duplicate.xlsx')] } });
    expect(await screen.findByText(/Products!A3: Duplicate product_code/)).toHaveTextContent('Products!A2');
    expect(screen.getByText(/Keep one product row per code/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate file' })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });

  it('sends a single-product workbook to the server-side validated import endpoint', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ productId: 'product-1', status: 'DRAFT' } as never);
    const onComplete = vi.fn();
    const bytes = XLSX.write(createSampleWorkbook(), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const file = new File([bytes], 'sample.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    render(<ProductImportModal onClose={vi.fn()} onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [file] } });
    await screen.findByText(/1 parsed product/);
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
    expect(await screen.findByText(/2 parsed products/)).toBeInTheDocument();
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
    expect(await screen.findByText(/1 parsed rate row/)).toBeInTheDocument();
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
  it('removes every completed public/internal alias after a partial product-group update',async()=>{
    const request=vi.spyOn(api,'request').mockResolvedValueOnce({valid:true} as never).mockResolvedValueOnce({status:'PARTIAL',updatedProductCount:1,completedProductCodes:['PRD-FIRST','TA-KL-FIRST'],failedProductCode:'SECOND'} as never).mockResolvedValueOnce({valid:true} as never);
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()}/>);fireEvent.change(screen.getByLabelText('Import mode'),{target:{value:'UPDATE_RATES'}});
    const csv='product_code,option_code,valid_from,valid_to,adult_sell_inr\nPRD-FIRST,OPT1,2026-12-01,2027-01-01,1900\nTA-KL-FIRST,OPT2,2026-12-01,2027-01-01,1800\nSECOND,OPT3,2026-12-01,2027-01-01,1700';
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[new File([csv],'aliases.csv')]}});await screen.findByText(/3 parsed rate rows/);fireEvent.click(screen.getByRole('button',{name:'Validate file'}));await screen.findByText(/Server validation passed/);fireEvent.click(screen.getByRole('button',{name:'Apply valid rate updates (3)'}));await screen.findByText(/Only unsaved records remain/);
    expect(screen.getByRole('button',{name:'Apply valid rate updates (1)'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Validate file'}));await screen.findByText(/Server validation passed/);expect(JSON.parse(String(request.mock.calls[2][1]?.body)).rows.map((row:any)=>row.productCode)).toEqual(['SECOND']);
  });
  it('shows the entered invalid rate value alongside its source cell and correction',async()=>{
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()}/>);fireEvent.change(screen.getByLabelText('Import mode'),{target:{value:'UPDATE_RATES'}});
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[new File(['product_code,option_code,valid_from,valid_to,adult_sell_inr\n\nPRD,OPT,2026-12-01,2027-01-01,banana'],'rates.csv')]}});
    expect(await screen.findByText('banana',{exact:true})).toBeInTheDocument();expect(screen.getByText(/CSV!E3/)).toBeInTheDocument();expect(screen.getByText(/Enter a non-negative amount/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Apply valid rate updates'})).toBeDisabled();
  });
  it('retains its submission ID across response-loss retry and changes it for a newly selected file',async()=>{
    const request=vi.spyOn(api,'request').mockResolvedValueOnce({valid:true} as never).mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({valid:true} as never).mockResolvedValueOnce({status:'COMPLETED',updatedProductCount:1} as never);
    const onComplete=vi.fn();render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={onComplete}/>);
    fireEvent.change(screen.getByLabelText('Import mode'),{target:{value:'UPDATE_RATES'}});
    const file=new File(['product_code,option_code,valid_from,valid_to,adult_sell_inr\nPRD,OPT,2026-12-01,2027-01-01,1900'],'rates.csv');
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[file]}});await screen.findByText(/1 parsed rate row/);
    fireEvent.click(screen.getByRole('button',{name:'Validate file'}));await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button',{name:'Apply valid rate updates (1)'}));await screen.findByText('Response lost');
    fireEvent.click(screen.getByRole('button',{name:'Validate file'}));await screen.findByText(/Server validation passed/);
    fireEvent.click(screen.getByRole('button',{name:'Apply valid rate updates (1)'}));await waitFor(()=>expect(onComplete).toHaveBeenCalledTimes(1));
    const ids=request.mock.calls.slice(0,4).map(call=>JSON.parse(String(call[1]?.body)).submissionId);expect(new Set(ids).size).toBe(1);expect(ids[0]).toMatch(/^[a-f0-9-]{36}$/);
    request.mockResolvedValueOnce({valid:true} as never);fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[file]}});await screen.findByText(/1 parsed rate row/);fireEvent.click(screen.getByRole('button',{name:'Validate file'}));await screen.findByText(/Server validation passed/);
    expect(JSON.parse(String(request.mock.calls[4][1]?.body)).submissionId).not.toBe(ids[0]);
  });
  it('shows server rate corrections at the physical CSV cell and keeps saving disabled',async()=>{
    vi.spyOn(api,'request').mockRejectedValue(new ApiError(400,'Invalid rate','RATE_IMPORT_VALIDATION_FAILED',[{row:2,productCode:'PRD',optionCode:'OPT',field:'adultSellInr',message:'Sell price exceeds MRP.',correction:'Enter a price at or below 2000.'}]));
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={vi.fn()}/>);fireEvent.change(screen.getByLabelText('Import mode'),{target:{value:'UPDATE_RATES'}});
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[new File(['product_code,option_code,valid_from,valid_to,adult_sell_inr\n\nPRD,OPT,2026-12-01,2027-01-01,2100'],'rates.csv')]}});
    await screen.findByText(/1 parsed rate row/);fireEvent.click(screen.getByRole('button',{name:'Validate file'}));expect(await screen.findByText(/CSV!E3/)).toBeInTheDocument();expect(screen.getByText('Enter a price at or below 2000.')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Apply valid rate updates (1)'})).toBeDisabled();
  });
  it('retains only unsaved rate groups after a partial update', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValueOnce({ valid: true } as never).mockResolvedValueOnce({ status: 'PARTIAL', updatedProductCount: 1, failedProductCode: 'SECOND' } as never);
    const onComplete = vi.fn();
    render(<ProductImportModal allowRateUpdates onClose={vi.fn()} onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'UPDATE_RATES' } });
    const csv = 'product_code,option_code,valid_from,valid_to,adult_sell_inr\nFIRST,OPT1,2026-12-01,2027-01-01,750\nSECOND,OPT2,2026-12-01,2027-01-01,850';
    fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'), { target: { files: [new File([csv], 'rates.csv')] } });
    await screen.findByText(/2 parsed rate rows/);
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
    await screen.findByText(/1 parsed product/);
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
    await screen.findByText(/2 parsed products/);
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
