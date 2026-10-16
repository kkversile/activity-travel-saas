import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
import AdminUsers from './pages/AdminUsers';
import ImpersonationBanner from './components/ImpersonationBanner';
import AgentMarketplace, { type AgentSearchContext, type AgentSearchState } from './pages/AgentMarketplace';
import AgentProductView from './pages/AgentProductView';
import AgentBookings from './pages/AgentBookings';
import './login.css';

const demoCredentials = { vendor: { email: import.meta.env.VITE_DEMO_VENDOR_EMAIL || '', password: import.meta.env.VITE_DEMO_VENDOR_PASSWORD || '' }, superAdmin: { email: import.meta.env.VITE_DEMO_SUPER_ADMIN_EMAIL || '', password: import.meta.env.VITE_DEMO_SUPER_ADMIN_PASSWORD || '' }, admin: { email: import.meta.env.VITE_DEMO_ADMIN_EMAIL || '', password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD || '' }, agent: { email: import.meta.env.VITE_DEMO_AGENT_EMAIL || '', password: import.meta.env.VITE_DEMO_AGENT_PASSWORD || '' } } as const;
const pages = { dashboard: { title: 'Overview', sub: 'Welcome back', component: Dashboard }, onboarding: { title: 'Onboarding', sub: 'Complete verification to unlock full catalogue access', component: Onboarding }, products: { title: 'Products', sub: 'Manage products, revisions, options and rate plans', component: Products }, availability: { title: 'Inventory', sub: 'Manage schedules, capacity, blackouts and operational resources', component: Inventory }, bookings: { title: 'Bookings', sub: 'Confirm, track and fulfil incoming reservations', component: Bookings }, fulfilment: { title: 'Fulfilment', sub: 'Service-day operations, evidence and vouchers', component: FulfilmentCentre }, payouts: { title: 'Payouts', sub: 'Track earnings and settlement cycles', component: Payouts }, performance: { title: 'Performance', sub: 'SLA, ratings and operational quality', component: Performance }, opportunities: { title: 'Opportunities', sub: 'Respond to targeted supply opportunities', component: Opportunities } } as const;
export const vendorNavigation = Object.entries(pages).map(([key, value]) => ({ key: key as VendorPage, label: key === 'products' ? 'Products' : key[0].toUpperCase() + key.slice(1), ...value }));
type VendorPage = keyof typeof pages;
type AgentPage = 'marketplace' | 'bookings';
const agentPaths: Record<AgentPage, string> = { marketplace: '/agent/marketplace', bookings: '/agent/bookings' };
export function agentPageFromPath(pathname: string): AgentPage { return routePath(pathname) === agentPaths.bookings ? 'bookings' : 'marketplace'; }
export function agentCanBook(role: User['organizationRole']): boolean { return role === 'OWNER' || role === 'CATALOGUE' || role === 'OPERATIONS'; }
export type AdminPage = 'dashboard' | 'users' | 'vendors' | 'review' | 'commercial' | 'eligibility' | 'bookings' | 'refunds' | 'fulfilment' | 'settlements' | 'quality' | 'demand' | 'distribution';
const vendorPaths: Record<VendorPage, string> = { dashboard: '/vendor/dashboard', onboarding: '/vendor/onboarding', products: '/vendor/products', availability: '/vendor/availability', bookings: '/vendor/bookings', fulfilment: '/vendor/fulfilment', payouts: '/vendor/payouts', performance: '/vendor/performance', opportunities: '/vendor/opportunities' };
const APP_BASE_PATH = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');
function appPath(path: string) { return `${APP_BASE_PATH}${path}`; }
function routePath(pathname: string) { return APP_BASE_PATH && (pathname === APP_BASE_PATH || pathname.startsWith(`${APP_BASE_PATH}/`)) ? pathname.slice(APP_BASE_PATH.length) || '/' : pathname; }
function vendorPageFromPath(pathname: string): VendorPage { const normalized = routePath(pathname); const found = (Object.entries(vendorPaths) as Array<[VendorPage, string]>).find(([, path]) => normalized === path); return found?.[0] || 'dashboard'; }
const adminPaths: Record<AdminPage, string> = { dashboard: '/admin/dashboard', users: '/admin/users', vendors: '/admin/vendors', review: '/admin/product-review', commercial: '/admin/commercial', eligibility: '/admin/eligibility', bookings: '/admin/bookings', refunds: '/admin/refunds', fulfilment: '/admin/fulfilment', settlements: '/admin/settlements', quality: '/admin/quality', demand: '/admin/demand', distribution: '/admin/distribution' };
function adminPageFromPath(pathname: string): AdminPage { const normalized = routePath(pathname); const found = (Object.entries(adminPaths) as Array<[AdminPage, string]>).find(([, path]) => normalized === path); return found?.[0] || 'dashboard'; }
export function adminPageForRole(pathname: string, role: User['role']): AdminPage { const requested = adminPageFromPath(pathname); return requested === 'users' && role !== 'SUPER_ADMIN' ? 'dashboard' : requested; }

