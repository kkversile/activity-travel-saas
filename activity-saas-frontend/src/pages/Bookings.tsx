import { useEffect, useState } from 'react';
import { api, type Booking } from '../api';
import { Badge, ErrorBox, Loading, money, Panel, shortDate } from '../components/Ui';

export default function Bookings() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [voucherUrl, setVoucherUrl] = useState('');

  async function load() { setLoading(true); try { setRows(await api.request<Booking[]>('/bookings')); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function action(id: string, name: 'confirm' | 'cancel') { try { await api.request(`/bookings/${id}/${name}`, { method: 'POST' }); await load(); } catch (e) { setError((e as Error).message); } }
  async function voucher(id: string) { try { const result = await api.request<{ voucherCode: string; fileUrl: string }>(`/bookings/${id}/voucher`); setVoucherUrl(result.fileUrl); } catch (e) { setError((e as Error).message); } }
  if (loading) return <Loading />;
  const visible = rows.filter((r) => filter === 'ALL' || (filter === 'NEEDS_ACTION' ? r.status === 'PENDING' : r.status === filter));

  return <>{error && <ErrorBox error={error} />}<div className="toolbar"><div className="chips">{[['ALL','All'],['NEEDS_ACTION','Needs Action'],['CONFIRMED','Confirmed'],['CANCELLED','Cancelled']].map(([v,l]) => <button key={v} onClick={() => setFilter(v)} className={`chip ${filter === v ? 'active' : ''}`}>{l}</button>)}</div></div><Panel><div className="table-wrap"><table><thead><tr><th>Booking ID</th><th>Activity</th><th>Source</th><th>Date</th><th>Pax</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((b) => <tr key={b.id}><td className="mono">{b.bookingCode}</td><td>{b.activity.productName}</td><td>{b.channel}</td><td>{shortDate(b.serviceDate)}</td><td>{b.pax}</td><td>{money(b.amount)}</td><td><Badge value={b.status} /></td><td><div className="row-actions">{b.status === 'PENDING' && <button className="btn accent small" onClick={() => action(b.id,'confirm')}>Confirm</button>}{['PENDING','CONFIRMED'].includes(b.status) && <button className="btn small" onClick={() => action(b.id,'cancel')}>Cancel</button>}{['CONFIRMED','COMPLETED'].includes(b.status) && <button className="btn small" onClick={() => voucher(b.id)}>Voucher</button>}{b.status === 'CANCELLED' && <button className="btn small">Details</button>}</div></td></tr>)}</tbody></table></div></Panel>{voucherUrl && <div className="modal-backdrop" onClick={() => setVoucherUrl('')}><div className="voucher-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>Booking Voucher</h3><button className="btn small" onClick={() => setVoucherUrl('')}>Close</button></div><iframe title="Booking voucher PDF" src={voucherUrl} /></div></div>}</>;
}
