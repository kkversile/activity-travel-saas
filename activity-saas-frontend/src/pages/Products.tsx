import { useEffect, useRef, useState } from 'react';
import { api, distributionReasonLabel, type Product, type ProductLifecycleAction, type ProductListingItem, type ProductListingResponse } from '../api';
import { ConfirmDialog, ErrorBox, Loading } from '../components/Ui';
import ProductImportModal from '../components/product-import/ProductImportModal';
import '../components/bookability-tooltip.css';
import ProductBuilder from './ProductBuilder';

export function formatRelativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60); if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const statusLabel: Record<ProductListingItem['displayStatus'], string> = { PUBLISHED: 'Live', UNDER_REVIEW: 'Under review', DRAFT: 'Draft', NEEDS_CHANGES: 'Needs changes', SUSPENDED: 'Suspended', ARCHIVED: 'Archived' };
const bookabilityLabel: Record<ProductListingItem['bookability']['status'], string> = { BOOKABLE: 'Bookable', NOT_BOOKABLE: 'Not bookable', LOW_INVENTORY: 'Low inventory', NOT_EVALUATED: 'Not evaluated' };
const bookabilityReasonLabel: Record<string, string> = {
  PRODUCT_NOT_LIVE: 'Product is not live with a published revision',
  COMMERCIAL_NOT_READY: 'Commercial pricing is incomplete or not active',
  RATE_PLAN_NOT_MAPPED: 'No active rate plan is mapped to an operating schedule',
  INVENTORY_OR_RESOURCE_NOT_READY: 'A future session has no available capacity or required resources',
  NO_FUTURE_SESSION: 'No future open session is available',
};
const bookableChecks = ['Live product with a published revision', 'Active rate plan with commercial pricing', 'Cancellation policy configured', 'Rate plan mapped to an active schedule', 'Future session with available capacity', 'Booking cutoff is open', 'Required operational resources ready'];
function bookabilityExplanation(item: ProductListingItem) {
  if (item.bookability.status === 'BOOKABLE') return bookableChecks;
  const reasons = item.bookability.reasonCodes.map((code) => bookabilityReasonLabel[code] || code.replaceAll('_', ' ').toLowerCase());
  return reasons.length ? reasons : ['Bookability has not been evaluated yet'];
}
const distributionLabel = (item: ProductListingItem) => item.distribution?.ready ? 'Agent ready' : 'Distribution pending';
const distributionReason = (item: ProductListingItem) => distributionReasonLabel[item.distribution?.reasonCodes[0] || ''] || 'Complete Agent Marketplace connection';
const actionLabel: Record<ProductLifecycleAction, string> = { OPEN: 'View', FIX: 'Fix', EDIT: 'Edit', SUBMIT: 'Submit', DELETE: 'Delete', WITHDRAW: 'Withdraw', DEACTIVATE: 'Deactivate', REACTIVATE: 'Reactivate', ARCHIVE: 'Archive' };
type PendingAction = { item: ProductListingItem; action: Exclude<ProductLifecycleAction, 'OPEN' | 'FIX' | 'EDIT' | 'SUBMIT'> } | null;

function confirmationText(action: NonNullable<PendingAction>['action']): [string, string] {
  return {
    DELETE: ['Delete draft product?', 'This draft will be removed from your workspace. Published products and products with bookings cannot be deleted.'],
    WITHDRAW: ['Withdraw submission?', 'The product will return to Draft and can be edited before submitting again.'],
    DEACTIVATE: ['Deactivate live product?', 'The product will stop accepting new marketplace bookings. Existing bookings are retained.'],
    REACTIVATE: ['Reactivate product?', 'The product will become Live again using its published revision.'],
    ARCHIVE: ['Archive product?', 'The suspended product will be removed from active catalogue views. Its history is retained and it can be restored later.'],
  }[action] as [string, string];
}

