import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBox, Loading, Panel, money, shortDate } from '../components/Ui';

type Payout = { id: string; amount: number | string; status: string; dueDate: string; reference?: string | null; currency?: string; settlementBatch?: { batchCode?: string; periodFrom?: string | null; periodTo?: string | null } | null };
type SettlementLine = { bookingId?: string | null; grossBookingValue: string; vendorPayableBase: string; adjustmentAmount: string; netVendorPayable: string; taxInformational: string; components?: { supplierCommission?: string | number | null }; gstOnCommissionAmount?: string | null; tds194OAmount?: string | null; gstTcsAmount?: string | null };
type Batch = { id: string; batchCode: string; netPayable: string; currency: string; status: string; createdAt: string; periodFrom?: string | null; periodTo?: string | null; lines?: SettlementLine[] };
type SettlementSummary = { paidInSelectedMonth: number; onHold: number; nextPayout: { amount: number; dueDate: string; currency: string; periodFrom?: string | null; periodTo?: string | null } | null; payoutAccount: { masked: string | null; holder: string | null; bankName: string | null; currency: string | null; verificationStatus: string } };
type Tab = 'settlements' | 'releases' | 'legacy';
const VENDOR_BASE = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');

function batchActivityDates(batch: Batch) {
  if (batch.periodFrom && batch.periodTo) return `${shortDate(batch.periodFrom)} – ${shortDate(batch.periodTo)}`;
  return shortDate(batch.periodFrom || batch.periodTo || batch.createdAt);
}

function uniqueBookingCount(batch: Batch) {
  return new Set((batch.lines || []).map((line) => line.bookingId).filter((id): id is string => Boolean(id))).size;
}

function lineTax(batch: Batch, key: 'gstOnCommissionAmount' | 'tds194OAmount' | 'gstTcsAmount') {
  const values = (batch.lines || []).map((line) => line[key]).filter((value): value is string => value !== null && value !== undefined);
  return values.length ? money(values.reduce((sum, value) => sum + Number(value), 0), batch.currency) : '—';
}

