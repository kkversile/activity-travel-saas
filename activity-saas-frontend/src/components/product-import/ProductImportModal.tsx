import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../api';
import { ErrorBox, Field } from '../Ui';
import { createRateUpdateTemplateCsv, createRateUpdateWorkbook, createSampleImportCsv, createSampleImportJson, createSampleWorkbook, PROTOTYPE_IMPORT_SHEETS, parseProductCsv, parseProductJson, parseProductWorkbook, parseRateUpdateCsv, parseRateUpdateWorkbook, type ImportIssue, type ImportWorkbookModel, type RateUpdateImportRow, text } from './productImport';

type Props = { onClose: () => void; onComplete: (productId: string | null, importedCount: number, status: 'COMPLETED' | 'PARTIAL', failure?: string, importType?: 'PRODUCTS' | 'RATES') => void; allowRateUpdates?: boolean };

export function downloadProductImportTemplate() { XLSX.writeFile(createSampleWorkbook(), 'voya-product-import-sample.xlsx'); }
export function downloadRateUpdateImportTemplate() { XLSX.writeFile(createRateUpdateWorkbook(), 'voya-rate-update-template.xlsx'); }

export async function importWorkbook(models: ImportWorkbookModel[], onProgress: (value: string) => void) {
  onProgress(`Validating ${models.length} product${models.length === 1 ? '' : 's'} and saving drafts…`);
  const payloads = models.map((model) => ({
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
  const imported = models.length === 1
    ? await api.request<{ productId: string }>('/products/import/json', { method: 'POST', body: JSON.stringify(payloads[0]) })
    : await api.request<{ status: 'COMPLETED' | 'PARTIAL'; importedCount: number; failedProductIndex?: number; products: Array<{ productId: string }> }>('/products/import/batch', { method: 'POST', body: JSON.stringify({ products: payloads }) });
  const productId = 'productId' in imported ? imported.productId : imported.products?.[0]?.productId;
  const importedCount = 'productId' in imported ? 1 : imported.importedCount;
  const status = 'productId' in imported ? 'COMPLETED' : imported.status;
  const failedProductIndex = 'productId' in imported ? undefined : imported.failedProductIndex;
  if (!productId) throw new Error('The import completed without returning a product ID.');
  onProgress(status === 'PARTIAL'
    ? `Import stopped at product ${failedProductIndex}. ${importedCount} drafts were saved; resolve the failed product, then upload only its rows. Do not retry the full batch because those drafts already exist.`
    : `Import complete. ${importedCount} draft${importedCount === 1 ? '' : 's'} saved.`);
  return { productId, importedCount, status, failedProductIndex };
}

export async function importRateUpdates(rows: RateUpdateImportRow[], onProgress: (value: string) => void) {
  onProgress(`Preview-validating ${rows.length} rate update${rows.length === 1 ? '' : 's'}…`);
  const result = await api.request<{ status: 'COMPLETED' | 'PARTIAL'; updatedProductCount: number; failedProductCode?: string }>('/products/rates/import/batch', { method: 'POST', body: JSON.stringify({ rows }) });
  onProgress(result.status === 'PARTIAL'
    ? `Rate updates stopped at product ${result.failedProductCode}; ${result.updatedProductCount} product groups were applied. The remaining rows must be retried separately.`
    : `Rate update complete. ${result.updatedProductCount} product groups were updated.`);
  return result;
}

export default function ProductImportModal({ onClose, onComplete, allowRateUpdates = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [models, setModels] = useState<ImportWorkbookModel[]>([]);
  const [rateRows, setRateRows] = useState<RateUpdateImportRow[]>([]);
  const [importMode, setImportMode] = useState<'CREATE_NEW' | 'UPDATE_RATES'>('CREATE_NEW');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  function downloadSample() { downloadProductImportTemplate(); }
  function downloadRateSample() { downloadRateUpdateImportTemplate(); }
  function downloadRateCsvSample() { const blob = new Blob([createRateUpdateTemplateCsv()], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-rate-update-template.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  function downloadCsvSample() { const blob = new Blob([createSampleImportCsv()], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-product-import-sample.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  function downloadJsonSample() { const blob = new Blob([JSON.stringify(createSampleImportJson(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-product-import-sample.json'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  function downloadErrors() { const rowFields = [...new Set(issues.flatMap((issue) => Object.keys(issue.rowData || {})))]; const columns = ['sheet', 'row', 'product_key', ...rowFields, 'message']; const csv = [columns.join(','), ...issues.map((issue) => columns.map((column) => { const value = column === 'sheet' ? issue.sheet : column === 'row' ? issue.row : column === 'product_key' ? issue.productKey || issue.rowData?.product_key || '' : column === 'message' ? issue.message : issue.rowData?.[column] ?? ''; return `"${String(value).replaceAll('"', '""')}"`; }).join(','))].join('\r\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'voya-product-import-errors.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  async function selectFile(file: File | undefined) { if (!file) return; setFileName(file.name); setError(''); setModels([]); setRateRows([]); setIssues([]); const lowerName = file.name.toLowerCase(); if (lowerName.endsWith('.csv')) { const contents = await file.text(); const rates = parseRateUpdateCsv(contents); if (rates) { if (!allowRateUpdates) { setError('Rate updates are available from the Bulk upload page.'); return; } if (importMode !== 'UPDATE_RATES') { setError('Choose “Update existing rates” before uploading a rate template.'); return; } setIssues(rates.issues); setRateRows(rates.rows); return; } if (importMode !== 'CREATE_NEW') { setError('Choose “Create new products” before uploading a product template.'); return; } const parsed = parseProductCsv(contents); setIssues(parsed.issues); setModels(parsed.models); return; } if (!lowerName.endsWith('.json')) { const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: 'array', bookSheets: true }); const isPrototypeProduct = PROTOTYPE_IMPORT_SHEETS.every((sheet) => workbook.SheetNames.includes(sheet)); if (isPrototypeProduct) { if (importMode !== 'CREATE_NEW') { setError('Choose “Create new products” before uploading a product template.'); return; } const parsed = parseProductWorkbook(buffer); setIssues(parsed.issues); setModels(parsed.models); return; } const rates = parseRateUpdateWorkbook(buffer); if (rates) { if (!allowRateUpdates) { setError('Rate updates are available from the Bulk upload page.'); return; } if (importMode !== 'UPDATE_RATES') { setError('Choose “Update existing rates” before uploading a rate template.'); return; } setIssues(rates.issues); setRateRows(rates.rows); return; } if (importMode !== 'CREATE_NEW') { setError('Choose “Create new products” before uploading a product template.'); return; } const parsed = parseProductWorkbook(buffer); setIssues(parsed.issues); setModels(parsed.models); return; } if (importMode !== 'CREATE_NEW') { setError('JSON product imports require “Create new products” mode.'); return; } const parsed = parseProductJson(await file.text()); setIssues(parsed.issues); setModels(parsed.models); }
  async function importNow() { if (!models.length && !rateRows.length) return; setBusy(true); setError(''); try { if (rateRows.length) { const result = await importRateUpdates(rateRows, setProgress); onComplete(null, result.updatedProductCount, result.status, result.failedProductCode, 'RATES'); } else { const result = await importWorkbook(models, setProgress); onComplete(result.productId, result.importedCount, result.status, result.failedProductIndex == null ? undefined : String(result.failedProductIndex), 'PRODUCTS'); } } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  const total = rateRows.length || models.reduce((count, model) => count + model.options.length + model.ratePlans.length + model.availability.length, 0);
  const fatalIssues = issues.filter((issue) => issue.fatal !== false);
  const invalidRows = issues.filter((issue) => issue.fatal === false).length;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="product-import-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><h3 id="product-import-title">Import products or update rates</h3><p className="muted">Validate a product batch or update rates on existing vendor products.</p></div><button type="button" className="modal-close" disabled={busy} onClick={onClose} aria-label="Close import">×</button></div>
      {error && <ErrorBox error={error} />}
      <div className="import-help"><b>Product imports</b><p>Use the prototype sheets <b>Products, Options, Ticket types, Rates,</b> and <b>Time slots</b>. Link every related row with its <b>product_code</b> and option_code. Excel and sectioned CSV templates use the same fields. Valid products are saved as drafts for review.</p><div className="modal-actions"><button type="button" className="btn" onClick={downloadSample}>Product template (Excel)</button><button type="button" className="btn" onClick={downloadCsvSample}>Product sample CSV</button><button type="button" className="btn" onClick={downloadJsonSample}>Product sample JSON</button></div>{allowRateUpdates && <><b>Rate updates</b><p>Use existing product and option codes. Rate rows are preview-validated before any update is applied.</p><div className="modal-actions"><button type="button" className="btn" onClick={downloadRateSample}>Rate update template (Excel)</button><button type="button" className="btn" onClick={downloadRateCsvSample}>Rate update template (CSV)</button></div></>}</div>
      <div className="import-upload">{allowRateUpdates && <Field label="Import mode"><select aria-label="Import mode" value={importMode} disabled={busy} onChange={(event) => { setImportMode(event.target.value as typeof importMode); setFileName(''); setModels([]); setRateRows([]); setIssues([]); setError(''); }}><option value="CREATE_NEW">Create new products</option><option value="UPDATE_RATES">Update rates on existing products</option></select></Field>}<Field label="Completed Excel, CSV or JSON file"><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.json,application/json,text/csv" disabled={busy} onChange={(event) => void selectFile(event.target.files?.[0])} /></Field>{fileName && <p className="muted">Selected: {fileName}</p>}</div>
      {models.length > 0 && <div className="import-preview"><h4>Product draft preview</h4><p><b>{models.length} valid product{models.length === 1 ? '' : 's'}</b> · {models.reduce((n, model) => n + model.options.length, 0)} options · {models.reduce((n, model) => n + model.ratePlans.length, 0)} rate plans · {models.reduce((n, model) => n + model.availability.length, 0)} schedules</p>{invalidRows > 0 && <p className="muted">{invalidRows} rows or products with issues are excluded. Download the error rows to correct and re-upload them later.</p>}<small>Existing product codes are rejected by create mode; use the separate rate update template for existing products.</small></div>}
      {rateRows.length > 0 && <div className="import-preview"><h4>Rate update preview</h4><p><b>{rateRows.length} valid option rate{rateRows.length === 1 ? '' : 's'}</b> across {new Set(rateRows.map((row) => row.productCode.toUpperCase())).size} existing products.</p>{invalidRows > 0 && <p className="muted">{invalidRows} invalid rows will be excluded from the update.</p>}<small>Every product group must pass preview validation before any rate update is applied.</small></div>}
      {issues.length > 0 && <div className={`alert ${fatalIssues.length ? 'error' : 'warning'}`}><b>{fatalIssues.length ? 'Fix these blocking import issues before saving:' : 'Some rows need attention; valid records can still be imported:'}</b><button type="button" className="btn" onClick={downloadErrors}>Download error rows</button><ul>{issues.slice(0, 12).map((issue, index) => <li key={`${issue.sheet}-${issue.row}-${index}`}>{issue.productKey ? `${issue.productKey} · ` : ''}{issue.sheet}, row {issue.row}: {issue.message}{issue.fatal === false ? ' (excluded)' : ''}</li>)}{issues.length > 12 && <li>…and {issues.length - 12} more issues.</li>}</ul></div>}
      {progress && <div className="alert success" role="status">{progress}</div>}
      <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || (!models.length && !rateRows.length) || Boolean(fatalIssues.length)} onClick={() => void importNow()}>{busy ? 'Saving…' : rateRows.length ? `Apply valid rate updates (${rateRows.length})` : `Import valid products${models.length ? ` (${models.length})` : ''}`}</button></div>
    </div>
  </div>;
}
