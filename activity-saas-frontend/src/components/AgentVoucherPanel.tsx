import { useEffect, useState } from 'react';
import { api, type AgentBooking } from '../api';
import { Badge, ErrorBox } from './Ui';

type Voucher = { id: string; version: number; voucherCode: string; generatedAt: string; fileId: string };
type Evidence = { kind: string; versionNumber: number; referenceValue?: string; fileId?: string };
type VoucherResponse = { currentVoucher: Voucher | null; readiness?: { ready: boolean; reasonCodes?: string[] }; reason?: string; travellerEvidence?: Evidence[] };
const terminalStatuses = ['CANCELLED', 'VENDOR_REJECTED', 'MANUAL_REJECTED', 'CONFIRMATION_EXPIRED', 'EXPIRED'];

function pendingMessage(data: VoucherResponse) {
  if (data.reason === 'VOUCHER_GENERATION_FAILED') return 'Voucher generation failed. Please contact support or refresh to check again.';
  if (data.reason === 'BOOKING_TERMINAL') return 'Voucher unavailable. This booking cannot be used for entry.';
  if (data.readiness?.reasonCodes?.includes('BOOKING_NOT_CONFIRMED')) return 'The voucher will be available after booking confirmation.';
  if (data.readiness?.ready) return 'Generating voucher…';
  return 'Waiting for supplier evidence';
}

export default function AgentVoucherPanel({ booking, canBook }: { booking: AgentBooking; canBook: boolean }) {
  const [data, setData] = useState<VoucherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const terminal = terminalStatuses.includes(booking.status);
  useEffect(() => {
    if (terminal) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setError('');
    void api.request<VoucherResponse>(`/agent/bookings/${booking.id}/voucher`).then((result) => {
      if (!active) return;
      setData(result);
      // Generation runs asynchronously. Refresh only while a confirmed booking
      // is ready for generation; unmount/cancellation cancels the pending poll.
      if (!result.currentVoucher && result.readiness?.ready && !result.reason?.includes('FAILED')) {
        timer = setTimeout(() => setRefresh((value) => value + 1), 5000);
      }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [booking.id, booking.status, terminal, refresh]);

  async function download(fileId: string, filename: string) {
    const blob = await api.blob(`/files/${fileId}/content`);
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  }
  async function share(channel: 'DOWNLOAD' | 'EMAIL' | 'WHATSAPP') {
    if (!data?.currentVoucher || terminal) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.request<{ status: string }>(`/agent/bookings/${booking.id}/voucher/share`, { method: 'POST', body: JSON.stringify({ channel, ...(channel !== 'DOWNLOAD' ? { recipient } : {}) }) });
      if (channel === 'DOWNLOAD') await download(data.currentVoucher.fileId, `${booking.publicCode || booking.bookingCode}-voucher-v${data.currentVoucher.version}.pdf`);
      else setNotice(result.status === 'QUEUED' ? `Voucher queued for ${channel.toLowerCase()} delivery.` : 'Voucher delivery requested.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  if (terminal) return <><h4>Voucher</h4><p className="muted">{booking.status === 'CANCELLED' ? 'Voucher voided. This booking cannot be used for entry.' : 'Voucher unavailable. This booking cannot be used for entry.'}</p></>;
  return <section aria-label="Booking voucher">
    <h4>Voucher</h4>
    {error && <ErrorBox error={error} />}{notice && <div className="alert success">{notice}</div>}
    {data?.currentVoucher ? <>
      <p><Badge value="CURRENT" /> Version {data.currentVoucher.version} · {new Date(data.currentVoucher.generatedAt).toLocaleString()}</p>
      <p className="agent-mono">{data.currentVoucher.voucherCode}</p>
      <div className="agent-voucher-actions"><button className="btn primary" disabled={busy || !canBook} onClick={() => void share('DOWNLOAD')}>Download voucher</button>{canBook && <><input aria-label="Voucher recipient" placeholder="recipient email or +E.164 phone" value={recipient} onChange={(event) => setRecipient(event.target.value)} /><button className="btn" disabled={busy || !recipient} onClick={() => void share('EMAIL')}>Email</button><button className="btn" disabled={busy || !recipient} onClick={() => void share('WHATSAPP')}>WhatsApp</button></>}</div>
    </> : <p className="muted" role="status">{loading ? 'Loading voucher…' : error ? 'Could not load the voucher.' : data ? pendingMessage(data) : 'Voucher unavailable.'}</p>}
    <button className="btn small" disabled={loading || busy} onClick={() => setRefresh((value) => value + 1)}>Refresh voucher</button>
    {!!data?.travellerEvidence?.length && <><h4>Traveller ticket / evidence</h4>{data.travellerEvidence.map((item) => <div key={`${item.kind}-${item.versionNumber}`}>{item.kind} v{item.versionNumber} {item.referenceValue || ''} {item.fileId && <button className="link-button" onClick={() => void download(item.fileId!, `${booking.publicCode || booking.bookingCode}-evidence`).catch((cause: Error) => setError(cause.message))}>Download file</button>}</div>)}</>}
  </section>;
}