export default function Payouts() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [legacy, setLegacy] = useState<Payout[]>([]);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [tab, setTab] = useState<Tab>('settlements');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function downloadStatement(batch: Batch) {
    try {
      const blob = await api.blob(`/settlements/${batch.id}/statement.csv`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${batch.batchCode}-statement.csv`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => {
    api.request<{ batches: Batch[]; payouts: Payout[]; legacyPayouts: Payout[]; summary?: SettlementSummary }>('/settlements')
      .then((result) => { setBatches(result.batches || []); setPayouts(result.payouts || []); setLegacy(result.legacyPayouts || []); setSummary(result.summary || null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const settlementRows = batches.map((batch) => {
    const gross = batch.lines?.reduce((sum, line) => sum + Number(line.grossBookingValue), 0) ?? 0;
    const commission = batch.lines?.reduce((sum, line) => sum + Number(line.components?.supplierCommission ?? Number(line.grossBookingValue) - Number(line.vendorPayableBase)), 0) ?? 0;
    return <tr key={batch.id}>
      <td>{batchActivityDates(batch)}<br /><small className="muted">{batch.batchCode}</small></td>
      <td className="r">{uniqueBookingCount(batch)}</td>
      <td className="r">{money(gross, batch.currency)}</td>
      <td className="r">{money(commission, batch.currency)}</td>
      <td className="r">{lineTax(batch, 'gstOnCommissionAmount')}</td>
      <td className="r">{lineTax(batch, 'tds194OAmount')}</td>
      <td className="r">{lineTax(batch, 'gstTcsAmount')}</td>
      <td className="r">{money(batch.netPayable, batch.currency)}</td>
      <td><Badge value={batch.status} /></td>
      <td><button className="btn small" onClick={() => void downloadStatement(batch)}>Statement</button></td>
    </tr>;
  });
  const payoutAccountDetail = summary?.payoutAccount.masked
    ? [summary.payoutAccount.bankName, 'change needs re-verification'].filter(Boolean).join(' · ')
    : 'Add payout details in Business profile & KYC';
  const nextPayoutDetail = summary?.nextPayout
    ? [`Due ${shortDate(summary.nextPayout.dueDate)}`, summary.nextPayout.periodFrom && summary.nextPayout.periodTo ? `activities ${shortDate(summary.nextPayout.periodFrom)}–${shortDate(summary.nextPayout.periodTo)}` : null].filter(Boolean).join(' · ')
    : 'No pending release';

  return <>
    <header className="partner-page-header">
      <div><span className="partner-eyebrow">Partner Hub</span><h1>Payments</h1><p>Weekly payouts for activities completed 7 days earlier. Commission and tax are deducted before transfer.</p></div>
      <a className="btn" href={`${VENDOR_BASE}/vendor/reports`}>All statements</a>
    </header>
    <div className="kpi-row four">
      <div className="kpi-card"><span>Next payout</span><strong>{summary?.nextPayout ? money(summary.nextPayout.amount, summary.nextPayout.currency) : '—'}</strong><small>{nextPayoutDetail}</small></div>
      <div className="kpi-card"><span>Paid this month</span><strong>{money(summary?.paidInSelectedMonth || 0, 'INR')}</strong><small>Released, reconciled or paid evidence</small></div>
      <div className="kpi-card"><span>On hold</span><strong>{money(summary?.onHold || 0, 'INR')}</strong><small>Blocked settlement batches</small></div>
      <div className="kpi-card"><span>Payout account</span><strong>{summary?.payoutAccount.masked || 'Not configured'}</strong><small>{summary?.payoutAccount.verificationStatus || 'PENDING'} · {payoutAccountDetail}</small></div>
    </div>
    <div className="toolbar"><div className="chips">
      <button className={`chip ${tab === 'settlements' ? 'active' : ''}`} onClick={() => setTab('settlements')}>Settlement history</button>
      <button className={`chip ${tab === 'releases' ? 'active' : ''}`} onClick={() => setTab('releases')}>Payout release history</button>
      <button className={`chip ${tab === 'legacy' ? 'active' : ''}`} onClick={() => setTab('legacy')}>Legacy payout history</button>
    </div></div>
    {tab === 'settlements' && <Panel title="Settlement history">
      <p className="muted">Gross, commission and tax values come from canonical settlement evidence. Tax fields show “—” when they were not captured separately.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Activity dates</th><th className="r">Bookings</th><th className="r">Gross sales</th><th className="r">Commission</th><th className="r">GST on commission</th><th className="r">TDS 194-O</th><th className="r">GST TCS</th><th className="r">Net payout</th><th>Status</th><th aria-label="Statement" /></tr></thead>
        <tbody>{settlementRows}</tbody>
      </table></div>
      {!batches.length && <div className="empty">No canonical settlements yet.</div>}
      <p className="muted">Commission is invoiced to you with GST; the invoice is in Reports. TDS and TCS appear in your Form 26AS / GSTR-2A, and certificates are issued quarterly.</p>
    </Panel>}
    {tab === 'releases' && <Panel title="Payout release history">
      <p className="muted">These rows record payout state and evidence in Voya. They do not represent a connected bank transfer.</p>
      <div className="table-wrap"><table><thead><tr><th>Batch</th><th>Due date</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead>
        <tbody>{payouts.map((payout) => <tr key={payout.id}><td className="mono">{payout.settlementBatch?.batchCode || '—'}</td><td>{shortDate(payout.dueDate)}</td><td>{money(payout.amount, payout.currency)}</td><td className="mono">{payout.reference || '—'}</td><td><Badge value={payout.status} /></td></tr>)}</tbody>
      </table></div>
      {!payouts.length && <div className="empty">No canonical payout release records yet.</div>}
    </Panel>}
    {tab === 'legacy' && <Panel title="Legacy payout history">
      <p className="muted">Historical and legacy payout records, retained separately from current settlement evidence.</p>
      <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Due date</th><th>Amount</th><th>Historical status</th></tr></thead>
        <tbody>{legacy.map((payout) => <tr key={payout.id}><td className="mono">{payout.reference || payout.id}</td><td>{shortDate(payout.dueDate)}</td><td>{money(payout.amount, payout.currency)}</td><td><Badge value={payout.status} /></td></tr>)}</tbody>
      </table></div>
      {!legacy.length && <div className="empty">No legacy payout records.</div>}
    </Panel>}
  </>;
}
