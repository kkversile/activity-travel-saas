import { useEffect, useState } from 'react';
import { api, type ImpersonationTarget } from '../api';
import { ErrorBox, Loading, Panel } from '../components/Ui';

type TravelAgent = { id: string; name: string; agentProfile?: { legalBusinessName?: string | null; verificationStatus?: string | null } | null; users?: Array<ImpersonationTarget> };

export default function AdminAgents({ canImpersonate = false }: { canImpersonate?: boolean }) {
  const [agents, setAgents] = useState<TravelAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  async function load() {
    try { setAgents(await api.request<TravelAgent[]>('/admin/agents')); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function loginAs(agent: TravelAgent) {
    const target = agent.users?.find((user) => user.active && user.id);
    if (!target || !api.token) return;
    setImpersonatingId(target.id); setError('');
    try {
      sessionStorage.setItem('voya_impersonation_original_token', api.token);
      const result = await api.request<{ accessToken: string }>('/auth/impersonation/start', { method: 'POST', body: JSON.stringify({ targetUserId: target.id, reason: 'Support session started from Travel Agents' }) });
      api.setToken(result.accessToken); window.location.assign(import.meta.env.BASE_URL);
    } catch (e) {
      sessionStorage.removeItem('voya_impersonation_original_token'); setError((e as Error).message); setImpersonatingId(null);
    }
  }

  if (loading) return <Loading />;
  return <>
    {error && <ErrorBox error={error} />}
    <div className="admin-hero"><div><h2>Travel Agents</h2><p className="muted">Manage travel-agent accounts and open the agent console when support is needed.</p></div><button className="btn small" onClick={() => void load()}>Refresh</button></div>
    <Panel title={`${agents.length} travel agents`}><div className="listing-list">{agents.map((agent) => { const target = agent.users?.find((user) => user.active && user.id); const status = agent.agentProfile?.verificationStatus || 'PENDING'; return <div className="listing-card" key={agent.id}><div className="admin-hero"><div><b>{agent.agentProfile?.legalBusinessName || agent.name}</b><span>{target?.fullName || agent.name} · {target?.email || 'No active login'}</span></div><div className="status-actions"><span className={'badge ' + status.toLowerCase()}>{status}</span>{canImpersonate && <button className="btn small" disabled={!target || impersonatingId === target.id} onClick={() => void loginAs(agent)}>{impersonatingId === target?.id ? 'Opening…' : 'Login as'}</button>}</div></div></div>; })}{!agents.length && <div className="empty">No travel agents found.</div>}</div></Panel>
  </>;
}