export default function App() {
  const [user, setUser] = useState<User | null>(null); const [page, setPage] = useState<VendorPage>(() => vendorPageFromPath(window.location.pathname)); const [profile, setProfile] = useState<VendorProfile | null>(null); const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null); const [checking, setChecking] = useState(Boolean(api.token));
  useEffect(() => { if (!api.token) { setChecking(false); return; } api.request<User>('/auth/me').then(setUser).catch(() => api.setToken(null)).finally(() => setChecking(false)); }, []);
  useEffect(() => { if (user?.role !== 'VENDOR') { setProfile(null); setOnboardingStatus(null); return; } api.request<VendorProfile>('/vendor/profile').then(setProfile).catch(() => setProfile(null)); api.request<{ status: string }>('/vendor/onboarding').then((application) => setOnboardingStatus(application.status)).catch(() => setOnboardingStatus(null)); }, [user?.tenantId, user?.role]);
  useEffect(() => { if (user?.role !== 'VENDOR') return; const locked = onboardingStatus !== 'APPROVED'; const requested = vendorPageFromPath(window.location.pathname); const safe = locked && requested !== 'onboarding' ? 'onboarding' : requested; if (!routePath(window.location.pathname).startsWith('/vendor/') || safe !== requested) window.history.replaceState({}, '', appPath(vendorPaths[safe])); setPage(safe); const onPopState = () => { const next = vendorPageFromPath(window.location.pathname); setPage(locked && next !== 'onboarding' ? 'onboarding' : next); }; window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, [user?.role, onboardingStatus]);
  function navigateVendor(next: VendorPage) { const safe = onboardingStatus === 'APPROVED' || next === 'onboarding' ? next : 'onboarding'; setPage(safe); const nextPath = appPath(vendorPaths[safe]); if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath); }
  function logout() { api.setToken(null); sessionStorage.removeItem('voya_impersonation_original_token'); setUser(null); setProfile(null); setOnboardingStatus(null); }
  if (checking) return <div className="boot">Loading Voya...</div>;
  async function handleLogin(nextUser: User) {
    setUser(nextUser);
    if (nextUser.role !== 'VENDOR') return;
    try {
      const application = await api.request<{ status: string }>('/vendor/onboarding');
      setOnboardingStatus(application.status);
      if (application.status !== 'APPROVED') {
        setPage('onboarding');
        window.history.replaceState({}, '', appPath(vendorPaths.onboarding));
      }
    } catch {
      // The regular vendor dashboard remains the safe fallback if onboarding is unavailable.
    }
  }
  if (!user) return <Login onLogin={handleLogin} />;
  let app: ReactNode;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') app = <AdminApp user={user} logout={logout} />;
  else if (user.role === 'TRAVEL_AGENT') app = <AgentApp user={user} logout={logout} />;
  else { const Page = pages[page].component; const vendorName = profile?.legalBusinessName || user.fullName || 'Vendor'; const onboardingLocked = onboardingStatus !== 'APPROVED'; const statusLabel = onboardingLocked ? `ONBOARDING ${onboardingStatus || 'PENDING'}` : (profile?.verificationStatus || 'Vendor'); app = <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>Vendor Console</small></div></div><nav>{vendorNavigation.map(({ key, label }) => <button key={key} disabled={onboardingLocked && key !== 'onboarding'} className={page === key ? 'active' : ''} onClick={() => navigateVendor(key)} title={onboardingLocked && key !== 'onboarding' ? 'Complete and get onboarding approved to unlock this area' : undefined}>{label}</button>)}</nav><div className="sidebar-foot"><span>Vendor account</span><b>{vendorName}</b><small>{profile?.operatingCity || user.email}</small></div></aside><main className="main"><header className="topbar"><div><h1>{pages[page].title}</h1><p>{page === 'dashboard' ? `Welcome back, ${vendorName}` : pages[page].sub}</p></div><div className="top-actions"><span className="verified">{statusLabel}</span><div className="avatar">{vendorName[0]}</div><button className="logout" onClick={logout}>Sign out</button></div></header><div className="content">{page === 'onboarding' ? <Onboarding onNavigate={() => navigateVendor('products')} onStatusChange={setOnboardingStatus} /> : <Page />}</div></main></div>; }
  return user.isImpersonating ? <><ImpersonationBanner user={user} onEnded={() => { setUser(null); window.location.assign(import.meta.env.BASE_URL); }} />{app}</> : app;
}

