import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBox, Loading, Panel } from '../components/Ui';

type Batch = { id: string; batchCode: string; vendorTenantId: string; currency: string; netPayable: string; status: string; lineCount: number; payout?: { id: string; status: string; amount: string } | null };
export default function AdminSettlements() {
  const [rows, setRows] = useState<Batch[]>([]); const [config, setConfig] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { Promise.all([api.request<Batch[]>('/admin/settlements'), api.request<any>('/admin/finance/configuration')]).then(([batches, configuration]) => { setRows(batches); setConfig(configuration); }).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox error={error} />; if (!config) return <Loading />;
  return <><div className="kpi-row three"><div className="kpi-card"><span>Collection model</span><strong>{config.paymentCollectionMode}</strong><small>Release controls are configuration gated</small></div><div className="kpi-card"><span>Settlement batches</span><strong>{rows.length}</strong><small>Canonical history only</small></div><div className="kpi-card"><span>Needs attention</span><strong>{rows.filter((row) => ['PAYOUT_BLOCKED', 'RECONCILIATION_REQUIRED'].includes(row.status)).length}</strong><small>Exceptions and holds require review</small></div></div><Panel title="Settlement Control Tower"><p className="muted">Each row is a vendor settlement batch. Preview before creating; vendor value, adjustments and net payable remain separately traceable.</p><div className="table-wrap"><table><thead><tr><th>Batch</th><th>Vendor tenant</th><th>Net payable</th><th>Lines</th><th>Status</th><th>Payout</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="mono">{row.batchCode}</td><td className="mono">{row.vendorTenantId.slice(0, 8)}…</td><td>{row.currency} {row.netPayable}</td><td>{row.lineCount}</td><td><Badge value={row.status} /></td><td>{row.payout ? <Badge value={row.payout.status} /> : '—'}</td></tr>)}</tbody></table></div></Panel></>;
}
