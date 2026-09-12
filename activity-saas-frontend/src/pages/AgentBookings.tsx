import { useEffect, useState } from 'react';
import { api, type AgentBooking } from '../api';
import { Badge, ErrorBox, Loading, Panel, shortDate, money } from '../components/Ui';

const cancellable = ['CONFIRMED', 'PENDING_VENDOR_CONFIRMATION', 'PENDING_MANUAL_REVIEW'];
const categories = ['CUSTOMER_REQUEST', 'DUPLICATE', 'OTHER'];

export default function AgentBookings() {
  const [rows, setRows] = useState<AgentBooking[]>([]);
  const [selected, setSelected] = useState<AgentBooking | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [cancellationKey, setCancellationKey] = useState<string | null>(null);
  const [category, setCategory] = useState(categories[0]);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setRows(await api.request<AgentBooking[]>('/agent/bookings')); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function closeModal() { setSelected(null); setPreview(null); setCancellationKey(null); }

  async function openCancellation(booking: AgentBooking) {
    setSelected(booking); setPreview(null); setCancellationKey(crypto.randomUUID());
    setCategory(categories[0]); setReason(''); setAcknowledged(false); setError('');
    try { setPreview(await api.request(`/agent/bookings/${booking.id}/cancellation/preview`, { method: 'POST' })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function cancelBooking() {
    if (!selected || !preview?.eligible || !cancellationKey || !acknowledged || !reason.trim()) return;
    setBusy(true);
    try {
      const result = await api.request<AgentBooking>(`/agent/bookings/${selected.id}/cancellation`, {
        method: 'POST', headers: { 'Idempotency-Key': cancellationKey },
        body: JSON.stringify({ expectedCancellationFingerprint: preview.cancellationFingerprint, reasonCategory: category, reason, acknowledged }),
      });
      setSelected(result); setPreview(null); setCancellationKey(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  if (loading) return <Loading />;
  return <>
    {error && <ErrorBox error={error} />}
    <Panel title="My bookings"><div className="table-wrap"><table><thead><tr><th>Booking</th><th>Product</th><th>Service date</th><th>Amount</th><th>Mode</th><th>Status</th><th /></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td className="mono">{row.bookingCode}</td><td>{row.snapshot?.productSnapshot?.productName || '—'}</td><td>{shortDate(row.serviceDate)}</td><td>{money(row.amount || 0)}</td><td>{row.bookingMode?.replaceAll('_', ' ') || 'Legacy'}</td><td><Badge value={row.status} /></td><td>
        <button className="btn small" onClick={() => api.request<AgentBooking>(`/agent/bookings/${row.id}`).then(setSelected).catch((e) => setError(e.message))}>Details</button>
        {cancellable.includes(row.status) && !row.cancellation && <button className="btn small" onClick={() => void openCancellation(row)}>Cancel</button>}
      </td></tr>)}
    </tbody></table></div>{!rows.length && <div className="empty">No bookings created by this agent yet.</div>}</Panel>
    {selected && <div className="modal-backdrop" onClick={closeModal}><div className="voucher-modal booking-detail" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h3>{selected.bookingCode}</h3><button className="btn small" onClick={closeModal}>Close</button></div>
      <p><Badge value={selected.status} /> · {selected.bookingMode?.replaceAll('_', ' ') || 'Legacy'} · {shortDate(selected.serviceDate)}</p>
      <h4>{selected.snapshot?.productSnapshot?.productName} · {selected.snapshot?.variantSnapshot?.name}</h4>
      <p className="muted">{selected.status.startsWith('PENDING') ? 'Pending request — withdrawing releases the active hold.' : 'Server-authoritative booking status.'}</p>
      <p><b>Price:</b> {money(selected.amount || 0)} {selected.currency}</p>
      {selected.cancellation ? <><h4>Cancellation</h4><p>{selected.cancellation.initiator} · {selected.cancellation.reasonCategory}</p><p>{selected.cancellation.financialState} · Charge {money(selected.cancellation.cancellationCharge)} · Refund {money(selected.cancellation.refundEntitlement)}</p></> : preview && <section>
        <h4>{selected.status.startsWith('PENDING') ? 'Withdraw request' : 'Cancellation preview'}</h4>
        {preview.reasonCodes?.length ? <p className="muted">{preview.reasonCodes.join(', ')}</p> : <>
          <p>Policy: {preview.matchedPolicy ? `${preview.matchedPolicy.minDaysBefore}–${preview.matchedPolicy.maxDaysBefore ?? '+'} days before service` : 'Pending booking withdrawal'}</p>
          <p><b>Cancellation charge:</b> {money(preview.cancellationCharge || 0)} {preview.currency}</p><p><b>Expected refund:</b> {money(preview.refundEntitlement || 0)} {preview.currency}</p>
          <label className="field"><span>Reason category</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>Reason</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} required /></label>
          <label className="check-row"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} /> I understand the cancellation charge/refund outcome.</label>
          <button className="btn accent" disabled={busy || !acknowledged || !reason.trim()} onClick={() => void cancelBooking()}>{busy ? 'Cancelling…' : selected.status.startsWith('PENDING') ? 'Withdraw request' : 'Confirm cancellation'}</button>
        </>}
      </section>}
      <h4>Travellers</h4>{selected.travellers.map((traveller, index) => <div key={index}>{traveller.fullName || `Traveller ${index + 1}`} · {traveller.travellerType}</div>)}
      <h4>Timeline</h4>{selected.timeline.map((event, index) => <div key={index} className="timeline-row"><b>{event.eventType}</b><span>{new Date(event.createdAt).toLocaleString()}</span>{event.reason && <small>{event.reason}</small>}</div>)}
    </div></div>}
  </>;
}
