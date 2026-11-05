import type { ReactNode } from 'react';
import type { User } from '../api';

export type AgentNavKey = 'dashboard' | 'marketplace' | 'bookings' | 'payments' | 'reports' | 'settings';
const labels: Record<AgentNavKey, string> = { dashboard: 'Overview', marketplace: 'Marketplace', bookings: 'My bookings', payments: 'Payments & commission', reports: 'Reports', settings: 'Business profile & team' };

export default function AgentShell({ user, activeKey, canFinance, onNavigate, onSignOut, onChangePassword, children }: {
  user: User; activeKey: AgentNavKey; canFinance: boolean; onNavigate: (key: AgentNavKey) => void; onSignOut: () => void; onChangePassword: () => void; children: ReactNode;
}) {
  const owner = user.organizationRole === 'OWNER';
  const nav: AgentNavKey[] = ['dashboard', ...(user.organizationRole === 'FINANCE' ? [] : ['marketplace' as const]), 'bookings', ...(canFinance ? ['payments' as const] : []), 'reports', 'settings'];
  return <div className="agent-shell">
    <aside className="agent-sidebar"><div className="agent-brand"><span className="agent-mark">V</span><span><b>Voya</b><small>Agent marketplace</small></span></div><nav aria-label="Agent navigation">{nav.map((key) => <button key={key} className={activeKey === key ? 'active' : ''} onClick={() => onNavigate(key)}>{labels[key]}</button>)}</nav><div className="agent-sidebar-user"><span className="agent-avatar">{(user.fullName || user.email).slice(0, 1).toUpperCase()}</span><span><b>{user.fullName || user.email}</b><small>{owner ? 'Workspace owner' : (user.organizationRole || 'Agent').replaceAll('_', ' ')}</small></span></div></aside>
    <main className="agent-main"><header className="agent-topbar"><div className="agent-mobile-brand"><span className="agent-mark">V</span><b>Voya Agent Console</b></div><div className="agent-topbar-title"><h1>{labels[activeKey]}</h1><p>{user.email} · {user.organizationRole ? user.organizationRole.replaceAll('_', ' ') : 'Travel agent'}</p></div><div className="agent-topbar-actions"><button className="agent-text-button" onClick={onChangePassword}>Change password</button><button className="agent-text-button" onClick={onSignOut}>Sign out</button></div></header><div className="agent-content">{children}</div></main>
  </div>;
}
