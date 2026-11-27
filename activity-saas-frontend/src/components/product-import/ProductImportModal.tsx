import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, ApiError } from '../../api';
import { ErrorBox, Field } from '../Ui';
import { createProductTemplateBytes, createRateUpdateTemplateBytes, type TemplateCategory } from './productImportTemplate';
import type { ProductDestination } from '../../../../activity-saas-backend/src/common/product-entry-contract';
import { createRateUpdateTemplateCsv, createSampleImportCsv, createSampleImportJson, importErrorsCsv, serverImportIssues, looksLikeProductWorkbook, parseProductCsv, parseProductJson, parseProductWorkbook, parseRateUpdateCsv, parseRateUpdateWorkbook, type ImportIssue, type ImportWorkbookModel, type RateUpdateImportRow, text } from './productImport';

type Props = { onClose: () => void; onComplete: (productId: string | null, importedCount: number, status: 'COMPLETED' | 'PARTIAL', failure?: string, importType?: 'PRODUCTS' | 'RATES') => void; allowRateUpdates?: boolean };

function workbookColors() {
  const style=getComputedStyle(document.documentElement);
  const color=(key:string,fallback:string)=>{const value=style.getPropertyValue(key).trim();return /^#[0-9a-f]{6}$/i.test(value)?value:fallback;};
  return {primary:color('--voya-primary','#8a4a20'),raised:color('--voya-raised','#e1cbad')};
}
export async function downloadProductImportTemplate(blank = false) {
  const [reference,categories]=await Promise.all([api.request<{destinations:ProductDestination[]}>('/product-entry/reference'),api.request<TemplateCategory[]>('/vendor/activity-categories')]);
  if(!Array.isArray(reference?.destinations)||!Array.isArray(categories))throw new Error('Product reference data is unavailable. Reload and retry.');
  const bytes = createProductTemplateBytes({blank,destinations:reference.destinations,categories,colors:workbookColors()});
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = blank ? 'voya-product-import-template.xlsx' : 'voya-product-import-sample.xlsx'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export function downloadRateUpdateImportTemplate() {
  const url = URL.createObjectURL(new Blob([createRateUpdateTemplateBytes({colors:workbookColors()}) as BlobPart], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-rate-update-template.xlsx'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const productImportPayloads = (models: ImportWorkbookModel[]) => models.map((model) => ({
    Basic_Info: [model.basic],
    Experience: [model.experience],
    Options: model.options,
    Ticket_Types: model.ticketTypes,
    Rate_Plans: model.ratePlans,
    Availability: model.availability,
    Media: model.media,
    Booking_Questions: model.bookingQuestions,
    Fulfilment: Object.keys(model.fulfilment).length ? [model.fulfilment] : [],
  }));

function importFailureMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Resolve the failed record before retrying.';
}

export async function importWorkbook(models: ImportWorkbookModel[], onProgress: (value: string) => void) {
  onProgress(`Validating ${models.length} product${models.length === 1 ? '' : 's'} and saving drafts…`);
  const payloads = productImportPayloads(models);
  const imported = models.length === 1
    ? await api.request<{ productId: string }>('/products/import/json', { method: 'POST', body: JSON.stringify(payloads[0]) })
    : await api.request<{ status: 'COMPLETED' | 'PARTIAL'; importedCount: number; failedProductIndex?: number; error?: unknown; products: Array<{ productId: string }> }>('/products/import/batch', { method: 'POST', body: JSON.stringify({ products: payloads }) });
  const productId = 'productId' in imported ? imported.productId : imported.products?.[0]?.productId;
  const importedCount = 'productId' in imported ? 1 : imported.importedCount;
  const status = 'productId' in imported ? 'COMPLETED' : imported.status;
  const failedProductIndex = 'productId' in imported ? undefined : imported.failedProductIndex;
  if (!productId && status !== 'PARTIAL') throw new Error('The import completed without returning a product ID.');
  onProgress(status === 'PARTIAL'
    ? `Import stopped at product ${failedProductIndex}. ${importedCount} drafts were saved; resolve the failed product, then upload only its rows. ${importFailureMessage('error' in imported ? imported.error : undefined)}`
    : `Import complete. ${importedCount} draft${importedCount === 1 ? '' : 's'} saved.`);
  return { productId, importedCount, status, failedProductIndex };
}

export async function importRateUpdates(rows: RateUpdateImportRow[], onProgress: (value: string) => void, submissionId?: string) {
  onProgress(`Preview-validating ${rows.length} rate update${rows.length === 1 ? '' : 's'}…`);
  const result = await api.request<{ status: 'COMPLETED' | 'PARTIAL'; updatedProductCount: number; completedProductCodes?: string[]; failedProductCode?: string; error?: unknown }>('/products/rates/import/batch', { method: 'POST', body: JSON.stringify({ rows, submissionId }) });
  onProgress(result.status === 'PARTIAL'
    ? `Rate updates stopped at product ${result.failedProductCode}; ${result.updatedProductCount} product groups were applied. The remaining rows must be retried separately. ${importFailureMessage(result.error)}`
    : `Rate update complete. ${result.updatedProductCount} product groups were updated.`);
  return result;
}

export default function ProductImportModal({ onClose, onComplete, allowRateUpdates = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rateSubmissionId = useRef(crypto.randomUUID());
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [models, setModels] = useState<ImportWorkbookModel[]>([]);
  const [rateRows, setRateRows] = useState<RateUpdateImportRow[]>([]);
  const [importMode, setImportMode] = useState<'CREATE_NEW' | 'UPDATE_RATES'>('CREATE_NEW');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState('Working…');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [validated, setValidated] = useState(false);
  const [validatedProductCount, setValidatedProductCount] = useState<number | null>(null);
  const [validationFailed, setValidationFailed] = useState(false);
  const [serverIssues, setServerIssues] = useState<ImportIssue[]>([]);
  const [recovery, setRecovery] = useState(false);
  const hasRecords = models.length > 0 || rateRows.length > 0;
  function resetValidation() { setValidated(false); setValidatedProductCount(null); setValidationFailed(false); setServerIssues([]); setProgress(''); }
  function showServerError(error: unknown) {
    setValidationFailed(true);
    setError(error instanceof Error ? error.message : String(error));
    if (error instanceof ApiError && Array.isArray(error.details)) {
      setServerIssues(serverImportIssues(error.details, models, rateRows));
    }
  }
  async function validateNow() {
    setBusy(true); setOperation('Validating…'); setError(''); resetValidation();
    try {
      const result = await api.request<{ valid: boolean; productCount?: number }>(rateRows.length ? '/products/rates/import/batch/validate' : '/products/import/batch/validate', { method: 'POST', body: JSON.stringify(rateRows.length ? { rows: rateRows, submissionId: rateSubmissionId.current } : { products: productImportPayloads(models) }) });
      setValidatedProductCount(Number.isInteger(result.productCount) && result.productCount! > 0 ? result.productCount! : null);
      setValidated(true); setProgress('Server validation passed. Nothing has been saved. Review the preview, then confirm below.');
    } catch (error) { showServerError(error); } finally { setBusy(false); }
  }
  function downloadRecovery() {
    // Include all price columns even when the first row has fewer values.
    const fields: (keyof RateUpdateImportRow)[] = ['productCode','optionCode','validFrom','validTo','adultSellInr','childSellInr','seniorSellInr','baseSellInr','mrpInr'];
    const csvHeaders = 'product_code,option_code,valid_from,valid_to,adult_sell_inr,child_sell_inr,senior_sell_inr,base_sell_inr,mrp_inr';
    const contents = rateRows.length ? [csvHeaders, ...rateRows.map(row => fields.map(key => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(','))].join('\r\n') : JSON.stringify({ products: productImportPayloads(models) }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], {type: rateRows.length ? 'text/csv' : 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `remaining-import.${rateRows.length ? 'csv' : 'json'}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function downloadSample(blank = false) { setBusy(true);setOperation('Preparing template…');setError('');try{await downloadProductImportTemplate(blank);}catch{setError('The latest template could not be prepared. Reload and try again.');}finally{setBusy(false);} }
  function downloadRateSample() { downloadRateUpdateImportTemplate(); }
  function downloadRateCsvSample() { const blob = new Blob([createRateUpdateTemplateCsv()], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-rate-update-template.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  function downloadCsvSample() { const blob = new Blob([createSampleImportCsv()], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-product-import-sample.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  function downloadJsonSample() { const blob = new Blob([JSON.stringify(createSampleImportJson(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-product-import-sample.json'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  function downloadErrors() {
    const csv = importErrorsCsv([...serverIssues, ...issues]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-product-import-errors.csv'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function selectFile(file: File | undefined) { if (!file) return; rateSubmissionId.current = crypto.randomUUID(); setBusy(true); setOperation('Reading file…'); resetValidation(); setRecovery(false); setFileName(file.name); setError(''); setModels([]); setRateRows([]); setIssues([]); try { if (!/\.(xlsx|xls|csv|json)$/i.test(file.name)) throw new Error('Choose an Excel (.xlsx or .xls), CSV or JSON file.'); if (!file.size) throw new Error('This file is empty. Add your rows and choose the file again.'); const lowerName = file.name.toLowerCase(); if (lowerName.endsWith('.csv')) { const contents = await file.text(); const rates = parseRateUpdateCsv(contents, importMode === 'UPDATE_RATES'); if (rates) { if (!allowRateUpdates) { setError('Rate updates are available from the Bulk upload page.'); return; } if (importMode !== 'UPDATE_RATES') { setError('Choose “Update rates on existing products” before uploading a rate template.'); return; } setIssues(rates.issues); setRateRows(rates.rows); return; } if (importMode !== 'CREATE_NEW') { setError('Choose “Create new products” before uploading a product template.'); return; } const parsed = parseProductCsv(contents); setIssues(parsed.issues); setModels(parsed.models); return; } if (!lowerName.endsWith('.json')) { const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: 'array', bookSheets: true }); const isPrototypeProduct = looksLikeProductWorkbook(workbook.SheetNames); if (isPrototypeProduct) { if (importMode !== 'CREATE_NEW') { setError('Choose “Create new products” before uploading a product template.'); return; } const parsed = parseProductWorkbook(buffer); setIssues(parsed.issues); setModels(parsed.models); return; } const rates = parseRateUpdateWorkbook(buffer, importMode === 'UPDATE_RATES'); if (rates) { if (!allowRateUpdates) { setError('Rate updates are available from the Bulk upload page.'); return; } if (importMode !== 'UPDATE_RATES') { setError('Choose “Update rates on existing products” before uploading a rate template.'); return; } setIssues(rates.issues); setRateRows(rates.rows); return; } if (importMode !== 'CREATE_NEW') { setError('Choose “Create new products” before uploading a product template.'); return; } const parsed = parseProductWorkbook(buffer); setIssues(parsed.issues); setModels(parsed.models); return; } if (importMode !== 'CREATE_NEW') { setError('JSON product imports require “Create new products” mode.'); return; } const parsed = parseProductJson(await file.text()); setIssues(parsed.issues); setModels(parsed.models); } catch (error) { setModels([]); setRateRows([]); setError(error instanceof Error && /^(Choose an Excel|This file is empty)/.test(error.message) ? error.message : 'This file could not be read. Choose a valid Excel, CSV or JSON file and try again.'); } finally { setBusy(false); } }
  async function importNow() {
    if (!hasRecords || !validated) return;
    setBusy(true); setOperation('Saving…'); setError('');
    try {
      if (rateRows.length) {
        const result = await importRateUpdates(rateRows, setProgress, rateSubmissionId.current);
        if (result.status === 'PARTIAL') {
          const done = new Set((result.completedProductCodes ?? [...new Set(rateRows.map(row => row.productCode.toUpperCase()))].slice(0, result.updatedProductCount)).map(code=>code.toUpperCase()));
          setRateRows(rateRows.filter(row => !done.has(row.productCode.toUpperCase())));
          setRecovery(true); setValidated(false); setValidatedProductCount(null); setIssues([]);
        } else onComplete(null, result.updatedProductCount, result.status, result.failedProductCode, 'RATES');
      } else {
        const result = await importWorkbook(models, setProgress);
        if (result.status === 'PARTIAL') {
          setModels(models.slice(result.importedCount)); setRecovery(true); setValidated(false); setValidatedProductCount(null); setIssues([]);
        } else onComplete(result.productId!, result.importedCount, result.status, undefined, 'PRODUCTS');
      }
    } catch (error) { setValidated(false); showServerError(error); } finally { setBusy(false); }
  }
  const visibleIssues = [...issues, ...serverIssues];
  const fatalIssues = issues.filter((issue) => issue.fatal !== false);
  const invalidRows = issues.filter((issue) => issue.fatal === false).length;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="product-import-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><h3 id="product-import-title">Import products or update rates</h3><p className="muted">Validate a product batch or update rates on existing vendor products.</p></div><button type="button" className="modal-close" disabled={busy} onClick={onClose} aria-label="Close import">×</button></div>
      {error && <ErrorBox error={error} />}
      <div className="import-help"><b>Product imports</b><p>Create products, options, initial rates and availability together in one workbook. Use <b>Products, Options, Ticket types, Rates,</b> and <b>Time slots</b>. In create mode, <b>product_code means your import reference</b> (for example WALK_001): repeat it in linked rows. Voya generates the permanent activity ID after creation. Excel and sectioned CSV templates use the same fields. Limits: 2,000 data rows and 200 products per file. Valid products are saved as drafts for review.</p><div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={() => void downloadSample(true)}>Blank product template (Excel)</button><button type="button" className="btn" disabled={busy} onClick={() => void downloadSample(false)}>Completed product sample (Excel)</button><button type="button" className="btn" onClick={downloadCsvSample}>Product sample CSV</button><button type="button" className="btn" onClick={downloadJsonSample}>Product sample JSON</button></div>{allowRateUpdates && <><b>Rate updates</b><p>Optional later step: update existing INR rates using generated Voya product and option codes from Your products. For USD and other currencies, use the advanced pricing editor. Rate rows are preview-validated before any update is applied.</p><div className="modal-actions"><button type="button" className="btn" onClick={downloadRateSample}>Rate update template (Excel)</button><button type="button" className="btn" onClick={downloadRateCsvSample}>Rate update template (CSV)</button></div></>}</div>
      <div className="import-upload">{allowRateUpdates && <Field label="Import mode"><select aria-label="Import mode" value={importMode} disabled={busy} onChange={(event) => { setImportMode(event.target.value as typeof importMode); resetValidation(); setRecovery(false); if (inputRef.current) inputRef.current.value = ''; setFileName(''); setModels([]); setRateRows([]); setIssues([]); setError(''); }}><option value="CREATE_NEW">Create new products</option><option value="UPDATE_RATES">Update rates on existing products</option></select></Field>}<Field label="Completed Excel, CSV or JSON file"><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.json,application/json,text/csv" disabled={busy} onClick={(event) => { event.currentTarget.value = ''; }} onChange={(event) => void selectFile(event.target.files?.[0])} /></Field>{fileName && <p className="muted">Selected: {fileName}</p>}</div>
      {models.length > 0 && <div className="import-preview"><h4>Product draft preview</h4><p><b>{models.length} {validated ? 'validated' : 'parsed'} product{models.length === 1 ? '' : 's'}</b> · {models.reduce((n, model) => n + model.options.length, 0)} options · {models.reduce((n, model) => n + model.ratePlans.length, 0)} rate plans · {models.reduce((n, model) => n + model.availability.length, 0)} schedules</p>{invalidRows > 0 && <p className="muted">{invalidRows} rows or products with issues are excluded. Download the error rows to correct and re-upload them later.</p>}<small>Each product import reference must be new. Voya generates the activity ID after import. For existing products, edit their drafts or use the separate INR rate-update workflow.</small></div>}
      {rateRows.length > 0 && <div className="import-preview"><h4>Rate update preview</h4><p><b>{rateRows.length} {validated ? 'validated option rate' : 'parsed rate row'}{rateRows.length === 1 ? '' : 's'}</b>{validated && validatedProductCount !== null ? ` across ${validatedProductCount} existing product${validatedProductCount === 1 ? '' : 's'}.` : '. Validate the file to resolve existing product groups.'}</p>{invalidRows > 0 && <p className="muted">{invalidRows} invalid rows will be excluded from the update.</p>}<small>Every product group must pass preview validation before any rate update is applied.</small></div>}
      {validationFailed && <p role="status">0 records are ready to save. Resolve the reported issues and validate again.</p>}
      {visibleIssues.length > 0 && <div className={`alert ${fatalIssues.length || serverIssues.length ? 'error' : 'warning'}`}><b>{fatalIssues.length || serverIssues.length ? 'Fix these blocking import issues before saving:' : 'Some rows need attention; valid records can still be imported:'}</b><button type="button" className="btn" onClick={downloadErrors}>Download error rows</button><ul>{visibleIssues.slice(0, 12).map((issue, index) => <li key={`${issue.sheet}-${issue.row}-${index}`}>{issue.productKey ? `${issue.productKey} · ` : ''}{issue.path || <>{issue.sheet}{issue.cell ? `!${issue.cell}` : `, row ${issue.row}`}</>}: {issue.message}{issue.value !== undefined && issue.value !== '' && <> Entered value: <code>{issue.value}</code>.</>}{issue.fatal === false ? ' (excluded)' : ''}{issue.correction && <p><b>How to fix:</b> {issue.correction}</p>}</li>)}{visibleIssues.length > 12 && <li>…and {visibleIssues.length - 12} more issues.</li>}</ul></div>}
      {progress && <div className={`alert ${recovery ? 'warning' : 'success'}`} role="status">{progress}</div>}
      {recovery && <div className="import-preview"><b>Only unsaved records remain in this preview.</b><p>Download them to correct any issues. Previously saved records have been removed to prevent duplicate imports.</p><button type="button" className="btn" onClick={downloadRecovery}>Download remaining records</button></div>}
      <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="btn" disabled={busy || !hasRecords || Boolean(fatalIssues.length)} onClick={() => void validateNow()}>{busy ? operation : validated ? 'Validate again' : 'Validate file'}</button><button type="button" className="btn primary" disabled={busy || !hasRecords || !validated || Boolean(fatalIssues.length)} onClick={() => void importNow()}>{busy ? operation : importMode === 'UPDATE_RATES' ? `Apply valid rate updates${rateRows.length ? ` (${rateRows.length})` : ''}` : `Import valid products${models.length ? ` (${models.length})` : ''}`}</button></div>
    </div>
  </div>;
}
