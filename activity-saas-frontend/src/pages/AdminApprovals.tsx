import { useEffect, useState } from 'react';
import { api, type VendorOnboardingApplication } from '../api';
import { ErrorBox, Loading, Panel } from '../components/Ui';
import AdminOnboardingReviewModal from '../components/AdminOnboardingReviewModal';

type Approval = { id: string; publicCode?: string | null; type: 'VENDOR' | 'PRODUCT' | 'AGENT' | 'REFUND' | 'PAYOUT' | 'AGENT_WALLET_CREDIT' | 'AGENT_COMMERCIAL' | 'AGENT_TIER_DEFAULTS'; title: string; status: string; ownerId?: string | null; ownerName?: string | null; requesterName?: string | null; canDecide?: boolean; amount?: number; currency?: string; proposedConfiguration?: unknown; requestReason?: string; updatedAt: string };

export default function AdminApprovals({ onNavigate }: { onNavigate: (page: 'vendors' | 'products' | 'agents' | 'refunds' | 'settlements') => void }) {
  const [rows, setRows] = useState<Approval[]>([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [verifyingDocumentId, setVerifyingDocumentId] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ fileName: string; url: string; mimeType: string } | null>(null);
  const [error, setError] = useState('');
  const [vendorReview, setVendorReview] = useState<{ row: Approval; vendorName: string; application: VendorOnboardingApplication | null; loading: boolean; error: string } | null>(null);

  async function load() {
    setLoading(true); setError('');
    try { setRows(await api.request<Approval[]>(`/admin/approvals${type ? `?type=${encodeURIComponent(type)}` : ''}`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [type]);

  async function reviewVendor(row: Approval) {
    if (!row.ownerId) { onNavigate('vendors'); return; }
    setVendorReview({ row, vendorName: row.ownerName || row.title, application: null, loading: true, error: '' });
    try {
      const [vendor, result] = await Promise.all([
        api.request<any>(`/admin/vendors/${row.ownerId}`),
        api.request<{ vendorOnboarding: VendorOnboardingApplication | null }>(`/admin/vendors/${row.ownerId}/onboarding`),
      ]);
      setVendorReview({
        row,
        vendorName: vendor.vendorProfile?.legalBusinessName || vendor.name || row.ownerName || row.title,
        application: result.vendorOnboarding || null,
        loading: false,
        error: '',
      });
    } catch (e) {
      setVendorReview((current) => current ? { ...current, loading: false, error: e instanceof Error ? e.message : String(e) } : current);
    }
  }

  async function refreshVendorApplication(row: Approval) {
    if (!row.ownerId) return;
    const result = await api.request<{ vendorOnboarding: VendorOnboardingApplication | null }>(`/admin/vendors/${row.ownerId}/onboarding`);
    setVendorReview((current) => current?.row.id === row.id ? { ...current, application: result.vendorOnboarding, loading: false } : current);
  }

  async function previewVendorDocument(fileAssetId: string, fileName: string, mimeType: string) {
    try {
      const blob = await api.blob(`/files/${fileAssetId}/content`);
      if (documentPreview) URL.revokeObjectURL(documentPreview.url);
      setDocumentPreview({ fileName, url: URL.createObjectURL(blob), mimeType });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function reviewVendorDocument(row: Approval, versionId: string, status: 'VERIFIED' | 'REJECTED') {
    if (!row.ownerId || verifyingDocumentId) return;
    const reason = status === 'REJECTED' ? window.prompt('Reason for rejecting this document')?.trim() : '';
    if (status === 'REJECTED' && !reason) return;
    setVerifyingDocumentId(versionId); setError('');
    try {
      await api.request(`/admin/vendors/${row.ownerId}/documents/versions/${versionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      });
      await refreshVendorApplication(row);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setVerifyingDocumentId(null); }
  }

  function closeDocumentPreview() {
    if (documentPreview) URL.revokeObjectURL(documentPreview.url);
    setDocumentPreview(null);
  }

  const openTarget = (row: Approval) => {
    if (row.type === 'VENDOR') { void reviewVendor(row); return; }
    onNavigate(row.type === 'PRODUCT' ? 'products' : row.type === 'AGENT' || row.type === 'AGENT_WALLET_CREDIT' || row.type === 'AGENT_COMMERCIAL' || row.type === 'AGENT_TIER_DEFAULTS' ? 'agents' : row.type === 'REFUND' ? 'refunds' : 'settlements');
  };

  async function decide(row: Approval, decision: 'approve' | 'reject') {
    if (!row.ownerId && row.type !== 'PRODUCT') return;
    const reason = decision === 'reject' ? window.prompt(`Reason for rejecting ${row.title}`)?.trim() : '';
    if (decision === 'reject' && !reason) return;
    setBusyId(`${row.type}-${row.id}`); setError('');
    try {
      if (row.type === 'VENDOR') {
        await api.request(`/admin/vendors/${row.ownerId}/verification`, { method: 'PATCH', body: JSON.stringify({ status: decision === 'approve' ? 'VERIFIED' : 'SUSPENDED', ...(reason ? { reason } : {}) }) });
      } else if (row.type === 'PRODUCT') {
        await api.request(`/admin/product-revisions/${row.id}/${decision === 'approve' ? 'publish' : 'reject'}`, { method: 'POST', ...(reason ? { body: JSON.stringify({ reason }) } : {}) });
      } else if (row.type === 'AGENT' && decision === 'approve') {
        await api.request(`/admin/agents/${row.ownerId}/approve`, { method: 'POST' });
      } else if (row.type === 'AGENT_WALLET_CREDIT') {
        await api.request(`/admin/agent-wallet-credit-requests/${row.id}/${decision}`, { method: 'POST', ...(reason ? { body: JSON.stringify({ reason }) } : {}) });
      } else if (row.type === 'AGENT_COMMERCIAL') {
        await api.request(`/admin/agent-commercial-change-requests/${row.id}/${decision}`, { method: 'POST', ...(reason ? { body: JSON.stringify({ reason }) } : {}) });
      } else if (row.type === 'AGENT_TIER_DEFAULTS') {
        await api.request(`/admin/agent-tier-change-requests/${row.id}/${decision}`, { method: 'POST', ...(reason ? { body: JSON.stringify({ reason }) } : {}) });
      } else {
        openTarget(row); return;
      }
      if (row.type === 'VENDOR') setVendorReview(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(''); }
  }

  return <div className="admin-products-page">
    {error && <ErrorBox error={error} />}
    <div className="admin-hero"><div><h2>Approvals</h2><p className="muted">Nothing a vendor or agent submits reaches customers until someone here approves it. Every decision is logged.</p></div><button className="btn small" onClick={() => void load()}>Refresh</button></div>
    <Panel title={`${rows.length} items waiting`}>
      <div className="form-grid three"><label className="field"><span>Approval type</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option><option value="VENDOR">Vendor</option><option value="PRODUCT">Activity</option><option value="AGENT">Travel agent</option><option value="AGENT_COMMERCIAL">Agent commercial terms</option><option value="AGENT_TIER_DEFAULTS">Agent tier defaults</option><option value="REFUND">Refund</option><option value="PAYOUT">Payout</option><option value="AGENT_WALLET_CREDIT">Agent wallet credit</option></select></label><div className="muted approval-summary">Sorted oldest first so SLA work is visible.</div></div>
      {loading ? <Loading text="Loading approvals…" /> : <div className="table-wrap"><table><thead><tr><th>Item</th><th>Submitted by</th><th>Submitted</th><th>Checks</th><th /></tr></thead><tbody>{rows.map((row) => { const key = `${row.type}-${row.id}`; const actionable = row.type === 'VENDOR' || row.type === 'PRODUCT' || row.type === 'AGENT' || row.type === 'AGENT_WALLET_CREDIT' || row.type === 'AGENT_COMMERCIAL' || row.type === 'AGENT_TIER_DEFAULTS'; const makerCheck = row.type === 'AGENT_WALLET_CREDIT' || row.type === 'AGENT_COMMERCIAL' || row.type === 'AGENT_TIER_DEFAULTS'; const decisionDisabled = busyId === key || (makerCheck && row.canDecide === false); return <tr key={key}><td><span className="badge">{row.type === 'PRODUCT' ? 'ACTIVITY' : row.type.replaceAll('_', ' ')}</span><br /><b>{row.title}</b><small className="mono">{row.publicCode || row.id}</small>{row.type === 'AGENT_WALLET_CREDIT' && row.amount != null && <small>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: row.currency || 'INR' }).format(row.amount)}</small>}{(row.type === 'AGENT_COMMERCIAL' || row.type === 'AGENT_TIER_DEFAULTS') && <><small>{JSON.stringify(row.proposedConfiguration)}</small><small>Reason: {row.requestReason}</small></>}</td><td>{makerCheck ? <>{row.requesterName || 'Admin'}<small>{row.type === 'AGENT_TIER_DEFAULTS' ? 'All travel agents' : `Agent · ${row.ownerName || row.ownerId || '—'}`}</small></> : row.ownerName || row.ownerId || '—'}</td><td>{new Date(row.updatedAt).toLocaleString()}</td><td>{row.status}{makerCheck && row.canDecide === false && <small>Requested by you</small>}</td><td><div className="status-actions"><button className="btn small" onClick={() => openTarget(row)}>{row.type === 'VENDOR' ? 'View' : 'Review'}</button>{actionable && <>{row.type !== 'AGENT' && <button className="btn small primary" disabled={decisionDisabled} onClick={() => void decide(row, 'approve')}>{busyId === key ? 'Saving…' : 'Approve'}</button>}{row.type !== 'AGENT' && <button className="btn small" disabled={decisionDisabled} onClick={() => void decide(row, 'reject')}>Reject</button>}{row.type === 'AGENT' && <button className="btn small primary" disabled={busyId === key} onClick={() => void decide(row, 'approve')}>{busyId === key ? 'Saving…' : 'Approve'}</button>}</>}</div></td></tr>; })}</tbody></table>{!rows.length && <div className="empty">No approval items match this filter.</div>}</div>}
    </Panel>
    {vendorReview && (vendorReview.application
      ? <AdminOnboardingReviewModal application={vendorReview.application} vendorName={vendorReview.vendorName} onClose={() => setVendorReview(null)} onReview={() => undefined} onReopen={() => undefined} readOnly reviewActions={{ onApprove: () => void decide(vendorReview.row, 'approve'), onReject: () => void decide(vendorReview.row, 'reject'), busy: busyId === `VENDOR-${vendorReview.row.id}` }} documentActions={{ onView: (fileAssetId, fileName, mimeType) => void previewVendorDocument(fileAssetId, fileName, mimeType), onVerify: (versionId) => void reviewVendorDocument(vendorReview.row, versionId, 'VERIFIED'), onReject: (versionId) => void reviewVendorDocument(vendorReview.row, versionId, 'REJECTED'), verifyingVersionId: verifyingDocumentId }} />
      : <div className="modal-backdrop admin-onboarding-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setVendorReview(null); }}><div className="modal-card admin-approval-review-state" role="dialog" aria-modal="true" aria-labelledby="approval-vendor-review-title"><div className="panel-head"><h3 id="approval-vendor-review-title">{vendorReview.vendorName}</h3><button type="button" className="modal-close" onClick={() => setVendorReview(null)} aria-label="Close review">×</button></div>{vendorReview.loading ? <Loading text="Loading vendor application…" /> : vendorReview.error ? <ErrorBox error={vendorReview.error} /> : <p className="muted">No onboarding application was found for this vendor.</p>}<div className="modal-actions"><button type="button" className="btn primary" onClick={() => setVendorReview(null)}>Close review</button></div></div></div>)}
    {documentPreview && <div className="doc-preview-backdrop admin-onboarding-document-preview" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDocumentPreview(); }}><div className="doc-preview" role="dialog" aria-modal="true" aria-label={documentPreview.fileName} onMouseDown={(event) => event.stopPropagation()}><div className="panel-head"><h3>{documentPreview.fileName}</h3><div className="doc-preview-actions"><a className="btn small" href={documentPreview.url} target="_blank" rel="noreferrer">Open in new tab</a><a className="btn small" href={documentPreview.url} download={documentPreview.fileName}>Download</a><button className="btn small" onClick={closeDocumentPreview}>Close</button></div></div>{documentPreview.mimeType === 'application/pdf' ? <iframe title={documentPreview.fileName} src={documentPreview.url} /> : <img alt={documentPreview.fileName} src={documentPreview.url} />}</div></div>}
  </div>;
}
