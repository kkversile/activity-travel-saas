import { useEffect, useState } from 'react';
import { API_BASE, api } from '../api';
import { Badge, ErrorBox, Panel } from '../components/Ui';

type ReviewRatePlan = { id: string; ratePlanCode: string; name: string; status: string; currency: string; unitType: string; basePrice: string | number; validFrom: string; validTo: string; instantConfirmation: boolean; minPax: number; maxPax: number };
type ReviewVariant = { id: string; variantCode: string; name: string; status: string; durationMinutes?: number | null; description?: string | null; pickupIncluded: boolean; dropoffIncluded: boolean; inclusions: string[]; exclusions: string[]; ratePlans: ReviewRatePlan[] };
type ReviewMedia = { id: string; kind: 'IMAGE' | 'VIDEO'; externalUrl?: string | null; fileAssetId?: string | null; description?: string | null; fileAsset?: { id: string; originalName: string } | null };
type Review = {
  id: string;
  versionNumber: number;
  status: string;
  productName: string;
  type: string;
  subType: string;
  subCategory?: string | null;
  meetingModel?: string | null;
  meetingPoint?: string | null;
  description: string;
  shortDescription?: string | null;
  highlights: string[];
  importantInfo: string[];
  thingsToCarry: string[];
  safetyMeasures: string[];
  terms: string[];
  howToRedeem: string[];
  additionalInfo: string[];
  channels: string[];
  labels: string[];
  cityName: string;
  stateName: string;
  countryName: string;
  address?: string | null;
  lat?: string | number | null;
  lon?: string | number | null;
  submittedAt?: string | null;
  media: ReviewMedia[];
  bookingQuestions: Array<{ id: string; code: string; label: string; type: string; required: boolean }>;
  fulfilmentPolicy?: { mode?: string | null; reviewRequired: boolean; operationsContactName?: string | null; operationsContactPhone?: string | null; operationsContactEmail?: string | null; voucherNotes: string[] } | null;
  variants: ReviewVariant[];
  product: { productCode: string; tenant: { name: string; vendorProfile?: { legalBusinessName?: string | null; verificationStatus?: string | null } | null } };
};

const display = (value: string | null | undefined) => value?.replaceAll('_', ' ') || '—';
const list = (values: string[] | undefined) => values?.length ? values.join(', ') : '—';
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';