function AdminApp({ user, logout }: { user: User; logout: () => void }) {
  const canManageUsers = user.role === 'SUPER_ADMIN'; const safePage = (requested: AdminPage): AdminPage => requested === 'users' && !canManageUsers ? 'dashboard' : requested; const [page, setPage] = useState<AdminPage>(() => adminPageForRole(window.location.pathname, user.role)); const roleLabel = user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'; const title = page === 'dashboard' ? `${roleLabel} Dashboard` : page === 'settlements' ? 'Settlement Control Tower' : page === 'quality' ? 'Supplier Quality' : page === 'review' ? 'Product Review' : page[0].toUpperCase() + page.slice(1);
  useEffect(() => { const requested = adminPageFromPath(window.location.pathname); const next = adminPageForRole(window.location.pathname, user.role); if (!routePath(window.location.pathname).startsWith('/admin/') || next !== requested) window.history.replaceState({}, '', appPath(adminPaths[next])); setPage(next); const onPopState = () => { const requestedPage = adminPageFromPath(window.location.pathname); const safe = adminPageForRole(window.location.pathname, user.role); if (safe !== requestedPage) window.history.replaceState({}, '', appPath(adminPaths[safe])); setPage(safe); }; window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, [user.role]);
  function navigate(next: AdminPage) { const safe = safePage(next); setPage(safe); const nextPath = appPath(adminPaths[safe]); if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath); }
  const nav: Array<[AdminPage, string]> = [['dashboard', 'Dashboard'], ['vendors', 'Vendors'], ['review', 'Product Review'], ['bookings', 'Bookings'], ['fulfilment', 'Fulfilment'], ['refunds', 'Refunds'], ['commercial', 'Commercial'], ['settlements', 'Settlements'], ['eligibility', 'Eligibility'], ['quality', 'Quality'], ['demand', 'Demand'], ['distribution', 'Distribution']]; if (canManageUsers) nav.splice(1, 0, ['users', 'Admin Users']);
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>{roleLabel} Console</small></div></div><nav className="admin-nav">{nav.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav><div className="sidebar-foot"><span>Platform account</span><b>{user.email}</b><small>{roleLabel}</small></div></aside><main className="admin-main"><header className="topbar"><div><h1>{title}</h1><p>Manage the Voya product catalogue and booking operations</p></div><div className="top-actions"><span className="verified">{roleLabel}</span><div className="avatar">{user.fullName?.[0] || 'A'}</div><button className="logout" onClick={logout}>Sign out</button></div></header><div className="content">{page === 'dashboard' ? <AdminDashboard onNavigate={navigate} /> : page === 'users' ? <AdminUsers /> : page === 'vendors' ? <AdminVendors canImpersonate={user.role === 'SUPER_ADMIN'} /> : page === 'review' ? <AdminReview /> : page === 'commercial' ? <AdminCommercial /> : page === 'bookings' ? <AdminBookings /> : page === 'refunds' ? <AdminRefunds /> : page === 'fulfilment' ? <AdminFulfilment /> : page === 'settlements' ? <AdminSettlements /> : page === 'quality' ? <AdminQuality /> : page === 'demand' ? <AdminDemand /> : page === 'distribution' ? <AdminDistribution /> : <AdminEligibility />}</div></main></div>;
}

function AgentApp({ user, logout }: { user: User; logout: () => void }) { const [productId, setProductId] = useState<string | null>(null); const [context, setContext] = useState<AgentSearchContext | null>(null); const [searchState, setSearchState] = useState<AgentSearchState>(); const [page, setPage] = useState<AgentPage>(() => agentPageFromPath(window.location.pathname)); const canBook = agentCanBook(user.organizationRole); useEffect(() => { const requested = agentPageFromPath(window.location.pathname); if (!routePath(window.location.pathname).startsWith('/agent/')) window.history.replaceState({}, '', appPath(agentPaths[requested])); const onPopState = () => { setPage(agentPageFromPath(window.location.pathname)); setProductId(null); }; window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, []); function navigate(next: AgentPage) { setPage(next); setProductId(null); const nextPath = appPath(agentPaths[next]); if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath); } return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>Agent Marketplace</small></div></div><nav><button className={page === 'marketplace' ? 'active' : ''} onClick={() => navigate('marketplace')}>Marketplace</button><button className={page === 'bookings' ? 'active' : ''} onClick={() => navigate('bookings')}>My bookings</button></nav></aside><main className="main"><header className="topbar"><div><h1>{productId ? 'Customer View' : page === 'bookings' ? 'My bookings' : 'Marketplace'}</h1><p>Voya Agent Console</p></div><button className="logout" onClick={logout}>Sign out</button></header><div className="content">{page === 'bookings' ? <AgentBookings canBook={canBook} /> : productId && context ? <AgentProductView productId={productId} context={context} canBook={canBook} onBack={() => setProductId(null)} /> : <AgentMarketplace initial={searchState} onStateChange={setSearchState} onView={(id, next) => { setProductId(id); setContext(next); }} />}</div></main></div>; }

function Login({ onLogin }: { onLogin: (user: User) => void | Promise<void> }) {
  const [mode, setMode] = useState<'password' | 'email'>('password');
  const [email, setEmail] = useState(demoCredentials.vendor.email);
  const [password, setPassword] = useState(demoCredentials.vendor.password);
  const [code, setCode] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [activation, setActivation] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [demoOtp, setDemoOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((remaining) => Math.max(remaining - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api.login(email, password);
      api.setToken(result.accessToken);
      await onLogin(result.user);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function requestEmailCode() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.requestVendorEmailCode(email);
      setEmailCodeSent(true);
      setCode('');
      setResendCooldown(10);
      setDemoOtp(result.demoOtp || '');
      setNotice(result.demoOtp ? `Demo email code: ${result.demoOtp}` : 'Check your email for the 6-digit verification code.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function verifyEmailCode() {
    setBusy(true); setError('');
    try {
      const result = await api.verifyVendorEmailCode(email, code);
      setSetupToken(result.setupToken);
      setActivation(result.purpose === 'ACTIVATE_VENDOR');
      setNotice(result.purpose === 'ACTIVATE_VENDOR' ? 'Email verified. Create your vendor password.' : 'Email verified. Choose a new password.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function setPasswordAndContinue() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api.setVendorPassword(setupToken, password);
      api.setToken(result.accessToken);
      await onLogin(result.user);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const loginKinds = [['vendor', 'Vendor'], ['superAdmin', 'Super Admin'], ['admin', 'Admin'], ['agent', 'Agent']] as const;
  return <div className="login-page"><form className="login-card" onSubmit={mode === 'password' ? submit : (e) => { e.preventDefault(); if (!emailCodeSent) void requestEmailCode(); else if (!setupToken) void verifyEmailCode(); else void setPasswordAndContinue(); }}>
    <div className="login-brand"><span>V</span><div><h1>Voya</h1><p>Vendor Console</p></div></div>
    {mode === 'password' ? <><h2>Welcome back</h2><p className="muted">Sign in with your email and password.</p><div className="login-role-buttons">{loginKinds.map(([kind, label]) => <button type="button" className="btn" key={kind} onClick={() => { setEmail(demoCredentials[kind].email); setPassword(demoCredentials[kind].password); }}>{label} Login</button>)}</div><button type="button" className="link-button login-switch" onClick={() => { setMode('email'); setPassword(''); setError(''); setNotice(''); }}>First-time access or reset password</button><label className="field"><span>Email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="field"><span>Password</span><input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="btn primary wide" disabled={busy}>{busy ? 'Please wait...' : 'Sign in'}</button></> : <><h2>Email access</h2><p className="muted">Verify your email to create vendor access or reset your password.</p><button type="button" className="link-button login-switch" onClick={() => { setMode('password'); setEmailCodeSent(false); setSetupToken(''); setPassword(''); setError(''); setResendCooldown(0); }}>← Use password login</button><label className="field"><span>Email</span><input required type="email" value={email} disabled={emailCodeSent} onChange={(e) => setEmail(e.target.value)} /></label>{emailCodeSent && !setupToken && <label className="field"><span>6-digit email code</span><input required inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" /></label>}{setupToken && <label className="field"><span>{activation ? 'Create password' : 'New password'}</span><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}{error && <div className="alert error">{error}</div>}{notice && <div className="alert info">{notice}</div>}{demoOtp && <small className="login-demo-note">Local demo only — the code is shown here because no email provider is configured.</small>}{emailCodeSent && !setupToken && <div className="login-resend">{resendCooldown > 0 ? <span>Resend code in {resendCooldown}s</span> : <button type="button" className="link-button" disabled={busy} onClick={() => void requestEmailCode()}>Resend code</button>}</div>}<button className="btn primary wide" disabled={busy}>{busy ? 'Please wait...' : !emailCodeSent ? 'Send email code' : !setupToken ? 'Verify code' : activation ? 'Create account and continue' : 'Reset password and continue'}</button></>}{error && mode === 'password' && <div className="alert error">{error}</div>}</form></div>;
}