export default function Products() {
  const [data, setData] = useState<ProductListingResponse | null>(null); const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'LIVE' | 'REVIEW' | 'DRAFT' | 'SUSPENDED' | 'ARCHIVED'>(''); const [page, setPage] = useState(1); const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [selected, setSelected] = useState<Product | null>(null); const [wizardOpen, setWizardOpen] = useState(false); const [startStep, setStartStep] = useState<1 | 6>(1); const [importOpen, setImportOpen] = useState(false); const [pending, setPending] = useState<PendingAction>(null); const [busy, setBusy] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null); const triggerRef = useRef<HTMLButtonElement | null>(null); const rowTriggers = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); setError(''); const params = new URLSearchParams({ search, page: String(page), limit: '25' }); if (status) params.set('status', status); api.request<ProductListingResponse>(`/products/listing?${params}`).then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false)); }, 250); return () => window.clearTimeout(timer); }, [search, status, page, reload]);
  function openCreate() { triggerRef.current = createButtonRef.current; setStartStep(1); setSelected(null); setWizardOpen(true); }
  function openEdit(item: ProductListingItem, initialStep: 1 | 6 = 1) { triggerRef.current = rowTriggers.current[item.id]; setStartStep(initialStep); setSelected({ id: item.id } as Product); setWizardOpen(true); }
  function closeWizard() { setWizardOpen(false); setSelected(null); setReload((value) => value + 1); window.setTimeout(() => triggerRef.current?.focus(), 0); }
  async function confirmAction() { if (!pending) return; setBusy(true); setError(''); try { const path = pending.action === 'WITHDRAW' ? `/product-revisions/${pending.item.workingRevisionId}/withdraw` : pending.action === 'DELETE' ? `/products/${pending.item.id}` : `/products/${pending.item.id}/${pending.action.toLowerCase()}`; await api.request(path, { method: pending.action === 'DELETE' ? 'DELETE' : 'POST' }); setPending(null); setReload((value) => value + 1); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  const summary = data?.summary || { live: 0, review: 0, draft: 0 };
  return <div className="products-page"><div className="products-heading"><div><h2>Products</h2><p>Build one canonical experience, then manage options, rates and inventory underneath it.</p></div><div className="products-heading-actions"><button className="btn" onClick={() => setImportOpen(true)}>Import Experience</button><button ref={createButtonRef} className="btn accent" onClick={openCreate}>+ Create experience</button></div></div>
    <div className="products-toolbar"><label className="search-field"><span className="sr-only">Search products</span><input placeholder="Search products…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label><div className="summary-filters"><button className={status === 'LIVE' ? 'summary-filter active success' : 'summary-filter success'} onClick={() => { setStatus(status === 'LIVE' ? '' : 'LIVE'); setPage(1); }}><b>{summary.live}</b> Live</button><button className={status === 'REVIEW' ? 'summary-filter active warning' : 'summary-filter warning'} onClick={() => { setStatus(status === 'REVIEW' ? '' : 'REVIEW'); setPage(1); }}><b>{summary.review}</b> Review</button><button className={status === 'DRAFT' ? 'summary-filter active' : 'summary-filter'} onClick={() => { setStatus(status === 'DRAFT' ? '' : 'DRAFT'); setPage(1); }}><b>{summary.draft}</b> Draft</button><select aria-label="More product statuses" value={status === 'SUSPENDED' || status === 'ARCHIVED' ? status : ''} onChange={(e) => { setStatus((e.target.value || '') as typeof status); setPage(1); }}><option value="">More statuses</option><option value="SUSPENDED">Suspended</option><option value="ARCHIVED">Archived</option></select></div></div>
    <section className="products-table-card" aria-live="polite">{error && <ErrorBox error={error} />}{!error && loading && !data ? <Loading text="Loading products…" /> : !error && data?.items.length ? <div className="products-table-scroll"><table className="products-table"><thead><tr><th>Experience</th><th>Destination</th><th>Options</th><th>Bookability</th><th>Distribution</th><th>Quality</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.items.map((item) => { const actions = item.actions || [item.action]; const explanation = bookabilityExplanation(item); const tooltipId = `bookability-${item.id}`; return <tr key={item.id}><td><div className="product-name-cell"><b>{item.experienceName}</b><small>{item.productCode} · Updated {formatRelativeTime(item.updatedAt)}</small></div></td><td>{item.destination || '—'}</td><td>{item.optionCount}</td><td><span className="bookability-tooltip-wrap"><span className={`table-status ${item.bookability.status.toLowerCase()}`} tabIndex={0} aria-describedby={tooltipId}>{bookabilityLabel[item.bookability.status]}</span><span id={tooltipId} className="bookability-tooltip" role="tooltip"><b>{bookabilityLabel[item.bookability.status]} because:</b><ul>{explanation.map((reason) => <li key={reason}>{reason}</li>)}</ul></span></span></td><td title={item.distribution?.reasonCodes.join(', ')}><span className={`table-status ${item.distribution?.ready ? 'ready' : 'pending'}`}>{distributionLabel(item)}</span>{!item.distribution?.ready && <small className="table-status-reason">{distributionReason(item)}</small>}</td><td>{item.quality.score === null ? <span className="muted">Not scored</span> : item.quality.score}</td><td><span className={`table-status ${item.displayStatus.toLowerCase()}`}>{statusLabel[item.displayStatus]}</span></td><td><div className="product-row-actions">{actions.map((action) => action === 'OPEN' || action === 'FIX' || action === 'EDIT' || action === 'SUBMIT' ? <button key={action} aria-label={action === 'OPEN' ? 'Open' : undefined} ref={(action === 'OPEN' || action === 'FIX' || action === 'EDIT' || action === 'SUBMIT') ? (node) => { rowTriggers.current[item.id] = node; } : undefined} className="table-action" onClick={() => openEdit(item, action === 'SUBMIT' ? 6 : 1)}>{actionLabel[action]}</button> : <button key={action} className={`table-action lifecycle-${action.toLowerCase()}`} onClick={() => setPending({ item, action: action as NonNullable<PendingAction>['action'] })}>{actionLabel[action]}</button>)}</div></td></tr>; })}</tbody></table></div> : !error ? <div className="products-empty"><h3>{search || status ? 'No products match these filters' : 'No products yet'}</h3><p>{search || status ? 'Try clearing the search or status filter.' : 'Create your first experience to start building the catalogue.'}</p></div> : null}{data && data.pagination.totalPages > 1 && <div className="products-pagination"><span>Page {data.pagination.page} of {data.pagination.totalPages}</span><div><button className="btn small" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="btn small" disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}</section>
    {importOpen && <ProductImportModal onClose={() => setImportOpen(false)} onComplete={(productId) => { setImportOpen(false); setStartStep(1); setSelected({ id: productId } as Product); setWizardOpen(true); setPage(1); setReload((value) => value + 1); }} />}{wizardOpen && <ProductBuilder key={selected?.id || 'create'} product={selected} initialStep={startStep} onDone={closeWizard} onChanged={() => { setPage(1); setReload((value) => value + 1); }} />}{pending && <ConfirmDialog title={confirmationText(pending.action)[0]} message={confirmationText(pending.action)[1]} confirmLabel={actionLabel[pending.action]} onCancel={() => { if (!busy) setPending(null); }} onConfirm={() => void confirmAction()} busy={busy} />}
  </div>;
}
