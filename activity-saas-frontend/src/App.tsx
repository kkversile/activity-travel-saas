import { useEffect, useState, type FormEvent } from 'react';
import { api, type User, type VendorProfile } from './api';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Bookings from './pages/Bookings';
import Payouts from './pages/Payouts';
import Performance from './pages/Performance';
import AdminDashboard from './pages/AdminDashboard';
import AdminVendors from './pages/AdminVendors';
import AdminReview from './pages/AdminReview';
import AdminCommercial from './pages/AdminCommercial';
import AdminEligibility from './pages/AdminEligibility';
import AdminBookings from './pages/AdminBookings';
import AdminRefunds from './pages/AdminRefunds';
import FulfilmentCentre from './pages/FulfilmentCentre';
import AdminFulfilment from './pages/AdminFulfilment';
import AdminSettlements from './pages/AdminSettlements';
import AdminQuality from './pages/AdminQuality';
import AdminDemand from './pages/AdminDemand';
import Opportunities from './pages/Opportunities';
import AdminDistribution from './pages/AdminDistribution';
import AgentMarketplace, { type AgentSearchContext, type AgentSearchState } from './pages/AgentMarketplace';
import AgentProductView from './pages/AgentProductView';
import AgentBookings from './pages/AgentBookings';
import './login.css';

const demoCredentials = { vendor: { email: import.meta.env.VITE_DEMO_VENDOR_EMAIL || '', password: import.meta.env.VITE_DEMO_VENDOR_PASSWORD || '' }, admin: { email: import.meta.env.VITE_DEMO_ADMIN_EMAIL || '', password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD || '' }, agent: { email: import.meta.env.VITE_DEMO_AGENT_EMAIL || '', password: import.meta.env.VITE_DEMO_AGENT_PASSWORD || '' } } as const;
const pages = { dashboard: { title: 'Overview', sub: 'Welcome back', component: Dashboard }, onboarding: { title: 'Onboarding', sub: 'Complete verification to unlock full catalogue access', component: Onboarding }, products: { title: 'Products', sub: 'Manage products, revisions, options and rate plans', component: Products }, availability: { title: 'Inventory', sub: 'Manage schedules, capacity, blackouts and operational resources', component: Inventory }, bookings: { title: 'Bookings', sub: 'Confirm, track and fulfil incoming reservations', component: Bookings }, fulfilment: { title: 'Fulfilment', sub: 'Service-day operations, evidence and vouchers', component: FulfilmentCentre }, payouts: { title: 'Payouts', sub: 'Track earnings and settlement cycles', component: Payouts }, performance: { title: 'Performance', sub: 'SLA, ratings and operational quality', component: Performance }, opportunities: { title: 'Opportunities', sub: 'Respond to targeted supply opportunities', component: Opportunities } } as const;
export const vendorNavigation = Object.entries(pages).map(([key, value]) => ({ key: key as VendorPage, label: key === 'products' ? 'Products' : key[0].toUpperCase() + key.slice(1), ...value }));
type VendorPage = keyof typeof pages;
type AdminPage = 'dashboard' | 'vendors' | 'review' | 'commercial' | 'eligibility' | 'bookings' | 'refunds' | 'fulfilment' | 'settlements' | 'quality' | 'demand' | 'distribution';

export default function App() {
  const [user, setUser] = useState<User | null>(null); const [page, setPage] = useState<VendorPage>('dashboard'); const [profile, setProfile] = useState<VendorProfile | null>(null); const [checking, setChecking] = useState(Boolean(api.token));
  useEffect(() => { if (!api.token) { setChecking(false); return; } api.request<User>('/auth/me').then(setUser).catch(() => api.setToken(null)).finally(() => setChecking(false)); }, []);
  useEffect(() => { if (user?.role !== 'VENDOR') { setProfile(null); return; } api.request<VendorProfile>('/vendor/profile').then(setProfile).catch(() => setProfile(null)); }, [user?.tenantId, user?.role]);
  function logout() { api.setToken(null); setUser(null); setProfile(null); }
  if (checking) return <div className="boot">Loading Voya...</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.role === 'ADMIN' || user.role === 'SUB_ADMIN') return <AdminApp user={user} logout={logout} />;
  if (user.role === 'TRAVEL_AGENT') return <AgentApp user={user} logout={logout} />;
  const Page = pages[page].component; const vendorName = profile?.legalBusinessName || user.fullName || 'Vendor';
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>Vendor Console</small></div></div><nav>{vendorNavigation.map(({ key, label }) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>)}</nav><div className="sidebar-foot"><span>Vendor account</span><b>{vendorName}</b><small>{profile?.operatingCity || user.email}</small></div></aside><main className="main"><header className="topbar"><div><h1>{pages[page].title}</h1><p>{page === 'dashboard' ? `Welcome back, ${vendorName}` : pages[page].sub}</p></div><div className="top-actions"><span className="verified">{profile?.verificationStatus || 'Vendor'}</span><div className="avatar">{vendorName[0]}</div><button className="logout" onClick={logout}>Sign out</button></div></header><div className="content">{page === 'onboarding' ? <Onboarding onNavigate={() => setPage('products')} /> : <Page />}</div></main></div>;
}

