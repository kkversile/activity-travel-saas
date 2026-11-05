import { useEffect, useState } from 'react';
import { api, type VendorBooking } from '../api';
import { Badge, ErrorBox, Loading, Panel, shortDate, money } from '../components/Ui';
import { SharedDatePicker } from '../components/SharedDatePicker';

const tabs = [['ALL', 'All'], ['NEEDS_ACTION', 'Needs acceptance'], ['CONFIRMED', 'Confirmed'], ['REDEEMED', 'Redeemed'], ['CANCELLED', 'Cancelled'], ['PENDING', 'Pending review'], ['REJECTED', 'Rejected / Expired'], ['LEGACY', 'Legacy']] as const;
type BookingActionDialog = { bookingId: string; action: 'reject' | 'cancel'; reason: string; reasonCategory: string; preview?: any };
function guestCount(row: VendorBooking) {
  const count = row.travellers.reduce((total, traveller) => total + Number(traveller.quantity || 1), 0);
  return count || Number(row.snapshot?.travellerSummary?.totalPax || row.snapshot?.travellerSummary?.guestCount || 0);
}
export default function Bookings() {
  const [rows, setRows] = useState<VendorBooking[]>([]); const [filter, setFilter] = useState('ALL'); const [page, setPage] = useState(1); const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 }); const [selected, setSelected] = useState<VendorBooking | null>(null); const [actionDialog, setActionDialog] = useState<BookingActionDialog | null>(null); const [actionBusy, setActionBusy] = useState(false); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [query, setQuery] = useState({ search: '', from: '', to: '' }); const [voucherCode, setVoucherCode] = useState(''); const [voucherResult, setVoucherResult] = useState<{ bookingId: string; bookingCode: string; status: string; serviceDate: string; guestName: string | null; productName: string; redeemed: boolean } | null>(null); const [voucherBusy, setVoucherBusy] = useState(false);
  function appendFilters(params: URLSearchParams, activeFilter: string) { if (activeFilter === 'NEEDS_ACTION') params.set('status', 'PENDING_VENDOR_CONFIRMATION'); else if (activeFilter === 'CONFIRMED') params.set('status', 'CONFIRMED'); else if (activeFilter === 'REDEEMED') params.set('status', 'REDEEMED'); else if (activeFilter === 'CANCELLED') params.set('status', 'CANCELLED'); else if (activeFilter === 'PENDING') params.set('status', 'PENDING_MANUAL_REVIEW'); else if (activeFilter === 'REJECTED') params.set('statusGroup', 'REJECTED'); else if (activeFilter === 'LEGACY') params.set('recordType', 'LEGACY'); }
  async function load(next = query, activeFilter = filter, nextPage = page) { setLoading(true); setError(''); try { const params = new URLSearchParams({ page: String(nextPage), limit: '25' }); if (next.search) params.set('q', next.search); if (next.from) params.set('from', next.from); if (next.to) params.set('to', next.to); appendFilters(params, activeFilter); const result = await api.request<{ items: VendorBooking[]; pagination: typeof pagination }>(`/vendor/bookings/page?${params}`); setRows(result.items); setPagination(result.pagination); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function decide(id: string, action: 'confirm' | 'reject') { if (action === 'reject') { setActionDialog({ bookingId: id, action, reason: '', reasonCategory: 'OTHER' }); return; } try { await api.request(`/vendor/bookings/${id}/confirm`, { method: 'POST' }); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  async function cancelService(id: string) { try { const preview = await api.request<any>(`/vendor/bookings/${id}/cancellation/preview`, { method: 'POST' }); if (!preview.eligible) { setError((preview.reasonCodes || ['Booking cannot be cancelled']).join(', ')); return; } setActionDialog({ bookingId: id, action: 'cancel', reason: '', reasonCategory: 'OTHER', preview }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  async function submitBookingAction() { if (!actionDialog || !actionDialog.reason.trim()) return; setActionBusy(true); setError(''); try { if (actionDialog.action === 'reject') await api.request(`/vendor/bookings/${actionDialog.bookingId}/reject`, { method: 'POST', body: JSON.stringify({ reason: actionDialog.reason.trim() }) }); else await api.request(`/vendor/bookings/${actionDialog.bookingId}/cancellation`, { method: 'POST', body: JSON.stringify({ reason: actionDialog.reason.trim(), reasonCategory: actionDialog.reasonCategory }) }); setActionDialog(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setActionBusy(false); } }
  async function downloadExport() { try { const params = new URLSearchParams(); if (query.search) params.set('q', query.search); if (query.from) params.set('from', query.from); if (query.to) params.set('to', query.to); appendFilters(params, filter); const blob = await api.blob(`/vendor/bookings/export.csv${params.toString() ? `?${params.toString()}` : ''}`); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'vendor-bookings.csv'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  async function checkVoucher() { const code = voucherCode.trim(); if (!code) return; setVoucherBusy(true); setError(''); setVoucherResult(null); try { setVoucherResult(await api.request(`/vendor/fulfilment/voucher-lookup/${encodeURIComponent(code)}`)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setVoucherBusy(false); } }
  async function redeemVoucher() { if (!voucherResult) return; setVoucherBusy(true); setError(''); try { await api.request(`/vendor/manifest/bookings/${voucherResult.bookingId}/check-in`, { method: 'POST' }); setVoucherResult((current) => current ? { ...current, redeemed: true, status: 'REDEEMED' } : current); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setVoucherBusy(false); } }
  const pageHeader = <header className="partner-page-header"><div><h1>Bookings</h1><p>Every booking for your products. Accept on-request bookings before the timer runs out.</p></div><button type="button" className="btn" title="Download the current booking results as CSV" onClick={() => void downloadExport()}>Export</button></header>;
  if (loading) return <>{pageHeader}<Loading /></>;
  const visible = rows;
  return <>
    {pageHeader}
    {error && <ErrorBox error={error} />}
    <Panel title="Redeem a voucher">
      <p className="muted">Type or scan the code on the guest’s voucher, then confirm check-in.</p>
      <div className="booking-voucher-lookup">
        <input aria-label="Voucher code" value={voucherCode} onChange={(event) => setVoucherCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void checkVoucher(); }} placeholder="Enter voucher code" />
        <button type="button" className="btn accent" disabled={voucherBusy || !voucherCode.trim()} onClick={() => void checkVoucher()}>{voucherBusy ? 'Checking…' : 'Check code'}</button>
      </div>
      {voucherResult && <div className="booking-voucher-result" role="status">
        <div><b>{voucherResult.productName}</b><span>{voucherResult.bookingCode} · {shortDate(voucherResult.serviceDate)} · {voucherResult.guestName || 'Guest'}</span></div>
        {voucherResult.redeemed ? <Badge value="REDEEMED" /> : voucherResult.status === 'CONFIRMED' ? <button type="button" className="btn accent small" disabled={voucherBusy} onClick={() => void redeemVoucher()}>Redeem voucher</button> : <Badge value={voucherResult.status} />}
      </div>}
    </Panel>
    <div className="toolbar vendor-booking-toolbar">
      <div className="chips">{tabs.map(([value, label]) => <button key={value} onClick={() => { setFilter(value); setPage(1); void load(query, value, 1); }} className={`chip ${filter === value ? 'active' : ''}`}>{label}</button>)}</div>
      <div className="booking-filters">
        <input aria-label="Search bookings" placeholder="Search booking, traveller or email" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const next = { search: search.trim(), from, to }; setQuery(next); setPage(1); void load(next, filter, 1); } }} />
        <SharedDatePicker value={from} onChange={setFrom} placeholder="From" ariaLabel="Service date from" />
        <SharedDatePicker value={to} onChange={setTo} placeholder="To" ariaLabel="Service date to" />
        <button className="btn small" onClick={() => { const next = { search: search.trim(), from, to }; setQuery(next); setPage(1); void load(next, filter, 1); }}>Search</button>
      </div>
    </div>
    <Panel title="Incoming bookings">
      <div className="table-wrap"><table>
        <thead><tr><th>Booking</th><th>Activity date</th><th>Product · option</th><th>Lead guest</th><th className="r">Guests</th><th className="r">You receive</th><th>Status</th><th aria-label="Actions" /></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.id}>
          <td className="mono">{row.publicCode || row.bookingCode}<br /><small>{row.agent?.name || 'Direct booking'}{row.confirmationDueAt ? ` · due ${new Date(row.confirmationDueAt).toLocaleString()}` : ''}</small></td>
          <td>{shortDate(row.serviceDate)}</td>
          <td>{row.snapshot?.productSnapshot?.productName || 'Legacy'}<br /><small>{row.snapshot?.variantSnapshot?.name || '—'}</small></td>
          <td>{row.customerName || row.travellers.find((traveller) => traveller.isLead)?.fullName || '—'}</td>
          <td className="r">{guestCount(row) || '—'}</td>
          <td className="r">{row.economics?.netVendorPayable != null ? money(row.economics.netVendorPayable, row.economics.currency || row.currency) : row.economics?.vendorPayable != null ? money(row.economics.vendorPayable, row.economics.currency || row.currency) : '—'}</td>
          <td><Badge value={row.status} /></td>
          <td><div className="row-actions">
            <button className="btn small" onClick={() => api.request<VendorBooking>(`/vendor/bookings/${row.id}`).then(setSelected).catch((e) => setError(e.message))}>View</button>
            {row.recordType === 'CANONICAL' && row.status === 'PENDING_VENDOR_CONFIRMATION' && <><button className="btn accent small" onClick={() => void decide(row.id, 'confirm')}>Confirm</button><button className="btn small" onClick={() => void decide(row.id, 'reject')}>Reject</button></>}
            {row.recordType === 'CANONICAL' && ['CONFIRMED', 'PENDING_VENDOR_CONFIRMATION'].includes(row.status) && <button className="btn small" onClick={() => void cancelService(row.id)}>Cancel service</button>}
            {row.recordType === 'CANONICAL' && ['CONFIRMED', 'REDEEMED', 'COMPLETED'].includes(row.status) && <button className="btn small" onClick={() => api.request<any>(`/vendor/fulfilment/${row.id}/voucher`).then((voucher) => setError(voucher.currentVoucher ? `Voucher ${voucher.currentVoucher.voucherCode} is ready.` : `Voucher unavailable: ${voucher.reason || 'not ready'}`)).catch((e) => setError(e.message))}>Voucher</button>}
            {row.status === 'PENDING_MANUAL_REVIEW' && <small className="muted">Platform manual review</small>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!visible.length && <div className="empty">No bookings in this queue.</div>}
      <div className="experience-step-footer"><small>Page {page} of {Math.max(1, pagination.totalPages)} · {pagination.total} results</small><div className="experience-footer-actions"><button className="btn" disabled={loading || page <= 1} onClick={() => { const next = page - 1; setPage(next); void load(query, filter, next); }}>Previous</button><button className="btn" disabled={loading || page >= pagination.totalPages} onClick={() => { const next = page + 1; setPage(next); void load(query, filter, next); }}>Next</button></div></div>
    </Panel>
    {actionDialog && <div className="modal-backdrop" onClick={() => !actionBusy && setActionDialog(null)}><div className="voucher-modal booking-detail" role="dialog" aria-modal="true" aria-labelledby="booking-action-title" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h3 id="booking-action-title">{actionDialog.action === 'reject' ? 'Reject booking' : 'Cancel service'}</h3><button type="button" className="btn small" disabled={actionBusy} onClick={() => setActionDialog(null)}>Close</button></div>
      <p className="muted">{actionDialog.action === 'reject' ? 'Add a reason so the booking record explains why you cannot accept this reservation.' : 'Review the cancellation preview, then provide the supplier reason.'}</p>
      {actionDialog.action === 'cancel' && actionDialog.preview && <p><b>Estimated refund:</b> {money(actionDialog.preview.refundEntitlement || 0, actionDialog.preview.currency)}</p>}
      {actionDialog.action === 'cancel' && <label className="field"><span>Reason category</span><select value={actionDialog.reasonCategory} onChange={(event) => setActionDialog({ ...actionDialog, reasonCategory: event.target.value })}><option value="WEATHER">Weather</option><option value="SAFETY">Safety</option><option value="VENDOR_OPERATIONAL">Vendor operational</option><option value="OTHER">Other</option></select></label>}
      <label className="field"><span>{actionDialog.action === 'reject' ? 'Rejection reason' : 'Supplier cancellation reason'}</span><textarea autoFocus required rows={4} value={actionDialog.reason} onChange={(event) => setActionDialog({ ...actionDialog, reason: event.target.value })} /></label>
      <div className="actions"><button type="button" className="btn" disabled={actionBusy} onClick={() => setActionDialog(null)}>Keep booking</button><button type="button" className="btn accent" disabled={actionBusy || !actionDialog.reason.trim()} onClick={() => void submitBookingAction()}>{actionBusy ? 'Saving…' : actionDialog.action === 'reject' ? 'Reject booking' : 'Confirm cancellation'}</button></div>
    </div></div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="voucher-modal booking-detail" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h3>{selected.publicCode || selected.bookingCode}</h3><button className="btn small" onClick={() => setSelected(null)}>Close</button></div>
      <p className="muted">Booking reference: {selected.bookingCode}</p><p><Badge value={selected.status} /> · {selected.bookingMode?.replaceAll('_', ' ') || 'Legacy'}</p>
      <h4>{selected.snapshot?.productSnapshot?.productName} · {selected.snapshot?.variantSnapshot?.name}</h4><p>{shortDate(selected.serviceDate)} · {selected.snapshot?.sessionSnapshot?.localStartTime || ''}</p>
      <p><b>Agent:</b> {selected.agent?.name || '—'} · <b>Vendor amount:</b> {money(selected.economics?.vendorPayable || 0)}</p>
      <h4>Travellers</h4>{selected.travellers.map((t, i) => <div key={i}>{t.fullName || `Traveller ${i + 1}`} · {t.travellerType}</div>)}
      <h4>Timeline</h4>{selected.timeline.map((e, i) => <div key={i} className="timeline-row"><b>{e.eventType}</b><span>{new Date(e.createdAt).toLocaleString()}</span></div>)}
    </div></div>}
  </>;
}
