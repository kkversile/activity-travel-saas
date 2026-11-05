import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Loading, Panel } from '../components/Ui';

type AuditRow = { id: string; publicCode?: string | null; actorId?: string | null; actorRole?: string | null; action: string; entityType: string; entityId?: string | null; reason?: string | null; beforeState?: unknown; afterState?: unknown; createdAt: string };

const permissionRows = [
  ['Approve vendors', '✓', '✓', '—', '—', '—', '—', '—'],
  ['Approve activities and changes', '✓', '✓', '✓', '—', '—', '—', '—'],
  ['Edit any activity', '✓', '✓', '✓', '—', '—', '—', '—'],
  ['Vendor commission', '✓', 'Propose', '—', 'Approve', 'View', '—', '—'],
  ['Pricing rules', '✓', 'View', '—', 'Propose', 'Approve', '—', '—'],
  ['Approve agents, agent commission', '✓', '—', '—', 'View', '—', '✓', '—'],
  ['Release payouts', '✓', '—', '—', '—', 'Maker / checker', '—', '—'],
  ['Refunds', '✓', '—', '—', '—', 'Approve', '—', 'Raise'],
  ['Cancel or amend bookings', '✓', 'View', '—', '—', 'View', 'View', '✓'],
  ['Log in as vendor or agent', '✓', '✓', '—', '—', '—', '✓', '✓'],
  ['Configuration and staff', '✓', '—', '—', '—', '—', '—', '—'],
] as const;

export default function AdminAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (action.trim()) params.set('action', action.trim());
      if (entityType.trim()) params.set('entityType', entityType.trim());
      setRows(await api.request<AuditRow[]>(`/admin/audit-log?${params}`));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  function exportCsv() {
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [['When', 'Event ID', 'Action', 'Entity type', 'Entity id', 'Actor', 'Reason', 'Before', 'After'], ...rows.map((row) => [row.createdAt, row.publicCode || row.id, row.action, row.entityType, row.entityId || '', row.actorId || '', row.reason || '', JSON.stringify(row.beforeState || {}), JSON.stringify(row.afterState || {})])].map((line) => line.map(escape).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'voya-admin-audit-log.csv'; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="admin-products-page">
    {error && <ErrorBox error={error} />}
    <Panel title="Permission matrix">
      <div className="table-wrap"><table><thead><tr><th>Permission</th><th>Super admin</th><th>Supply manager</th><th>QC / content</th><th>Revenue</th><th>Finance</th><th>Agent manager</th><th>Support</th></tr></thead><tbody>{permissionRows.map((row) => <tr key={row[0]}><td><strong>{row[0]}</strong></td>{row.slice(1).map((value, index) => <td key={`${row[0]}-${index}`} className={value === '—' ? 'muted' : undefined}>{value}</td>)}</tr>)}</tbody></table></div>
    </Panel>
    <Panel title="Audit log" action={<><button className="btn small" onClick={exportCsv} disabled={!rows.length}>Export CSV</button><button className="btn small" onClick={() => void load()}>Refresh</button></>}>
      <div className="form-grid three">
        <label className="field"><span>Action</span><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="PRODUCT_PUBLISHED" /></label>
        <label className="field"><span>Entity type</span><input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="ProductRevision" /></label>
        <button className="btn primary" onClick={() => void load()}>Apply filters</button>
      </div>
      {loading ? <Loading text="Loading audit events…" /> : <div className="table-wrap"><table><thead><tr><th>When</th><th>Event ID</th><th>Action</th><th>Entity</th><th>Actor</th><th>Reason</th><th>Change</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td className="mono">{row.publicCode || row.id}</td><td className="mono">{row.action}</td><td>{row.entityType}<small className="mono">{row.entityId || '—'}</small></td><td>{row.actorRole || 'System'}<small className="mono">{row.actorId || '—'}</small></td><td>{row.reason || '—'}</td><td><details><summary>View diff</summary><pre className="audit-diff">{JSON.stringify({ before: row.beforeState || null, after: row.afterState || null }, null, 2)}</pre></details></td></tr>)}</tbody></table>{!rows.length && <div className="empty">No audit events match the selected filters.</div>}</div>}
    </Panel>
  </div>;
}
