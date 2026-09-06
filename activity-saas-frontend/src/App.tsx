import { useEffect, useState, type FormEvent } from 'react';
import { api, type User, type VendorProfile } from './api';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import Listings from './pages/Listings';
import Availability from './pages/Availability';
import Bookings from './pages/Bookings';
import Payouts from './pages/Payouts';
import Performance from './pages/Performance';
import AdminDashboard from './pages/AdminDashboard';
import AdminVendors from './pages/AdminVendors';
import AdminReview from './pages/AdminReview';

const pages = {
  dashboard: { title: 'Overview', sub: 'Welcome back, Blue Mountain Adventures', icon: '▦', component: Dashboard },
  onboarding: { title: 'Onboarding', sub: 'Complete verification to unlock full catalogue access', icon: '✓', component: Onboarding },
  listings: { title: 'Listings', sub: 'Manage your activities and experiences', icon: '◇', component: Listings },
  availability: { title: 'Availability & Pricing', sub: 'Manage slots, capacity and promotions', icon: '▤', component: Availability },
  bookings: { title: 'Bookings', sub: 'Confirm, track and fulfil incoming reservations', icon: '▣', component: Bookings },
  payouts: { title: 'Payouts', sub: 'Track earnings and settlement cycles', icon: '₹', component: Payouts },
  performance: { title: 'Performance', sub: 'SLA, ratings and operational quality', icon: '↗', component: Performance },
} as const;

type PageKey = keyof typeof pages;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<PageKey>('dashboard');
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [checking, setChecking] = useState(Boolean(api.token));

  useEffect(() => {
    if (!api.token) return;
    api.request<User>('/auth/me').then(setUser).catch(() => api.setToken(null)).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user?.role !== 'VENDOR') { setProfile(null); return; }
    api.request<VendorProfile>('/vendor/profile').then(setProfile).catch(() => setProfile(null));
  }, [user?.tenantId, user?.role]);

  function logout() { api.setToken(null); setUser(null); setProfile(null); }
  if (checking) return <div className="boot">Loading Voya…</div>;
  if (!user) return <Login onLogin={setUser} />;

  if (user.role === 'ADMIN' || user.role === 'SUB_ADMIN') return <AdminApp user={user} logout={logout} />;
  const Page = pages[page].component;
  const vendorName = profile?.legalBusinessName || user.fullName || 'Vendor';
  const initials = vendorName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'V';
  const subtitle = page === 'dashboard' ? `Welcome back, ${vendorName}` : pages[page].sub;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>Vendor Console</small></div></div>
      <nav>{(Object.keys(pages) as PageKey[]).map((key) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><span>{pages[key].icon}</span>{key[0].toUpperCase()+key.slice(1)}{key === 'bookings' && <i>2</i>}</button>)}</nav>
      <div className="sidebar-foot"><span>Vendor account</span><b>{profile ? `VEN-${profile.id.slice(0, 6).toUpperCase()}` : user.email}</b><small>{profile?.operatingCity || 'Vendor portal'}</small></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><h1>{pages[page].title}</h1><p>{subtitle}</p></div><div className="top-actions"><span className={`verified ${profile?.verificationStatus === 'VERIFIED' ? '' : 'pending'}`}>● {profile?.verificationStatus === 'VERIFIED' ? 'Verified Vendor' : profile?.verificationStatus || 'Vendor'}</span><div className="avatar">{initials}</div><button className="logout" onClick={logout}>Sign out</button></div></header>
      <div className="content">{page === 'onboarding' ? <Onboarding onNavigate={setPage} /> : <Page />}</div>
    </main>
  </div>;
}

function AdminApp({ user, logout }: { user: User; logout: () => void }) {
  const [page, setPage] = useState<'dashboard'|'vendors'|'review'>('dashboard');
  const title = page === 'dashboard' ? 'Admin Dashboard' : page === 'vendors' ? 'Vendors' : 'Activity Review';
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="brand"><div className="brand-mark">V</div><div><b>Voya</b><small>Admin Console</small></div></div><nav className="admin-nav"><button className={page==='dashboard'?'active':''} onClick={()=>setPage('dashboard')}>▦ <span>Dashboard</span></button><button className={page==='vendors'?'active':''} onClick={()=>setPage('vendors')}>◇ <span>Vendors</span></button><button className={page==='review'?'active':''} onClick={()=>setPage('review')}>✓ <span>Activity Review</span></button></nav><div className="sidebar-foot"><span>Platform account</span><b>{user.email}</b><small>{user.role}</small></div></aside><main className="admin-main"><header className="topbar"><div><h1>{title}</h1><p>Manage the Voya activity marketplace</p></div><div className="top-actions"><span className="verified">● Administrator</span><div className="avatar">{user.fullName?.[0]||'A'}</div><button className="logout" onClick={logout}>Sign out</button></div></header><div className="content">{page==='dashboard'?<AdminDashboard onNavigate={setPage}/>:page==='vendors'?<AdminVendors/>:<AdminReview/>}</div></main></div>;
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [registering, setRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('vendor@voya.demo');
  const [password, setPassword] = useState('Demo@123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = registering ? await api.register(fullName, email, password) : await api.login(email, password); api.setToken(result.accessToken); onLogin(result.user); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-brand"><span>V</span><div><h1>Voya</h1><p>Vendor Console</p></div></div><h2>{registering ? 'Create vendor account' : 'Welcome back'}</h2><p className="muted">{registering ? 'Start a fresh onboarding journey for a new vendor.' : 'Use the seeded vendor account to explore the working demo.'}</p>{error && <div className="alert error">{error}</div>}{registering && <label className="field"><span>Full Name</span><input required minLength={2} value={fullName} onChange={(e)=>setFullName(e.target.value)} /></label>}<label className="field"><span>Email</span><input required type="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label><label className="field"><span>Password</span><input required minLength={6} type="password" value={password} onChange={(e)=>setPassword(e.target.value)} /></label><button className="btn primary wide" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>{!registering && <div className="demo-note"><b>Demo credentials</b><code>vendor@voya.demo / Demo@123</code></div>}<button type="button" className="link-button auth-switch" onClick={() => { setRegistering(!registering); setError(''); }}>{registering ? 'Already have an account? Sign in' : 'New vendor? Start onboarding'}</button></form></div>;
}
