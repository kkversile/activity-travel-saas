import { useState } from 'react';
import { api, type User } from '../api';

const ORIGINAL_TOKEN_KEY = 'voya_impersonation_original_token';

export default function ImpersonationBanner({ user, onEnded }: { user: User; onEnded: () => void }) {
  const [busy, setBusy] = useState(false);
  async function end() {
    setBusy(true);
    try { await api.request('/auth/impersonation/end', { method: 'POST' }); } catch { /* restore the original session even if the short-lived target token expired */ }
    const original = sessionStorage.getItem(ORIGINAL_TOKEN_KEY);
    sessionStorage.removeItem(ORIGINAL_TOKEN_KEY);
    api.setToken(original);
    onEnded();
  }
  return <div style={{ position: 'fixed', zIndex: 20, inset: '0 0 auto', background: '#6d28d9', color: '#fff', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '8px 16px', fontSize: 13, boxShadow: '0 2px 12px rgba(0,0,0,.18)' }}><span>You are viewing Voya as <strong>{user.fullName || user.email}</strong> ({user.role.replace('_', ' ')})</span><button className="btn small" style={{ background: '#fff', color: '#5b21b6', borderColor: '#fff' }} disabled={busy} onClick={() => void end()}>{busy ? 'Ending…' : 'Return to Super Admin'}</button></div>;
}
