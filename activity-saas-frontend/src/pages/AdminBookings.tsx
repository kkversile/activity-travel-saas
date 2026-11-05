import { useEffect, useState } from 'react';
import { api, type AdminBooking, type AdminBookingPage } from '../api';
import { Badge, ErrorBox, Loading, Panel, shortDate, money } from '../components/Ui';

const queues = [['ALL', 'All'], ['PENDING_MANUAL_REVIEW', 'Manual Review'], ['PENDING_VENDOR_CONFIRMATION', 'Vendor Pending'], ['CONFIRMED', 'Confirmed'], ['REJECTED', 'Rejected'], ['CONFIRMATION_EXPIRED', 'Expired'], ['LEGACY', 'Legacy']] as const;
const channels = [['ALL', 'All channels'], ['WEBSITE', 'Website & app'], ['AGENT', 'Agents'], ['API', 'API']] as const;

function channelLabel(row: AdminBooking) {
  const value = String(row.channel || row.bookingMode || '').toUpperCase();
  const type = String(row.snapshot?.channelSnapshot?.type || '').toUpperCase();
  if (type === 'INTERNAL_MARKETPLACE' || value.includes('AGENT')) return 'Agents';
  if (type === 'PARTNER_API' || value.includes('API')) return 'API';
  return 'Website & app';
}

function channelDisplay(row: AdminBooking) {
  const label = channelLabel(row);
  const channel = row.snapshot?.channelSnapshot;
  return label === 'API' && channel?.publicCode
    ? `${label} · ${channel.publicCode}${channel.name ? ` · ${channel.name}` : ''}`
    : label;
}

function bookingParams(search: string, queue: string, channel: string, page: number, limit: number) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) params.set('q', search.trim());
  if (queue === 'LEGACY') params.set('recordType', 'LEGACY');
  else if (queue === 'REJECTED') params.set('statusGroup', 'REJECTED');
  else if (queue !== 'ALL') params.set('status', queue);
  if (channel === 'API') params.set('channelType', 'PARTNER_API');
  else if (channel === 'AGENT') params.set('channelType', 'INTERNAL_MARKETPLACE');
  else if (channel === 'WEBSITE') params.set('channelType', 'DIRECT');
  return params;
}

export function adminBookingsCsv(rows: AdminBooking[]) {
  const header = ['Booking', 'Channel', 'Activity', 'Vendor', 'Date', 'Customer paid', 'Our margin', 'Currency', 'Status'];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = rows.map((row) => [row.publicCode || row.bookingCode, channelDisplay(row), row.snapshot?.productSnapshot?.productName || row.product?.publicCode || row.product?.productCode || 'Legacy', row.vendorTenant?.name || '', row.serviceDate, row.amount || 0, row.economicsSnapshot?.voyaRevenue ?? '', row.currency || '', row.status].map(escape).join(','));
  return [header.map(escape).join(','), ...lines].join('\n');
}

