import { useEffect, useState, type FormEvent } from 'react';
import { api, type ImpersonationTarget } from '../api';
import { ErrorBox, Loading, Panel } from '../components/Ui';

type Tier = { name: string; threshold: string; commissionPercent: number; creditLimit: number; creditDays: number };
type TravelAgent = {
  id: string;
  name: string;
  publicCode?: string | null;
  agentProfile?: { legalBusinessName?: string | null; operatingCity?: string | null; verificationStatus?: string | null } | null;
  agentCommercialProfile?: { tier: string; commissionPercent: number | string; creditLimit: number | string; creditDays: number; walletBalance: number | string; creditOutstanding: number | string; markupAllowedPercent: number | string } | null;
  bookings30d: number;
  gmv30d: number;
  users?: Array<ImpersonationTarget>;
};

const money = (value: number | string | null | undefined) => `₹${Math.round(Number(value || 0)).toLocaleString('en-IN')}`;

export default function AdminAgents({ canImpersonate = false }: { canImpersonate?: boolean }) {
  const [agents, setAgents] = useState<TravelAgent[]>([]);
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [creditReference, setCreditReference] = useState('');
  const [notice, setNotice] = useState('');
  const [tierReason, setTierReason] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [agentRows, tierResponse] = await Promise.all([api.request<TravelAgent[]>('/admin/agents'), api.request<{ tiers: Tier[] }>('/admin/agents/tiers')]);
      setAgents(agentRows); setTiers(tierResponse.tiers);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function saveTiers() {
    setSaving(true); setError('');
    try { const request = await api.request<{ publicCode?: string }>('/admin/agents/tiers', { method: 'PATCH', body: JSON.stringify({ tiers, reason: tierReason }) }); setTierReason(''); setNotice(`Tier defaults ${request.publicCode || ''} submitted. A different Admin must approve them before they take effect.`); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  async function setVerification(tenantId: string, action: 'approve' | 'suspend') {
    const reason = action === 'suspend' ? window.prompt('Reason for suspending this agent?') : undefined;
    if (action === 'suspend' && !reason?.trim()) return;
    setActionBusy(tenantId); setError('');
    try { await api.request(`/admin/agents/${tenantId}/${action}`, { method: 'POST', ...(reason ? { body: JSON.stringify({ reason }) } : {}) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setActionBusy(null); }
  }

  async function saveCommercial(event: FormEvent<HTMLFormElement>, agent: TravelAgent) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setSaving(true); setError('');
    try { const request = await api.request<{ publicCode?: string }>(`/admin/agents/${agent.id}/commercials`, { method: 'PATCH', body: JSON.stringify({ tier: String(form.get('tier')), commissionPercent: Number(form.get('commissionPercent')), creditLimit: Number(form.get('creditLimit')), creditDays: Number(form.get('creditDays')), markupAllowedPercent: Number(form.get('markupAllowedPercent')), reason: String(form.get('reason')) }) }); setNotice(`Commercial change ${request.publicCode || ''} submitted. Current terms remain active until a different Admin approves it.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  async function creditWallet(event: FormEvent, agent: TravelAgent) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { const request = await api.request<{ publicCode?: string }>(`/admin/agents/${agent.id}/wallet/credit`, { method: 'POST', body: JSON.stringify({ amount: Number(creditAmount), reason: creditReason, reference: creditReference || undefined }) }); setCreditAmount(''); setCreditReason(''); setCreditReference(''); setNotice(`Wallet credit request ${request.publicCode || ''} submitted. A different Admin must approve it before the balance changes.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  async function loginAs(agent: TravelAgent) {
    const target = agent.users?.find((user) => user.active && user.id); if (!target || !api.token) return;
    setImpersonatingId(target.id); setError('');
    try { sessionStorage.setItem('voya_impersonation_original_token', api.token); const result = await api.request<{ accessToken: string }>('/auth/impersonation/start', { method: 'POST', body: JSON.stringify({ targetUserId: target.id, reason: 'Support session started from Travel Agents' }) }); api.setToken(result.accessToken); window.location.assign(import.meta.env.BASE_URL); }
    catch (e) { sessionStorage.removeItem('voya_impersonation_original_token'); setError(e instanceof Error ? e.message : String(e)); setImpersonatingId(null); }
  }

  async function resetPasswordForAgent(event: FormEvent, userId: string) {
    event.preventDefault(); setResetBusy(true); setError('');
    try { await api.request(`/admin/users/${userId}/password`, { method: 'PATCH', body: JSON.stringify({ password: resetPassword }) }); setResettingId(null); setResetPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setResetBusy(false); }
  }

  if (loading) return <Loading />;
  const selected = agents.find((agent) => agent.id === selectedId) || null;
  const filteredAgents = agents.filter((agent) => [agent.name, agent.agentProfile?.legalBusinessName, agent.agentProfile?.operatingCity, agent.publicCode, agent.users?.find((user) => user.active)?.email].some((value) => value?.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())));
  return <>
    {error && <ErrorBox error={error} />}
    {notice && <div className="alert success" role="status">{notice}</div>}
    <div className="admin-hero"><div><h2>Travel agents</h2><p className="muted">B2B partners who book activities for their customers from the agent portal, paying from a wallet or credit line.</p></div><button className="btn small" onClick={() => void load()}>Refresh</button></div>
    <Panel title="Tiers & default commission" action={<button className="btn small primary" onClick={() => void saveTiers()} disabled={saving || tierReason.trim().length < 5}>{saving ? 'Submitting…' : 'Submit for approval'}</button>}>
      <div className="table-wrap"><table><thead><tr><th>Tier</th><th>GMV threshold</th><th className="right">Commission %</th><th className="right">Credit limit</th><th className="right">Credit days</th></tr></thead><tbody>{tiers.map((tier, index) => <tr key={tier.name}><td><strong>{tier.name}</strong></td><td>{tier.threshold}</td><td><input className="admin-inline-input" type="number" min="0" max="100" value={tier.commissionPercent} onChange={(event) => setTiers(tiers.map((item, itemIndex) => itemIndex === index ? { ...item, commissionPercent: Number(event.target.value) } : item))} /></td><td><input className="admin-inline-input" type="number" min="0" value={tier.creditLimit} onChange={(event) => setTiers(tiers.map((item, itemIndex) => itemIndex === index ? { ...item, creditLimit: Number(event.target.value) } : item))} /></td><td><input className="admin-inline-input" type="number" min="0" value={tier.creditDays} onChange={(event) => setTiers(tiers.map((item, itemIndex) => itemIndex === index ? { ...item, creditDays: Number(event.target.value) } : item))} /></td></tr>)}</tbody></table></div>
      <label className="field"><span>Reason for changing the tier defaults</span><input required minLength={5} maxLength={500} value={tierReason} onChange={(event) => setTierReason(event.target.value)} placeholder="Why do these default terms need to change?" /></label>
    </Panel>
    <Panel title={`${filteredAgents.length} travel agents`}>
      <div className="admin-toolbar"><input aria-label="Search travel agents" placeholder="Search by agency, city, public code or email" value={q} onChange={(event) => setQ(event.target.value)} /></div>
      <div className="table-wrap"><table><thead><tr><th>Agency</th><th>City</th><th>Tier</th><th className="right">Commission</th><th className="right">Wallet</th><th className="right">Credit used</th><th className="right">GMV · 30 days</th><th>Status</th><th></th></tr></thead><tbody>{filteredAgents.map((agent) => { const profile = agent.agentCommercialProfile; const target = agent.users?.find((user) => user.active && user.id); const status = agent.agentProfile?.verificationStatus || 'PENDING'; return <tr key={agent.id}><td><strong>{agent.agentProfile?.legalBusinessName || agent.name}</strong><small className="mono">{agent.publicCode || 'No public code'} · {target?.email || 'No active login'}</small></td><td>{agent.agentProfile?.operatingCity || '—'}</td><td>{profile?.tier || 'Silver'}</td><td className="right">{Number(profile?.commissionPercent || 0)}%</td><td className="right">{money(profile?.walletBalance)}</td><td className="right">{money(profile?.creditOutstanding)}</td><td className="right">{money(agent.gmv30d)}</td><td><span className={'badge ' + status.toLowerCase()}>{status}</span></td><td className="right"><button className="btn small" onClick={() => setSelectedId(selectedId === agent.id ? null : agent.id)}>Open</button></td></tr>; })}</tbody></table>{!filteredAgents.length && <div className="empty">No travel agents match this search.</div>}</div>
    </Panel>
    {selected && <Panel title={`${selected.agentProfile?.legalBusinessName || selected.name} · commercial controls`}><form className="form-grid three" onSubmit={(event) => void saveCommercial(event, selected)}><label className="field"><span>Tier</span><select name="tier" defaultValue={selected.agentCommercialProfile?.tier || 'Silver'}>{tiers.map((tier) => <option key={tier.name}>{tier.name}</option>)}</select></label><label className="field"><span>Commission %</span><input name="commissionPercent" type="number" min="0" max="100" defaultValue={Number(selected.agentCommercialProfile?.commissionPercent || 0)} /></label><label className="field"><span>Markup allowed %</span><input name="markupAllowedPercent" type="number" min="0" max="100" defaultValue={Number(selected.agentCommercialProfile?.markupAllowedPercent || 0)} /></label><label className="field"><span>Credit limit (₹)</span><input name="creditLimit" type="number" min="0" defaultValue={Number(selected.agentCommercialProfile?.creditLimit || 0)} /></label><label className="field"><span>Credit days</span><input name="creditDays" type="number" min="0" defaultValue={selected.agentCommercialProfile?.creditDays || 0} /></label><label className="field"><span>Reason for change</span><input name="reason" required minLength={5} maxLength={500} placeholder="Why do these terms need to change?" /></label><div className="status-actions"><button className="btn primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit for approval'}</button>{selected.agentProfile?.verificationStatus === 'PENDING' && <button type="button" className="btn primary" disabled={actionBusy === selected.id} onClick={() => void setVerification(selected.id, 'approve')}>Approve</button>}{selected.agentProfile?.verificationStatus === 'APPROVED' && <button type="button" className="btn" disabled={actionBusy === selected.id} onClick={() => void setVerification(selected.id, 'suspend')}>Suspend</button>}</div></form><p className="muted">Proposed commercial terms take effect only after an independent Admin approves them in Approvals.</p><form className="form-grid four" onSubmit={(event) => void creditWallet(event, selected)}><label className="field"><span>Manual wallet credit (₹)</span><input required min="1" type="number" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} /></label><label className="field"><span>Reason</span><input required value={creditReason} onChange={(event) => setCreditReason(event.target.value)} /></label><label className="field"><span>Reference</span><input value={creditReference} onChange={(event) => setCreditReference(event.target.value)} placeholder="UTR / approval" /></label><button className="btn" disabled={saving}>Request credit approval</button></form><p className="muted">The wallet balance changes only after a different Admin approves the request in Approvals.</p>{canImpersonate && <div className="status-actions"><button className="btn small" disabled={!selected.users?.some((user) => user.active) || impersonatingId !== null} onClick={() => void loginAs(selected)}>{impersonatingId ? 'Opening…' : 'Login as'}</button>{selected.users?.find((user) => user.active && user.id) && <button className="btn small" disabled={!selected.users?.find((user) => user.active && user.id)} onClick={() => { const id = selected.users?.find((user) => user.active && user.id)?.id || null; setResettingId(resettingId === id ? null : id); setResetPassword(''); }}>Reset password</button>}</div>}{canImpersonate && selected.users?.find((user) => user.active && user.id)?.id === resettingId && <form className="form-grid three" onSubmit={(event) => void resetPasswordForAgent(event, resettingId)}><label className="field"><span>New password</span><input required minLength={8} type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label><button className="btn primary" disabled={resetBusy}>{resetBusy ? 'Saving…' : 'Set new password'}</button></form>}</Panel>}
  </>;
}
