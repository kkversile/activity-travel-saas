import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBox, Loading, Panel } from '../components/Ui';

export default function AdminFulfilment() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function load() {
    try { setError(''); setRows(await api.request<any[]>('/admin/fulfilment')); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function retry(id: string) {
    if (busyId) return;
    setBusyId(id); setError(''); setNotice('');
    try {
      await api.request(`/admin/fulfilment/${id}/voucher/retry`, { method: 'POST' });
      setNotice('Voucher generation requested. Refresh to check progress. The current voucher remains valid until its replacement is ready.');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  }
  if (loading) return <Loading />;
  return <>{error && <ErrorBox error={error} />}{notice && <div className="alert success" role="status">{notice}</div>}
    <Panel title="Voucher generation" action={<button className="btn small" onClick={() => void load()}>Refresh</button>}>
      <p className="muted">Inspect fulfilment, retry failed vouchers or regenerate a confirmed booking's voucher. Previous versions remain in the history; Admins cannot mark a voucher valid manually.</p>
      <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Mode</th><th>Queue</th><th>Readiness</th><th>Last error</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
        <td className="mono">{row.bookingCode}</td><td>{row.mode}</td><td><Badge value={row.status} /> <Badge value={row.generationStatus} /></td><td>{row.readiness?.reasonCodes?.join(', ') || 'Ready'}</td><td>{row.lastGenerationError || '—'}</td>
        <td>{row.generationStatus === 'FAILED' && <button className="btn small accent" disabled={busyId !== null} onClick={() => void retry(row.bookingId)}>Retry</button>}
          {row.generationStatus === 'SUCCEEDED' && row.booking?.status === 'CONFIRMED' && row.readiness?.ready && <button className="btn small" disabled={busyId !== null} onClick={() => void retry(row.bookingId)}>{busyId === row.bookingId ? 'Requesting…' : 'Regenerate voucher'}</button>}</td>
      </tr>)}</tbody></table></div>{!rows.length && <div className="empty">No fulfilment records.</div>}
    </Panel>
  </>;
}
