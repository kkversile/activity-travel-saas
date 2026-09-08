import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBox, Loading, money, Panel, shortDate } from '../components/Ui';

type Payout = { id: string; amount: number; status: string; dueDate: string; reference?: string };

export default function Payouts() {
  const [rows, setRows] = useState<Payout[]>([]); const [error,setError]=useState('');
  useEffect(() => { api.request<Payout[]>('/payouts').then(setRows).catch((e)=>setError(e.message)); }, []);
  const totals = useMemo(() => ({ scheduled: rows.filter(r=>r.status==='SCHEDULED').reduce((a,b)=>a+b.amount,0), transit: rows.filter(r=>r.status==='IN_TRANSIT').reduce((a,b)=>a+b.amount,0), paid: rows.filter(r=>r.status==='PAID').reduce((a,b)=>a+b.amount,0) }), [rows]);
  if (error) return <ErrorBox error={error} />; if (!rows.length) return <Loading />;
  return <><div className="kpi-row three"><div className="kpi-card"><span>Available / Scheduled</span><strong>{money(totals.scheduled)}</strong><small>Next settlement cycle</small></div><div className="kpi-card"><span>In Transit</span><strong>{money(totals.transit)}</strong><small>Bank processing</small></div><div className="kpi-card"><span>Recently Paid</span><strong>{money(totals.paid)}</strong><small>Settled</small></div></div><Panel title="Settlement History"><div className="table-wrap"><table><thead><tr><th>Reference</th><th>Due date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td className="mono">{p.reference}</td><td>{shortDate(p.dueDate)}</td><td>{money(p.amount)}</td><td><Badge value={p.status} /></td></tr>)}</tbody></table></div></Panel></>;
}