function AdminApp({ user, logout }: { user: User; logout: () => void }) {
  const [page, setPage] = useState<AdminPage>('dashboard'); const title = page === 'dashboard' ? 'Admin Dashboard' : page === 'settlements' ? 'Settlement Control Tower' : page === 'quality' ? 'Supplier Quality' : page[0].toUpperCase() + page.slice(1);
  const nav: Array<[AdminPage, string]> = [['dashboard', 'Dashboard'], ['vendors', 'Vendors'], ['review', 'Product Review'], ['bookings', 'Bookings'], ['fulfilment', 'Fulfilment'], ['refunds', 'Refunds'], ['commercial', 'Commercial'], ['settlements', 'Settlements'], ['eligibility', 'Eligibility'], ['quality', 'Quality'], ['demand', 'Demand'], ['distribution', 'Distribution']];
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>Admin Console</small></div></div><nav className="admin-nav">{nav.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>)}</nav><div className="sidebar-foot"><span>Platform account</span><b>{user.email}</b><small>{user.role}</small></div></aside><main className="admin-main"><header className="topbar"><div><h1>{title}</h1><p>Manage the Voya product catalogue and booking operations</p></div><div className="top-actions"><span className="verified">Administrator</span><div className="avatar">{user.fullName?.[0] || 'A'}</div><button className="logout" onClick={logout}>Sign out</button></div></header><div className="content">{page === 'dashboard' ? <AdminDashboard onNavigate={setPage} /> : page === 'vendors' ? <AdminVendors /> : page === 'review' ? <AdminReview /> : page === 'commercial' ? <AdminCommercial /> : page === 'bookings' ? <AdminBookings /> : page === 'refunds' ? <AdminRefunds /> : page === 'fulfilment' ? <AdminFulfilment /> : page === 'settlements' ? <AdminSettlements /> : page === 'quality' ? <AdminQuality /> : page === 'demand' ? <AdminDemand /> : page === 'distribution' ? <AdminDistribution /> : <AdminEligibility />}</div></main></div>;
}

function AgentApp({ user, logout }: { user: User; logout: () => void }) { const [productId, setProductId] = useState<string | null>(null); const [context, setContext] = useState<AgentSearchContext | null>(null); const [searchState, setSearchState] = useState<AgentSearchState>(); const [page, setPage] = useState<'marketplace' | 'bookings'>('marketplace'); return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>Agent Marketplace</small></div></div><nav><button className={page === 'marketplace' ? 'active' : ''} onClick={() => { setPage('marketplace'); setProductId(null); }}>Marketplace</button><button className={page === 'bookings' ? 'active' : ''} onClick={() => { setPage('bookings'); setProductId(null); }}>My bookings</button></nav></aside><main className="main"><header className="topbar"><div><h1>{productId ? 'Customer View' : page === 'bookings' ? 'My bookings' : 'Marketplace'}</h1><p>Voya Agent Console</p></div><button className="logout" onClick={logout}>Sign out</button></header><div className="content">{page === 'bookings' ? <AgentBookings /> : productId && context ? <AgentProductView productId={productId} context={context} onBack={() => setProductId(null)} /> : <AgentMarketplace initial={searchState} onStateChange={setSearchState} onView={(id, next) => { setProductId(id); setContext(next); }} />}</div></main></div>; }

function Login({ onLogin }: { onLogin: (user: User) => void }) { const [email, setEmail] = useState(demoCredentials.vendor.email); const [password, setPassword] = useState(demoCredentials.vendor.password); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const result = await api.login(email, password); api.setToken(result.accessToken); onLogin(result.user); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } } return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-brand"><span>V</span><div><h1>Voya</h1><p>Vendor Console</p></div></div><h2>Welcome back</h2><p className="muted">Choose a configured demo account or enter your credentials.</p><div className="login-role-buttons">{(['vendor', 'admin', 'agent'] as const).map((kind) => <button type="button" className="btn" key={kind} onClick={() => { setEmail(demoCredentials[kind].email); setPassword(demoCredentials[kind].password); }}>{kind[0].toUpperCase() + kind.slice(1)} Login</button>)}</div>{error && <div className="alert error">{error}</div>}<label className="field"><span>Email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="field"><span>Password</span><input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="btn primary wide" disabled={busy}>{busy ? 'Please wait...' : 'Sign in'}</button></form></div>; }
