import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { ErrorBox, Loading, Panel } from '../components/Ui';

type OfferType = { id: string; label: string; status: boolean; sortOrder: number };
type OfferTypeResponse = { items: OfferType[]; updatedAt: string | null };

export default function AdminRegistrationOfferTypes() {
  const [items, setItems] = useState<OfferType[]>([]);
  const [drafts, setDrafts] = useState<Record<string, OfferType>>({});
  const [newLabel, setNewLabel] = useState('');
  const [newStatus, setNewStatus] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const response = await api.request<OfferTypeResponse>('/admin/registration-offer-types');
      setItems(response.items);
      setDrafts(Object.fromEntries(response.items.map((item) => [item.id, { ...item }])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.request<OfferTypeResponse>('/admin/registration-offer-types', { method: 'POST', body: JSON.stringify({ label: newLabel.trim(), status: newStatus }) });
      setItems(response.items); setDrafts(Object.fromEntries(response.items.map((item) => [item.id, { ...item }]))); setNewLabel(''); setNewStatus(true); setNotice('Offer type added.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function save(item: OfferType) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.request<OfferTypeResponse>(`/admin/registration-offer-types/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ label: item.label.trim(), status: item.status, sortOrder: item.sortOrder }) });
      setItems(response.items); setDrafts(Object.fromEntries(response.items.map((row) => [row.id, { ...row }]))); setNotice('Offer type saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function remove(item: OfferType) {
    if (!window.confirm(`Delete “${item.label}” from vendor sign-up?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.request<OfferTypeResponse>(`/admin/registration-offer-types/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setItems(response.items); setDrafts(Object.fromEntries(response.items.map((row) => [row.id, { ...row }]))); setNotice('Offer type deleted.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <div className="admin-registration-offers">
    <div className="admin-hero"><div><h2>Registration offer types</h2><p className="muted">Manage the categories vendors can choose during sign-up. Only enabled options appear on the registration form.</p></div><button type="button" className="btn" onClick={() => void load()} disabled={loading || busy}>Refresh</button></div>
    {error && <ErrorBox error={error} />}{notice && <div className="alert success" role="status">{notice}</div>}
    <Panel title="Add an offer type"><form className="admin-registration-offer-create" onSubmit={(event) => void create(event)}><label className="field"><span>Offer type name</span><input required minLength={2} maxLength={80} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="e.g. Food & culinary experiences" /></label><label className="admin-registration-offer-status"><input type="checkbox" checked={newStatus} onChange={(event) => setNewStatus(event.target.checked)} /> Enabled at sign-up</label><button className="btn primary" disabled={busy || !newLabel.trim()}>{busy ? 'Saving…' : 'Add offer type'}</button></form></Panel>
    <Panel title="Offer types"><p className="muted">Disabled options stay saved here but are immediately hidden from new registrations. Existing vendor records are not changed.</p>{loading ? <Loading text="Loading offer types…" /> : error && !items.length ? null : items.length ? <div className="table-wrap"><table><thead><tr><th>Offer type</th><th>Status</th><th>Order</th><th /></tr></thead><tbody>{items.map((item) => { const draft = drafts[item.id] || item; return <tr key={item.id}><td><input className="admin-registration-offer-label" aria-label={`Name for ${item.label}`} maxLength={80} value={draft.label} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, label: event.target.value } }))} /></td><td><label className="admin-registration-offer-status"><input type="checkbox" checked={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, status: event.target.checked } }))} /> {draft.status ? 'Enabled' : 'Disabled'}</label></td><td><input className="admin-registration-offer-order" type="number" min="0" step="1" aria-label={`Display order for ${item.label}`} value={draft.sortOrder} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, sortOrder: Number(event.target.value) } }))} /></td><td className="admin-registration-offer-actions"><button type="button" className="btn small primary" disabled={busy || !draft.label.trim() || JSON.stringify(draft) === JSON.stringify(item)} onClick={() => void save(draft)}>Save</button><button type="button" className="btn small danger" disabled={busy} onClick={() => void remove(item)}>Delete</button></td></tr>; })}</tbody></table></div> : <div className="empty">No offer types configured. Add an enabled option to show a category on vendor sign-up.</div>}</Panel>
  </div>;
}
