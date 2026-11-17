import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Panel } from './Ui';

type BankReview = { id: string; bankName: string; accountHolder: string; accountNumberMasked: string; ifsc: string; proofDocumentId?: string | null; tenant: { name: string } };

export default function AdminBankReviews() {
  const [items, setItems] = useState<BankReview[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function load() { try { setItems(await api.request<BankReview[]>('/vendor/admin/bank-accounts/pending')); } catch (e) { setError(String(e)); } }
  useEffect(() => { void load(); }, []);
  async function proof(id: string) { try { const blob = await api.blob(`/files/${id}/content`); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bank-proof'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError(String(e)); } }
  async function review(item: BankReview, status: 'VERIFIED' | 'REJECTED') { setBusy(true); setError(''); try { await api.request(`/vendor/admin/bank-accounts/${item.id}/review`, { method: 'POST', body: JSON.stringify({ status, note: notes[item.id] || '' }) }); await load(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  return <Panel title="Outlet bank verification">{error && <ErrorBox error={error} />}{!items.length && <p className="muted">No outlet bank accounts await review.</p>}{items.map((item) => <div className="listing-card" key={item.id}><div><strong>{item.tenant.name} · {item.bankName}</strong><p>{item.accountHolder} · {item.accountNumberMasked} · {item.ifsc}</p>{item.proofDocumentId ? <button className="btn small" onClick={() => void proof(item.proofDocumentId!)}>Download bank proof</button> : <p className="muted">Bank proof is required for verification.</p>}<label>Review note<input aria-label={`Bank review note for ${item.accountNumberMasked}`} value={notes[item.id] || ''} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} /></label></div><div><button className="btn primary small" disabled={busy || !item.proofDocumentId || !notes[item.id]?.trim()} onClick={() => void review(item, 'VERIFIED')}>Verify account</button><button className="btn small" disabled={busy || !notes[item.id]?.trim()} onClick={() => void review(item, 'REJECTED')}>Reject account</button></div></div>)}</Panel>;
}
