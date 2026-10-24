import { useEffect, useState, type ReactNode } from 'react';
import { API_BASE, api } from '../api';
import { Badge, ErrorBox, Panel } from '../components/Ui';
import AdminProductDetailModal from '../components/AdminProductDetailModal';

type ReviewRatePlan = { id: string; ratePlanCode: string; name: string; status: string; currency: string; unitType: string; basePrice: string | number; validFrom: string; validTo: string; instantConfirmation: boolean; minPax: number; maxPax: number; travellerRules?: Array<{ type: string; minCount: number; maxCount: number; minAge?: number | null; maxAge?: number | null }>; cancellationRules?: Array<{ minDaysBefore: number; maxDaysBefore?: number | null; chargeValue: string | number; chargeType: string }> };
type ReviewSchedule = { id: string; scheduleCode: string; name: string; status: string; operatingModel?: string | null; timezone: string; effectiveFrom: string; effectiveTo?: string | null; operatingDays: string[]; capacityUnit: string; defaultCapacity?: number | null; slotTemplates: Array<{ id: string; startTime: string; endTime?: string | null; label?: string | null }> };
type ReviewVariant = { id: string; variantCode: string; name: string; status: string; durationMinutes?: number | null; description?: string | null; pickupIncluded: boolean; dropoffIncluded: boolean; inclusions: string[]; exclusions: string[]; suitableFor?: string[]; ratePlans: ReviewRatePlan[]; schedules?: ReviewSchedule[] };
type ReviewMedia = { id: string; kind: 'IMAGE' | 'VIDEO'; externalUrl?: string | null; fileAssetId?: string | null; description?: string | null; fileAsset?: { id: string; originalName: string } | null };
type Review = {
  id: string; versionNumber: number; status: string; productName: string; type: string; subType: string; subCategory?: string | null; meetingModel?: string | null; meetingPoint?: string | null; description: string; shortDescription?: string | null;
  highlights: string[]; importantInfo: string[]; thingsToCarry: string[]; safetyMeasures: string[]; terms: string[]; howToRedeem: string[]; additionalInfo: string[]; channels: string[]; labels: string[];
  cityName: string; stateName: string; countryName: string; address?: string | null; lat?: string | number | null; lon?: string | number | null; submittedAt?: string | null;
  media?: ReviewMedia[]; bookingQuestions?: Array<{ id: string; code: string; label: string; type: string; required: boolean; helpText?: string | null; options?: unknown }>;
  fulfilmentPolicy?: { mode?: string | null; reviewRequired: boolean; operationsContactName?: string | null; operationsContactPhone?: string | null; operationsContactEmail?: string | null; voucherNotes: string[] } | null;
  variants?: ReviewVariant[]; product: { productCode: string; tenant: { name: string; vendorProfile?: { legalBusinessName?: string | null; verificationStatus?: string | null } | null }; variants: ReviewVariant[] };
};

const display = (value: string | null | undefined) => value?.replaceAll('_', ' ') || '—';
const list = (values: string[] | undefined) => values?.length ? values.join(', ') : '—';
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';
const simpleDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '—';
const steps = ['Basic info', 'Experience', 'Options', 'Rates & rules', 'Availability', 'Review & submit'];

function ReadonlyField({ label, value }: { label: string; value: ReactNode }) { return <div className="review-readonly-field"><small>{label}</small><div>{value || '—'}</div></div>; }

function ReviewMedia({ selected }: { selected: Review }) {
  return <section className="review-detail-section"><div className="review-section-heading"><h4>Media</h4><span className="badge">{selected.media?.length || 0} assets</span></div><div className="review-media-grid">{selected.media?.length ? selected.media.map((media) => { const source = media.externalUrl || (media.fileAssetId ? `${API_BASE}/files/public/${media.fileAssetId}/content` : ''); return <div className="review-media-card" key={media.id}>{source && media.kind === 'IMAGE' ? <img src={source} alt={media.description || media.fileAsset?.originalName || 'Product media'} /> : <div className="review-media-placeholder">{media.kind} · {media.fileAsset?.originalName || media.externalUrl || 'Media asset'}</div>}<small>{media.description || media.fileAsset?.originalName || 'No description'}</small></div>; }) : <span className="muted">No media submitted.</span>}</div></section>;
}

function ReviewVariantCard({ variant }: { variant: ReviewVariant }) {
  return <div className="review-variant"><div><b>{variant.name}</b><small>{variant.variantCode} · {variant.durationMinutes ? `${variant.durationMinutes} minutes` : 'Duration not set'} · {variant.pickupIncluded ? 'Pickup included' : 'No pickup'} · {display(variant.status)}</small></div><p><b>Includes:</b> {list(variant.inclusions)} · <b>Excludes:</b> {list(variant.exclusions)}</p></div>;
}

export default function AdminReview() {
  const [items, setItems] = useState<Review[]>([]); const [selected, setSelected] = useState<Review | null>(null); const [detailStep, setDetailStep] = useState(1); const [error, setError] = useState(''); const [reason, setReason] = useState(''); const [rejecting, setRejecting] = useState<string | null>(null);
  const load = () => api.request<Review[]>('/admin/product-revisions/review').then(setItems).catch((e) => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  async function act(id: string, action: 'publish' | 'reject') { try { await api.request(`/admin/product-revisions/${id}/${action}`, { method: 'POST', ...(action === 'reject' ? { body: JSON.stringify({ reason }) } : {}) }); setRejecting(null); setSelected(null); setReason(''); void load(); } catch (e) { setError((e as Error).message); } }
  function openDetails(review: Review) { setSelected(review); setDetailStep(1); }
  const variants = selected ? (selected.variants ?? selected.product.variants ?? []) : [];
  return <>
    <div className="admin-hero"><div><h2>Product revision review queue</h2><p className="muted">Inspect the submitted product details before publishing or rejecting the revision.</p></div><span className="badge pending">{items.length} awaiting review</span></div>
    {error && <ErrorBox error={error} />}
    <Panel><div className="panel-body">{!items.length ? <div className="empty">No product revisions are waiting for review.</div> : items.map((r) => { const rowVariants = r.variants ?? r.product.variants ?? []; return <div className="admin-review-row" key={r.id}>
      <div><b>{r.product.productCode} · Revision v{r.versionNumber}</b><small>{r.product.tenant.vendorProfile?.legalBusinessName || r.product.tenant.name}</small><small>{r.productName} · {rowVariants.length} variants · {rowVariants.reduce((n, v) => n + v.ratePlans.length, 0)} rate plans</small></div><Badge value={r.status} /><div className="status-actions"><button className="btn small" onClick={() => openDetails(r)}>View details</button><button className="btn small primary" onClick={() => void act(r.id, 'publish')}>Publish</button><button className="btn small" onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>Reject</button></div>
      {rejecting === r.id && <div className="form-grid two"><input placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn small" disabled={!reason.trim()} onClick={() => void act(r.id, 'reject')}>Confirm rejection</button></div>}
    </div>; })}</div></Panel>
    {selected && <AdminProductDetailModal selected={selected} onClose={() => setSelected(null)} onPublish={() => void act(selected.id, 'publish')} onReject={() => { setRejecting(selected.id); setSelected(null); }} />}
  </>;
}