function downloadCsv(rows: AdminBooking[]) {
  const blob = new Blob([adminBookingsCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'admin-bookings.csv'; link.click(); URL.revokeObjectURL(url);
}

export default function AdminBookings() {
  const [rows, setRows] = useState<AdminBooking[]>([]);
  const [queue, setQueue] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [selected, setSelected] = useState<AdminBooking | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await api.request<AdminBookingPage>(`/admin/bookings?${bookingParams(search, queue, channel, page, 25)}`);
      setRows(result.items);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [search, queue, channel, page]);

  async function exportAll() {
    setExporting(true);
    setError('');
    try {
      const first = await api.request<AdminBookingPage>(`/admin/bookings?${bookingParams(search, queue, channel, 1, 100)}`);
      const allRows = [...first.items];
      for (let currentPage = 2; currentPage <= first.pagination.totalPages; currentPage += 1) {
        const result = await api.request<AdminBookingPage>(`/admin/bookings?${bookingParams(search, queue, channel, currentPage, 100)}`);
        allRows.push(...result.items);
      }
      downloadCsv(allRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function decide(id: string, action: 'confirm' | 'reject') {
    const reason = action === 'reject' ? window.prompt('Rejection reason') : '';
    if (action === 'reject' && !reason?.trim()) return;
    try {
      const endpointAction = action === 'confirm' ? 'manual-confirm' : 'manual-reject';
      await api.request(`/admin/bookings/${id}/${endpointAction}`, { method: 'POST', body: action === 'reject' ? JSON.stringify({ reason }) : undefined });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <Loading />;
  const pages = Math.max(1, pagination.totalPages);
  return <>{error && <ErrorBox error={error} />}
    <div className="toolbar booking-toolbar">
      <input className="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Booking ID, voucher code, guest, phone" />
      <div className="chips">{channels.map(([value, label]) => <button key={value} className={`chip ${channel === value ? 'active' : ''}`} onClick={() => { setChannel(value); setPage(1); }}>{label}</button>)}</div>
      <button className="btn small" disabled={exporting || pagination.total === 0} onClick={() => void exportAll()}>{exporting ? 'Exporting…' : 'Export'}</button>
    </div>
    <div className="toolbar"><div className="chips">{queues.map(([value, label]) => <button key={value} className={`chip ${queue === value ? 'active' : ''}`} onClick={() => { setQueue(value); setPage(1); }}>{label}</button>)}</div></div>
    <Panel title={`${pagination.total} bookings`}>
      <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Channel</th><th>Activity · vendor</th><th>Date</th><th>Customer paid</th><th>Our margin</th><th>Status</th><th /></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td className="mono">{row.publicCode || row.bookingCode}<small>{row.voucherCode || 'Voucher pending'}</small></td>
          <td>{channelLabel(row)}{row.snapshot?.channelSnapshot?.publicCode && <small>{row.snapshot.channelSnapshot.publicCode}{row.snapshot.channelSnapshot.name ? ` · ${row.snapshot.channelSnapshot.name}` : ''}</small>}</td>
          <td><b>{row.snapshot?.productSnapshot?.productName || row.product?.publicCode || row.product?.productCode || 'Legacy'}</b><small>{row.vendorTenant?.name || '—'}</small></td>
          <td>{shortDate(row.serviceDate)}</td>
          <td>{money(row.amount || 0)} {row.currency || ''}</td>
          <td>{row.economicsSnapshot?.voyaRevenue == null ? '—' : money(Number(row.economicsSnapshot.voyaRevenue))}</td>
          <td><Badge value={row.status} /></td>
          <td><button className="btn small" onClick={() => api.request<AdminBooking>(`/admin/bookings/${row.id}`).then(setSelected).catch((e) => setError(e.message))}>View</button>{row.status === 'PENDING_MANUAL_REVIEW' && <><button className="btn accent small" onClick={() => void decide(row.id, 'confirm')}>Manual confirm</button><button className="btn small" onClick={() => void decide(row.id, 'reject')}>Manual reject</button></>}</td>
        </tr>)}
      </tbody></table>{!rows.length && <div className="empty">No bookings match these filters.</div>}</div>
      <div className="experience-footer-actions"><small>Page {page} of {pages} · {pagination.total} results</small><button className="btn" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="btn" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
    </Panel>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="voucher-modal booking-detail" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>{selected.publicCode || selected.bookingCode}</h3><button className="btn small" onClick={() => setSelected(null)}>Close</button></div><p className="muted">Legacy booking code: {selected.bookingCode}</p><p><Badge value={selected.status} /> · {selected.channel || selected.bookingMode}</p><p>{selected.snapshot?.productSnapshot?.productName} · {selected.snapshot?.variantSnapshot?.name}</p><p>{selected.customerPhone || 'Phone not provided'} · {selected.voucherCode || 'Voucher pending'}</p><p>{shortDate(selected.serviceDate)} · {money(selected.amount || 0)} {selected.currency}</p><h4>Timeline</h4>{selected.timeline.map((event, i) => <div className="timeline-row" key={i}><b>{event.eventType}</b><span>{new Date(event.createdAt).toLocaleString()}</span></div>)}</div></div>}
  </>;
}