export default function AdminReview() {
  const [items, setItems] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const load = () => api.request<Review[]>('/admin/product-revisions/review').then(setItems).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  async function act(id: string, action: 'publish' | 'reject') {
    try {
      await api.request(`/admin/product-revisions/${id}/${action}`, { method: 'POST', ...(action === 'reject' ? { body: JSON.stringify({ reason }) } : {}) });
      setRejecting(null);
      setSelected(null);
      setReason('');
      void load();
    } catch (e) { setError((e as Error).message); }
  }
  return <>
    <div className="admin-hero"><div><h2>Product revision review queue</h2><p className="muted">Inspect the submitted product details before publishing or rejecting the revision.</p></div><span className="badge pending">{items.length} awaiting review</span></div>
    {error && <ErrorBox error={error} />}
    <Panel><div className="panel-body">{!items.length ? <div className="empty">No product revisions are waiting for review.</div> : items.map((r) => <div className="admin-review-row" key={r.id}>
      <div><b>{r.product.productCode} · Revision v{r.versionNumber}</b><small>{r.product.tenant.vendorProfile?.legalBusinessName || r.product.tenant.name}</small><small>{r.productName} · {r.variants.length} variants · {r.variants.reduce((n, v) => n + v.ratePlans.length, 0)} rate plans</small></div>
      <Badge value={r.status} />
      <div className="status-actions"><button className="btn small" onClick={() => setSelected(r)}>View details</button><button className="btn small primary" onClick={() => void act(r.id, 'publish')}>Publish</button><button className="btn small" onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>Reject</button></div>
      {rejecting === r.id && <div className="form-grid two"><input placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn small" disabled={!reason.trim()} onClick={() => void act(r.id, 'reject')}>Confirm rejection</button></div>}
    </div>)}</div></Panel>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="modal-card admin-review-detail" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><div><h3 id="review-detail-title">{selected.productName}</h3><p className="muted">{selected.product.productCode} · Revision v{selected.versionNumber} · Submitted {date(selected.submittedAt)}</p></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close product details">×</button></div>
      <div className="review-detail-body">
        <div className="review-detail-summary"><Badge value={selected.status} /><span>{selected.product.tenant.vendorProfile?.legalBusinessName || selected.product.tenant.name}</span><span>{display(selected.type)} · {display(selected.subType)}</span><span>{selected.cityName}, {selected.stateName}, {selected.countryName}</span></div>
        <section className="review-detail-section"><h4>Basic information</h4><p><b>Sub-category:</b> {selected.subCategory || '—'} · <b>Meeting model:</b> {display(selected.meetingModel)}</p><p><b>Meeting point:</b> {selected.meetingPoint || '—'}</p><p><b>Address:</b> {selected.address || '—'}{selected.lat != null && selected.lon != null ? ` · ${selected.lat}, ${selected.lon}` : ''}</p><p>{selected.shortDescription || selected.description}</p><p><b>Highlights:</b> {list(selected.highlights)}</p></section>
        <section className="review-detail-section"><h4>Experience and customer instructions</h4><p><b>Important information:</b> {list(selected.importantInfo)}</p><p><b>Things to carry:</b> {list(selected.thingsToCarry)}</p><p><b>Safety:</b> {list(selected.safetyMeasures)}</p><p><b>Terms:</b> {list(selected.terms)}</p><p><b>How to redeem:</b> {list(selected.howToRedeem)}</p></section>
        <section className="review-detail-section"><h4>Media ({selected.media.length})</h4><div className="review-media-grid">{selected.media.length ? selected.media.map((media) => { const source = media.externalUrl || (media.fileAssetId ? `${API_BASE}/files/public/${media.fileAssetId}/content` : ''); return <div className="review-media-card" key={media.id}>{source && media.kind === 'IMAGE' ? <img src={source} alt={media.description || media.fileAsset?.originalName || 'Product media'} /> : <div className="review-media-placeholder">{media.kind} · {media.fileAsset?.originalName || media.externalUrl || 'Media asset'}</div>}<small>{media.description || media.fileAsset?.originalName || 'No description'}</small></div>; }) : <span className="muted">No media submitted.</span>}</div></section>
        <section className="review-detail-section"><h4>Options and rate plans</h4>{selected.variants.map((variant) => <div className="review-variant" key={variant.id}><div><b>{variant.name}</b><small>{variant.variantCode} · {variant.durationMinutes ? `${variant.durationMinutes} minutes` : 'Duration not set'} · {variant.pickupIncluded ? 'Pickup included' : 'No pickup'}</small></div>{variant.ratePlans.map((plan) => <div className="review-rate-plan" key={plan.id}><span><b>{plan.name}</b><small>{plan.ratePlanCode} · {plan.currency} {plan.basePrice} · {display(plan.unitType)} · {plan.minPax}–{plan.maxPax} pax</small></span><Badge value={plan.status} /></div>)}</div>)}{!selected.variants.length && <span className="muted">No options submitted.</span>}</section>
        <section className="review-detail-section"><h4>Booking and fulfilment</h4><p><b>Booking questions:</b> {selected.bookingQuestions.length ? selected.bookingQuestions.map((q) => `${q.label} (${q.type}${q.required ? ', required' : ''})`).join('; ') : 'None'}</p><p><b>Fulfilment:</b> {display(selected.fulfilmentPolicy?.mode)}{selected.fulfilmentPolicy?.reviewRequired ? ' · evidence review required' : ''}</p><p><b>Operations contact:</b> {selected.fulfilmentPolicy?.operationsContactName || '—'} · {selected.fulfilmentPolicy?.operationsContactPhone || '—'} · {selected.fulfilmentPolicy?.operationsContactEmail || '—'}</p></section>
      </div>
      <div className="modal-actions"><button className="btn" onClick={() => setSelected(null)}>Close</button><button className="btn primary" onClick={() => void act(selected.id, 'publish')}>Publish</button><button className="btn" onClick={() => { setRejecting(selected.id); setSelected(null); }}>Reject</button></div>
    </div></div>}
  </>;
}
