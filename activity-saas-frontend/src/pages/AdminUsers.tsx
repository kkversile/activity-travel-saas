import { useEffect, useState, type FormEvent } from 'react';
import { api, type PlatformAdmin } from '../api';
import { ErrorBox, Field, Loading, Panel } from '../components/Ui';

export default function AdminUsers() {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  async function load() {
    try { setAdmins(await api.request<PlatformAdmin[]>('/admin/platform-admins')); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.request<PlatformAdmin>('/admin/platform-admins', { method: 'POST', body: JSON.stringify({ fullName, email, password }) }); setFullName(''); setEmail(''); setPassword(''); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function setStatus(admin: PlatformAdmin) {
    setError('');
    try { await api.request<PlatformAdmin>(`/admin/platform-admins/${admin.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !admin.active }) }); await load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function resetAdminPassword(e: FormEvent) {
    e.preventDefault(); if (!resettingId) return; setResetBusy(true); setError('');
    try { await api.request<PlatformAdmin>(`/admin/platform-admins/${resettingId}/password`, { method: 'PATCH', body: JSON.stringify({ password: resetPassword }) }); setResettingId(null); setResetPassword(''); }
    catch (e) { setError((e as Error).message); }
    finally { setResetBusy(false); }
  }

  if (loading) return <Loading />;
  return <>
    {error && <ErrorBox error={error} />}
    <div className="admin-hero"><div><h2>Admin management</h2><p className="muted">Super Admins can create and control platform Admin accounts.</p></div></div>
    <Panel title="Add Admin"><form onSubmit={(e) => void create(e)}><div className="form-grid three"><Field label="Full name"><input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field><Field label="Email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field label="Temporary password" hint="Use at least 8 characters; share it securely."><input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field></div><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create Admin'}</button></form></Panel>
    <Panel title="Admin accounts"><div className="listing-list">{admins.filter((admin) => admin.role === 'ADMIN').map((admin) => <div className="listing-card" key={admin.id}><div className="admin-hero"><div><b>{admin.fullName}</b><span>{admin.email} · ADMIN</span></div><div className="status-actions"><span className={`badge ${admin.active ? 'verified' : 'suspended'}`}>{admin.active ? 'ACTIVE' : 'INACTIVE'}</span><button className="btn small" onClick={() => void setStatus(admin)}>{admin.active ? 'Deactivate' : 'Activate'}</button><button className="btn small" onClick={() => { setResettingId(resettingId === admin.id ? null : admin.id); setResetPassword(''); }}>Reset password</button></div></div>{resettingId === admin.id && <form className="form-grid three" onSubmit={(e) => void resetAdminPassword(e)}><Field label="New password" hint="At least 8 characters."><input required minLength={8} type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} /></Field><button className="btn primary" disabled={resetBusy}>{resetBusy ? 'Saving…' : 'Set new password'}</button></form>}</div>)}{!admins.some((admin) => admin.role === 'ADMIN') && <div className="empty">No Admin accounts found.</div>}</div></Panel>
  </>;
}
