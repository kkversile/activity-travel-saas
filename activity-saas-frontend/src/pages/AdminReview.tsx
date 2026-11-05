import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBox, Panel } from '../components/Ui';
import ExperienceWizardModal from '../components/product-wizard/ExperienceWizardModal';

type Review = { id: string; productId: string; versionNumber: number; status: string; productName: string; variants?: Array<{ ratePlans: unknown[] }>; product: { productCode: string; tenant: { name: string; vendorProfile?: { legalBusinessName?: string | null } | null }; variants: Array<{ ratePlans: unknown[] }> } };

export default function AdminReview() {
  const [items, setItems] = useState<Review[]>([]); const [selected, setSelected] = useState<Review | null>(null); const [error, setError] = useState(''); const [reason, setReason] = useState(''); const [rejecting, setRejecting] = useState<string | null>(null);
  const load = () => api.request<Review[]>('/admin/product-revisions/review').then(setItems).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  async function act(id: string, action: 'publish' | 'reject') { try { await api.request(`/admin/product-revisions/${id}/${action}`, { method: 'POST', ...(action === 'reject' ? { body: JSON.stringify({ reason }) } : {}) }); setRejecting(null); setSelected(null); setReason(''); void load(); } catch (e) { setError((e as Error).message); } }
  function openDetails(review: Review) { setSelected(review); }
  return <>
    <div className="admin-hero"><div><h2>Product revision review queue</h2><p className="muted">Inspect the submitted product details before publishing or rejecting the revision.</p></div><span className="badge pending">{items.length} awaiting review</span></div>
    {error && <ErrorBox error={error} />}
    <Panel><div className="panel-body">{!items.length ? <div className="empty">No product revisions are waiting for review.</div> : items.map((r) => { const rowVariants = r.variants ?? r.product.variants ?? []; return <div className="admin-review-row" key={r.id}>
      <div><b>{r.product.productCode} · Revision v{r.versionNumber}</b><small>{r.product.tenant.vendorProfile?.legalBusinessName || r.product.tenant.name}</small><small>{r.productName} · {rowVariants.length} variants · {rowVariants.reduce((n, v) => n + v.ratePlans.length, 0)} rate plans</small></div><Badge value={r.status} /><div className="status-actions"><button className="btn small" onClick={() => openDetails(r)}>View details</button><button className="btn small primary" onClick={() => void act(r.id, 'publish')}>Publish</button><button className="btn small" onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>Reject</button></div>
      {rejecting === r.id && <div className="form-grid two"><input placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn small" disabled={!reason.trim()} onClick={() => void act(r.id, 'reject')}>Confirm rejection</button></div>}
    </div>; })}</div></Panel>
    {selected && <ExperienceWizardModal key={selected.id} product={{ id: selected.productId } as any} preferredRevisionId={selected.id} viewOnly adminContext vendorNameOverride={selected.product.tenant.vendorProfile?.legalBusinessName || selected.product.tenant.name} reviewActions={{ onPublish: () => void act(selected.id, 'publish'), onReject: () => { setRejecting(selected.id); setSelected(null); } }} onDone={() => setSelected(null)} onChanged={() => void load()} />}
  </>;
}
