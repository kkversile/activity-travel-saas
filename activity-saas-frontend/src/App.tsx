import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import AdminProducts from './pages/AdminProducts';
import AdminProductCreatePanel from './pages/AdminProductCreatePanel';
import AdminExperienceMatching from './pages/AdminExperienceMatching';
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
import AdminAgents from './pages/AdminAgents';
import AdminBuyBox from './pages/AdminBuyBox';
import AdminSettings from './pages/AdminSettings';
import AdminAuditLog from './pages/AdminAuditLog';
import AdminPromotions from './pages/AdminPromotions';
import AdminApprovals from './pages/AdminApprovals';
import AdminDeveloperNotes from './pages/AdminDeveloperNotes';
import VendorBuyBox from './pages/VendorBuyBox';
import VendorShell from './layouts/VendorShell';
import { partnerHubCountsFromDashboard, partnerHubNavigation } from './layouts/vendorNavigation';
import { DeveloperNotesPage, PartnerAddProductPage, PartnerBookingsPage, PartnerBulkUploadPage, PartnerDashboard, PartnerEditProductPage, PartnerOnboardingPage, PartnerPaymentsPage, PartnerProductsPage, PartnerPromotionsPage, PartnerReportsPage, PartnerSettingsPage } from './pages/PartnerHubPages';
import ImpersonationBanner from './components/ImpersonationBanner';
import ChangePasswordDialog from './components/ChangePasswordDialog';
import AgentMarketplace, { type AgentSearchContext, type AgentSearchState } from './pages/AgentMarketplace';
import AgentProductView from './pages/AgentProductView';
import AgentBookings from './pages/AgentBookings';
import AgentShell, { type AgentNavKey } from './layouts/AgentShell';
import { AgentDashboardPage, AgentFinancePage, AgentReportsPage, AgentSettingsPage } from './pages/AgentPortalPages';
import './layouts/vendor-hub.css';
import './layouts/agent-hub.css';
import './admin-theme.css';

const demoCredentials = { vendor: { email: import.meta.env.VITE_DEMO_VENDOR_EMAIL || '', password: import.meta.env.VITE_DEMO_VENDOR_PASSWORD || '' }, superAdmin: { email: import.meta.env.VITE_DEMO_SUPER_ADMIN_EMAIL || '', password: import.meta.env.VITE_DEMO_SUPER_ADMIN_PASSWORD || '' }, admin: { email: import.meta.env.VITE_DEMO_ADMIN_EMAIL || '', password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD || '' }, agent: { email: import.meta.env.VITE_DEMO_AGENT_EMAIL || '', password: import.meta.env.VITE_DEMO_AGENT_PASSWORD || '' } } as const;
const pages = { dashboard: { title: 'Overview', sub: 'Welcome back', component: Dashboard }, onboarding: { title: 'Onboarding', sub: 'Complete verification to unlock full catalogue access', component: Onboarding }, products: { title: 'Products', sub: 'Manage products, revisions, options and rate plans', component: Products }, availability: { title: 'Inventory', sub: 'Manage schedules, capacity, blackouts and operational resources', component: Inventory }, bookings: { title: 'Bookings', sub: 'Confirm, track and fulfil incoming reservations', component: Bookings }, fulfilment: { title: 'Fulfilment', sub: 'Service-day operations, evidence and vouchers', component: FulfilmentCentre }, payouts: { title: 'Payouts', sub: 'Track earnings and settlement cycles', component: Payouts }, performance: { title: 'Performance', sub: 'SLA, ratings and operational quality', component: Performance }, opportunities: { title: 'Opportunities', sub: 'Respond to targeted supply opportunities', component: Opportunities }, buybox: { title: 'Buy Box', sub: 'Bid for recommended marketplace placement', component: VendorBuyBox } } as const;
export const vendorNavigation = Object.entries(pages).map(([key, value]) => ({ key: key as VendorPage, label: key === 'products' ? 'Products' : key === 'buybox' ? 'Buy Box' : key[0].toUpperCase() + key.slice(1), ...value }));
type PartnerPage = 'add-product' | 'edit-product' | 'bulk-upload' | 'promotions' | 'reports' | 'settings' | 'developer-notes';
type VendorPage = keyof typeof pages | PartnerPage;
type AgentPage = AgentNavKey;
const agentPaths: Record<AgentPage, string> = { dashboard: '/agent/dashboard', marketplace: '/agent/marketplace', bookings: '/agent/bookings', payments: '/agent/payments', reports: '/agent/reports', settings: '/agent/settings' };
export function agentPageFromPath(pathname: string): AgentPage { const path = routePath(pathname); return (Object.entries(agentPaths).find(([, value]) => value === path)?.[0] as AgentPage | undefined) || 'marketplace'; }
export function agentCanBook(role: User['organizationRole']): boolean { return role === 'OWNER' || role === 'CATALOGUE' || role === 'OPERATIONS'; }
export type AdminPage = 'dashboard' | 'users' | 'approvals' | 'agents' | 'vendors' | 'products' | 'matching' | 'review' | 'commercial' | 'eligibility' | 'bookings' | 'refunds' | 'fulfilment' | 'settlements' | 'quality' | 'demand' | 'distribution' | 'buybox' | 'settings' | 'audit' | 'promotions' | 'developer';
const vendorPaths: Record<VendorPage, string> = { dashboard: '/vendor/dashboard', onboarding: '/vendor/onboarding', products: '/vendor/products', 'add-product': '/vendor/products/new', 'edit-product': '/vendor/products/:productId/edit', 'bulk-upload': '/vendor/bulk-upload', promotions: '/vendor/promotions', reports: '/vendor/reports', settings: '/vendor/settings', 'developer-notes': '/vendor/developer-notes', availability: '/vendor/availability', bookings: '/vendor/bookings', fulfilment: '/vendor/fulfilment', payouts: '/vendor/payouts', performance: '/vendor/performance', opportunities: '/vendor/opportunities', buybox: '/vendor/buy-box' };
const APP_BASE_PATH = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');
function appPath(path: string) { return `${APP_BASE_PATH}${path}`; }
function routePath(pathname: string) { return APP_BASE_PATH && (pathname === APP_BASE_PATH || pathname.startsWith(`${APP_BASE_PATH}/`)) ? pathname.slice(APP_BASE_PATH.length) || '/' : pathname; }
function vendorPageFromPath(pathname: string): VendorPage { const normalized = routePath(pathname); if (/^\/vendor\/products\/[^/]+\/edit$/.test(normalized)) return 'edit-product'; const found = (Object.entries(vendorPaths) as Array<[VendorPage, string]>).find(([key, path]) => key !== 'edit-product' && normalized === path); return found?.[0] || 'dashboard'; }
function vendorProductIdFromPath(pathname: string): string | null { const match = routePath(pathname).match(/^\/vendor\/products\/([^/]+)\/edit$/); return match ? decodeURIComponent(match[1]) : null; }
const adminPaths: Record<AdminPage, string> = { dashboard: '/admin/dashboard', users: '/admin/users', approvals: '/admin/approvals', agents: '/admin/agents', vendors: '/admin/vendors', products: '/admin/products', matching: '/admin/experience-matching', review: '/admin/product-review', commercial: '/admin/commercial', eligibility: '/admin/eligibility', bookings: '/admin/bookings', refunds: '/admin/refunds', fulfilment: '/admin/fulfilment', settlements: '/admin/settlements', quality: '/admin/quality', demand: '/admin/demand', distribution: '/admin/distribution', buybox: '/admin/buy-box', settings: '/admin/settings', audit: '/admin/audit-log', promotions: '/admin/promotions', developer: '/admin/developer-notes' };
function adminPageFromPath(pathname: string): AdminPage { const normalized = routePath(pathname); const found = (Object.entries(adminPaths) as Array<[AdminPage, string]>).find(([, path]) => normalized === path); return found?.[0] || 'dashboard'; }
export function adminPageForRole(pathname: string, role: User['role']): AdminPage { const requested = adminPageFromPath(pathname); return (requested === 'users' || requested === 'settings') && role !== 'SUPER_ADMIN' ? 'dashboard' : requested; }

export default function App() {
    const [user, setUser] = useState<User | null>(null); const [page, setPage] = useState<VendorPage>(() => vendorPageFromPath(window.location.pathname)); const [profile, setProfile] = useState<VendorProfile | null>(null); const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null); const [hubCounts, setHubCounts] = useState<{ bookings: number; products: number; kyc: number }>({ bookings: 0, products: 0, kyc: 0 }); const [checking, setChecking] = useState(Boolean(api.token)); const [changePasswordOpen, setChangePasswordOpen] = useState(false); const [publicRoute, setPublicRoute] = useState(() => routePath(window.location.pathname));
  useEffect(() => { if (!api.token) { setChecking(false); return; } api.request<User>('/auth/me').then((nextUser) => { setUser(nextUser); if (nextUser.mustChangePassword) { setChangePasswordOpen(true); if (nextUser.role === 'VENDOR') { setPage('onboarding'); window.history.replaceState({}, '', appPath(vendorPaths.onboarding)); } } }).catch(() => api.setToken(null)).finally(() => setChecking(false)); }, []);
  useEffect(() => { const onPopState = () => setPublicRoute(routePath(window.location.pathname)); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, []);
  useEffect(() => { if (user?.role !== 'VENDOR' || user.mustChangePassword) { setProfile(null); setOnboardingStatus(null); setHubCounts({ bookings: 0, products: 0, kyc: 0 }); return; } api.request<VendorProfile>('/vendor/profile').then(setProfile).catch(() => setProfile(null)); api.request<{ status: string }>('/vendor/onboarding').then((application) => setOnboardingStatus(application.status)).catch(() => setOnboardingStatus('PENDING')); api.request<{ vendorActionRequiredBookings?: number; pendingBookings?: number; draftListings?: number; expiredDocuments?: number; documentsExpiring?: number }>('/dashboard/summary').then((summary) => setHubCounts(partnerHubCountsFromDashboard(summary))).catch(() => setHubCounts({ bookings: 0, products: 0, kyc: 0 })); }, [user?.tenantId, user?.role, user?.mustChangePassword]);
  useEffect(() => { if (user?.role !== 'VENDOR' || user.mustChangePassword) return; const requested = vendorPageFromPath(window.location.pathname); if (!routePath(window.location.pathname).startsWith('/vendor/')) { window.history.replaceState({}, '', appPath(vendorPaths.dashboard)); setPage('dashboard'); return; } setPage(requested); const onPopState = () => setPage(vendorPageFromPath(window.location.pathname)); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, [user?.role, user?.mustChangePassword]);
  useLayoutEffect(() => { if (user?.role === 'VENDOR') window.scrollTo(0, 0); }, [page, user?.role]);
  function navigateVendor(next: VendorPage) { setPage(next); const nextPath = appPath(vendorPaths[next]); if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath); }
  function logout() { api.setToken(null); sessionStorage.removeItem('voya_impersonation_original_token'); setUser(null); setProfile(null); setOnboardingStatus(null); setHubCounts({ bookings: 0, products: 0, kyc: 0 }); setChangePasswordOpen(false); }
  function navigatePublic(path: string) { window.history.pushState({}, '', appPath(path)); setPublicRoute(path); }
  if (checking) return <div className="boot">Loading Voya...</div>;
  async function handleLogin(nextUser: User) {
    setUser(nextUser);
    if (nextUser.mustChangePassword) {
      setChangePasswordOpen(true);
      if (nextUser.role === 'VENDOR') {
        setPage('onboarding');
        window.history.replaceState({}, '', appPath(vendorPaths.onboarding));
      }
      return;
    }
    if (nextUser.role !== 'VENDOR') return;
    try {
      const application = await api.request<{ status: string }>('/vendor/onboarding');
      setOnboardingStatus(application.status);
      if (application.status !== 'APPROVED') {
        setPage('onboarding');
        window.history.replaceState({}, '', appPath(vendorPaths.onboarding));
      }
    } catch {
      // Preserve the secure fallback when readiness cannot be loaded.
      setOnboardingStatus('PENDING');
      setPage('onboarding');
      window.history.replaceState({}, '', appPath(vendorPaths.onboarding));
    }
  }
  if (!user) return publicRoute === '/register' ? <Register onRegistered={handleLogin} onBack={() => navigatePublic('/')} /> : <Login onLogin={handleLogin} onRegister={() => navigatePublic('/register')} />;
  let app: ReactNode;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') app = <AdminApp user={user} logout={logout} />;
  else if (user.role === 'TRAVEL_AGENT') app = <AgentApp user={user} logout={logout} onChangePassword={() => setChangePasswordOpen(true)} />;
  else {
    const legacyPage = pages[page as keyof typeof pages] || pages.products;
    const vendorName = profile?.displayName || profile?.legalBusinessName || user.fullName || 'Vendor';
    const statusLabel = onboardingStatus && onboardingStatus !== 'APPROVED' ? `ONBOARDING ${onboardingStatus}` : (profile?.verificationStatus || 'Vendor');
    const titles: Record<PartnerPage, [string, string]> = { 'add-product': ['Add product', 'Create a new marketplace experience'], 'edit-product': ['Edit product', 'Update the selected marketplace experience'], 'bulk-upload': ['Bulk upload', 'Import and review multiple experiences'], promotions: ['Promotions', 'Create and manage time-bound offers'], reports: ['Reports', 'Operational and financial insights'], settings: ['Team & settings', 'Business profile and team access'], 'developer-notes': ['Developer notes', 'Internal implementation notes'] };
    const vendorTitle = page === 'onboarding' && onboardingStatus === 'APPROVED' ? 'Onboarding & Readiness' : page in titles ? titles[page as PartnerPage][0] : legacyPage.title;
    const vendorSubtitle = page === 'onboarding' && onboardingStatus === 'APPROVED' ? 'Vendor verification, documents and marketplace readiness' : page in titles ? titles[page as PartnerPage][1] : (page === 'dashboard' ? `Welcome back, ${vendorName}` : legacyPage.sub);
    const LegacyComponent = legacyPage.component;
    let content: ReactNode;
    if (page === 'dashboard') content = <PartnerDashboard greetingName={user.fullName || user.email} businessName={profile?.displayName || profile?.legalBusinessName || vendorName} onAddProduct={() => navigateVendor('add-product')} />;
    else if (page === 'products') content = <PartnerProductsPage onEditRoute={(id) => { window.history.pushState({}, '', appPath(`/vendor/products/${encodeURIComponent(id)}/edit`)); window.dispatchEvent(new PopStateEvent('popstate')); }} onBulkUploadRoute={() => navigateVendor('bulk-upload')} onAddProductRoute={() => navigateVendor('add-product')} />;
    else if (page === 'edit-product') content = <PartnerEditProductPage productId={vendorProductIdFromPath(window.location.pathname) || ''} onDone={() => navigateVendor('products')} onChanged={() => undefined} />;
    else if (page === 'bookings') content = <PartnerBookingsPage />;
    else if (page === 'payouts') content = <PartnerPaymentsPage />;
    else if (page === 'onboarding') content = <PartnerOnboardingPage onNavigate={() => navigateVendor('products')} onStatusChange={setOnboardingStatus} />;
    else if (page === 'add-product') content = <PartnerAddProductPage onDone={() => navigateVendor('products')} onChanged={() => undefined} />;
    else if (page === 'bulk-upload') content = <PartnerBulkUploadPage />;
    else if (page === 'promotions') content = <PartnerPromotionsPage />;
    else if (page === 'reports') content = <PartnerReportsPage />;
    else if (page === 'settings') content = <PartnerSettingsPage canManageTeam={user.organizationRole === 'OWNER'} />;
    else if (page === 'developer-notes') content = <DeveloperNotesPage />;
    else content = <div className="partner-legacy-page"><LegacyComponent /></div>;
    const hubNav = partnerHubNavigation.map((item) => ({ ...item, ...(item.key === 'bookings' ? { count: hubCounts.bookings } : item.key === 'onboarding' ? { count: hubCounts.kyc } : {}) }));
    app = <VendorShell activeKey={page} navItems={hubNav} vendorName={vendorName} vendorLocation={[profile?.operatingCity, profile?.operatingRegion].filter(Boolean).join(', ') || user.email} statusLabel={statusLabel} onNavigate={(key) => navigateVendor(key as VendorPage)} onSignOut={logout} onChangePassword={() => setChangePasswordOpen(true)}>{content}</VendorShell>;
  }
  const passwordDialog = user && changePasswordOpen ? <ChangePasswordDialog key={`${user.id || user.sub || user.email}-${Boolean(user.mustChangePassword)}`} required={Boolean(user.mustChangePassword)} onClose={() => setChangePasswordOpen(false)} onChanged={() => setUser((current) => current ? { ...current, mustChangePassword: false } : current)} /> : null;
  return user.isImpersonating ? <><ImpersonationBanner user={user} onEnded={() => { setUser(null); window.location.assign(import.meta.env.BASE_URL); }} />{app}{passwordDialog}</> : <>{app}{passwordDialog}</>;
}

function AdminApp({ user, logout }: { user: User; logout: () => void }) {
  const canManageUsers = user.role === 'SUPER_ADMIN'; const safePage = (requested: AdminPage): AdminPage => (requested === 'users' || requested === 'settings') && !canManageUsers ? 'dashboard' : requested; const [page, setPage] = useState<AdminPage>(() => adminPageForRole(window.location.pathname, user.role)); const [approvalCount, setApprovalCount] = useState<number | null>(null); const [mobileMenuOpen, setMobileMenuOpen] = useState(false); const roleLabel = user.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin';
  const title = page === 'dashboard' ? 'Marketplace overview' : page === 'approvals' ? 'Approvals' : page === 'products' ? 'Activities' : page === 'matching' ? 'Multi-supplier engine' : page === 'commercial' ? 'Pricing & margins' : page === 'settlements' ? 'Finance' : page === 'agents' ? 'Travel agents' : page === 'audit' ? 'Team & audit log' : page === 'settings' ? 'Configuration' : page === 'developer' ? 'Developer notes' : page[0].toUpperCase() + page.slice(1);
  useEffect(() => { const requested = adminPageFromPath(window.location.pathname); const next = adminPageForRole(window.location.pathname, user.role); if (!routePath(window.location.pathname).startsWith('/admin/') || next !== requested) window.history.replaceState({}, '', appPath(adminPaths[next])); setPage(next); const onPopState = () => { const requestedPage = adminPageFromPath(window.location.pathname); const safe = adminPageForRole(window.location.pathname, user.role); if (safe !== requestedPage) window.history.replaceState({}, '', appPath(adminPaths[safe])); setPage(safe); }; window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, [user.role]);
  useEffect(() => { api.request<{ approvals?: { total?: number } }>('/admin/dashboard').then((summary) => setApprovalCount(summary.approvals?.total ?? 0)).catch(() => setApprovalCount(null)); }, [user.role]);
  useEffect(() => { if (!mobileMenuOpen) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenuOpen(false); }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape); }, [mobileMenuOpen]);
  function navigate(next: AdminPage, options?: { vendorId?: string; action?: 'create'; q?: string }) { const safe = safePage(next); setPage(safe); setMobileMenuOpen(false); const params = new URLSearchParams(); if (options?.vendorId) params.set('vendorId', options.vendorId); if (options?.action) params.set('action', options.action); if (options?.q) params.set('q', options.q); const query = params.size ? `?${params.toString()}` : ''; const nextPath = `${appPath(adminPaths[safe])}${query}`; if (window.location.pathname + window.location.search !== nextPath) { window.history.pushState({}, '', nextPath); window.dispatchEvent(new PopStateEvent('popstate')); } }
  const sections: Array<{ label?: string; items: Array<[AdminPage, string]> }> = [
    { items: [['dashboard', 'Dashboard'], ['approvals', 'Approvals']] },
    { label: 'Supply', items: [['vendors', 'Vendors'], ['products', 'Activities'], ['matching', 'Multi-supplier engine'], ['bookings', 'Bookings']] },
    { label: 'Revenue', items: [['commercial', 'Pricing & margins'], ['promotions', 'Promotions']] },
    { label: 'Distribution', items: [['agents', 'Travel agents']] },
    { label: 'Money', items: [['settlements', 'Finance']] },
    { label: 'System', items: [['audit', 'Team & audit log'], ['settings', 'Configuration'], ['developer', 'Developer notes']] },
  ];
  const visibleSections = canManageUsers ? sections : sections.map((section) => ({ ...section, items: section.items.filter(([key]) => key !== 'users' && key !== 'settings') })).filter((section) => section.items.length > 0);
  const content = page === 'dashboard' ? <AdminDashboard onNavigate={navigate} /> : page === 'approvals' ? <AdminApprovals onNavigate={navigate} /> : page === 'agents' ? <AdminAgents canImpersonate={user.role === 'SUPER_ADMIN'} /> : page === 'vendors' ? <AdminVendors canImpersonate={user.role === 'SUPER_ADMIN'} canCreateVendor={user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'} currentUserId={user.id || user.sub} onViewProducts={(vendorId) => navigate('products', { vendorId })} onCreateActivity={(vendorId) => navigate('products', { vendorId, action: 'create' })} /> : page === 'products' ? <><AdminProductCreatePanel canPublishDirectly={canManageUsers} initialVendorId={new URLSearchParams(window.location.search).get('vendorId') || undefined} openOnLoad={new URLSearchParams(window.location.search).get('action') === 'create'} onCreated={() => window.dispatchEvent(new PopStateEvent('popstate'))} /><AdminProducts /></> : page === 'matching' ? <AdminExperienceMatching canApprove={user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'} /> : page === 'commercial' ? <AdminCommercial canApprove={user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'} canManageGuardrails={user.role === 'SUPER_ADMIN'} currentUserId={user.id || user.sub || ''} /> : page === 'bookings' ? <><div className="admin-hero"><div><h2>Bookings</h2><p className="muted">Every booking on every channel. Support and finance act from here.</p></div></div><AdminBookings /></> : page === 'promotions' ? <><div className="admin-hero"><div><h2>Promotions</h2><p className="muted">Coupons we fund, and promotions vendors run on their own activities.</p></div></div><AdminPromotions /></> : page === 'settlements' ? <><div className="admin-hero"><div><h2>Finance</h2><p className="muted">Vendor payouts, agent wallets, refunds and invoices. Releasing money needs two approvals.</p></div></div><AdminSettlements canConfigure={user.role === 'SUPER_ADMIN'} currentUserId={user.id || user.sub || ''} /></> : page === 'audit' ? <div className="admin-team-page"><div className="admin-hero"><div><h2>Team &amp; audit log</h2><p className="muted">Internal staff, what each role can do, and every change made on the platform.</p></div></div>{canManageUsers && <AdminUsers />}<AdminAuditLog /></div> : page === 'settings' ? <AdminSettings /> : page === 'developer' ? <AdminDeveloperNotes /> : page === 'review' ? <AdminReview /> : page === 'refunds' ? <AdminRefunds /> : page === 'fulfilment' ? <AdminFulfilment /> : page === 'quality' ? <AdminQuality /> : page === 'demand' ? <AdminDemand /> : page === 'distribution' ? <AdminDistribution /> : page === 'buybox' ? <AdminBuyBox /> : page === 'users' ? <AdminUsers /> : <AdminEligibility />;
  return <div className="admin-shell"><aside className={`admin-sidebar${mobileMenuOpen ? ' mobile-menu-open' : ''}`}><div className="brand"><div className="brand-mark">A</div><div><b>Partner Hub Admin</b><small>Tours &amp; Attractions · internal</small></div><button type="button" className="admin-mobile-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-controls="admin-mobile-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? 'Close' : 'Menu'}</button></div><nav id="admin-mobile-navigation" className={`admin-nav${mobileMenuOpen ? ' is-open' : ''}`} aria-label="Admin navigation">{visibleSections.map((section) => <div className="admin-nav-section" key={section.label || 'primary'}>{section.label && <div className="admin-nav-label">{section.label}</div>}{section.items.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} aria-current={page === key ? 'page' : undefined} onClick={() => navigate(key)}>{label}{key === 'approvals' && approvalCount != null && <span className="admin-nav-count">{approvalCount}</span>}</button>)}</div>)}</nav><div className="sidebar-foot"><div className="admin-user-avatar">{(user.fullName || user.email).slice(0, 2).toUpperCase()}</div><div className="admin-user-details"><b>{user.fullName || user.email}</b><small>{roleLabel}</small></div><button type="button" className="admin-signout" onClick={logout}>Sign out</button></div></aside><main className="admin-main"><header className="topbar"><div><h1>{title}</h1><p>All channels · live data</p></div><div className="top-actions"><span className="verified">{roleLabel}</span><button className="logout" onClick={logout}>Sign out</button></div></header><div className="content">{content}</div></main></div>;
}

function AgentApp({ user, logout, onChangePassword }: { user: User; logout: () => void; onChangePassword: () => void }) {
  const [productId, setProductId] = useState<string | null>(null); const [context, setContext] = useState<AgentSearchContext | null>(null); const [searchState, setSearchState] = useState<AgentSearchState>();
  const [page, setPage] = useState<AgentPage>(() => agentPageFromPath(window.location.pathname)); const canBook = agentCanBook(user.organizationRole); const canFinance = user.organizationRole === 'OWNER' || user.organizationRole === 'FINANCE'; const canMarketplace = user.organizationRole !== 'FINANCE';
  const allowed: AgentPage[] = ['dashboard', ...(canMarketplace ? ['marketplace' as const] : []), 'bookings', ...(canFinance ? ['payments' as const] : []), 'reports', 'settings'];
  useEffect(() => {
    let requested = agentPageFromPath(window.location.pathname); if (!allowed.includes(requested)) requested = 'dashboard';
    if (!routePath(window.location.pathname).startsWith('/agent/')) window.history.replaceState({}, '', appPath(agentPaths[requested])); else if (agentPageFromPath(window.location.pathname) !== requested) window.history.replaceState({}, '', appPath(agentPaths[requested]));
    setPage(requested);
    const onPopState = () => { const next = agentPageFromPath(window.location.pathname); setPage(allowed.includes(next) ? next : 'dashboard'); setProductId(null); };
    window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState);
  }, [user.organizationRole]);
  function navigate(next: AgentPage) { if (!allowed.includes(next)) return; setPage(next); setProductId(null); const nextPath = appPath(agentPaths[next]); if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath); }
  let content: ReactNode;
  if (page === 'dashboard') content = <AgentDashboardPage user={user} onNavigate={(next) => navigate(next)} />;
  else if (page === 'bookings') content = <AgentBookings canBook={canBook} />;
  else if (page === 'payments') content = <AgentFinancePage />;
  else if (page === 'reports') content = <AgentReportsPage />;
  else if (page === 'settings') content = <AgentSettingsPage user={user} canManage={user.organizationRole === 'OWNER'} />;
  else if (productId && context) content = <AgentProductView productId={productId} context={context} canBook={canBook} onBack={() => setProductId(null)} />;
  else content = <AgentMarketplace initial={searchState} onStateChange={setSearchState} onView={(id, next) => { setProductId(id); setContext(next); }} />;
  return <AgentShell user={user} activeKey={page} canFinance={canFinance} onNavigate={navigate} onSignOut={logout} onChangePassword={onChangePassword}>{content}</AgentShell>;
}

export function Login({ onLogin, onRegister }: { onLogin: (user: User) => void | Promise<void>; onRegister: () => void }) {
  const [mode, setMode] = useState<'password' | 'email' | 'otp'>('password');
  const [email, setEmail] = useState(demoCredentials.vendor.email);
  const [password, setPassword] = useState(demoCredentials.vendor.password);
  const [code, setCode] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [activation, setActivation] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [loginChallengeId, setLoginChallengeId] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deviceToken] = useState(() => {
    const key = 'voya_vendor_trusted_device';
    const saved = window.localStorage.getItem(key);
    if (saved) return saved;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((remaining) => Math.max(remaining - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.login(email, password);
      api.setToken(result.accessToken); await onLogin(result.user);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function requestLoginCode(e?: FormEvent) {
    e?.preventDefault(); setBusy(true); setError(''); setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setBusy(false); setError('Use your email address for email-code sign-in, or use your verified mobile number with your password.'); return; }
    try {
      const result = await api.requestVendorLoginCode(email);
      setLoginChallengeId(result.challengeId); setCode(''); setDemoOtp(result.demoOtp || ''); setResendCooldown(10);
      setNotice(result.demoOtp ? 'Local demo sign-in code is shown below.' : result.message);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function verifyLoginCode(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = await api.verifyVendorLoginCode(loginChallengeId, code, deviceToken); api.setToken(result.accessToken); await onLogin(result.user); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function resendLoginCode() {
    await requestLoginCode();
  }

  async function requestEmailCode() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.requestVendorEmailCode(email); setEmailCodeSent(true); setCode(''); setResendCooldown(10);
      setDemoOtp(result.demoOtp || ''); setNotice(result.demoOtp ? `Demo email code: ${result.demoOtp}` : 'Check your email for the 6-digit verification code.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function verifyEmailCode() {
    setBusy(true); setError('');
    try {
      const result = await api.verifyVendorEmailCode(email, code); setSetupToken(result.setupToken);
      setActivation(result.purpose === 'ACTIVATE_VENDOR');
      setNotice(result.purpose === 'ACTIVATE_VENDOR' ? 'Email verified. Create your vendor password.' : 'Email verified. Choose a new password.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function setPasswordAndContinue() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true); setError('');
    try { const result = await api.setVendorPassword(setupToken, password); api.setToken(result.accessToken); await onLogin(result.user); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const loginKinds = ([['vendor', 'Vendor'], ['superAdmin', 'Super Admin'], ['admin', 'Admin'], ['agent', 'Agent']] as const)
    .filter(([kind]) => Boolean(demoCredentials[kind].email && demoCredentials[kind].password));
  const showDemoRoleButtons = loginKinds.length > 0;
  const submitEmailFlow = (e: FormEvent) => { e.preventDefault(); if (!emailCodeSent) void requestEmailCode(); else if (!setupToken) void verifyEmailCode(); else void setPasswordAndContinue(); };
  const submitOtpFlow = (e: FormEvent) => { if (loginChallengeId) void verifyLoginCode(e); else void requestLoginCode(e); };
  return <div className="login-page"><section className="register-art"><div className="register-brand"><span className="register-logo">P</span><div><b>Partner Hub</b><small>Tours &amp; Attractions</small></div></div><h1>List your tours, tickets and experiences in front of millions of Indian travellers.</h1><ul className="register-benefits"><li><b>No listing fee.</b> You pay commission only on confirmed bookings.</li><li><b>Weekly payouts</b> to your bank, with a statement for every rupee.</li><li><b>Your rules.</b> Set your own prices, time slots, cancellation policy and promotions.</li><li><b>Live in 3–5 working days</b> once your KYC and agreement are done.</li></ul><div className="register-flow"><span>Sign up</span><i>→</i><span>Verify business</span><i>→</i><span>Sign agreement</span><i>→</i><span>List products</span><i>→</i><span>Start selling</span></div><p className="register-muted">Theme parks, monuments, day tours, cruises, adventure, treks, camping and workshops are all welcome.</p></section><section className="register-panel login-panel"><div className="register-tabs"><button type="button" onClick={onRegister}>Create account</button><span className="active">Log in</span></div><form className="login-card" onSubmit={mode === 'password' ? submit : mode === 'otp' ? submitOtpFlow : submitEmailFlow}>
    {mode === 'password' ? <><h2>Welcome back</h2><p className="muted">Sign in with your email or verified mobile number and password.</p>
      {showDemoRoleButtons && <div className="login-role-buttons">{loginKinds.map(([kind, label]) => <button type="button" className="btn" key={kind} onClick={() => { setEmail(demoCredentials[kind].email); setPassword(demoCredentials[kind].password); }}>{label} Login</button>)}</div>}<button type="button" className="link-button login-switch" onClick={() => { setMode('email'); setPassword(''); setError(''); setNotice(''); }}>First-time access or reset password</button><label className="field"><span>Email or mobile</span><input required type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email or mobile number" /></label><label className="field"><span>Password</span><input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button type="button" className="link-button login-switch" onClick={() => { setMode('otp'); setLoginChallengeId(''); setCode(''); setDemoOtp(''); setError(''); setNotice(''); }}>Log in with OTP instead</button>
      <button className="btn primary wide" disabled={busy}>{busy ? 'Please wait...' : 'Sign in'}</button>
      <p className="register-prompt">New to Partner Hub? <button type="button" className="link-button" onClick={onRegister}>Create a vendor account</button></p>
    </> : mode === 'otp' ? <><h2>{loginChallengeId ? 'Enter your sign-in code' : 'Log in with OTP'}</h2><p className="muted">{loginChallengeId ? `We sent a 6-digit code to ${email}.` : 'Sign in without a password using a one-time email code.'}</p><button type="button" className="link-button login-switch" onClick={() => { setMode('password'); setLoginChallengeId(''); setCode(''); setDemoOtp(''); setError(''); setNotice(''); }}>← Use password login</button>{!loginChallengeId ? <label className="field"><span>Email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label> : <><label className="field"><span>6-digit sign-in code</span><input required autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" /></label>{demoOtp && <small className="login-demo-note">Local demo code: {demoOtp}</small>}<div className="login-resend">{resendCooldown > 0 ? <span>Resend sign-in code in {resendCooldown}s</span> : <button type="button" className="link-button" disabled={busy} onClick={() => void resendLoginCode()}>Resend code</button>}</div></>}<button className="btn primary wide" disabled={busy}>{busy ? 'Please wait...' : loginChallengeId ? 'Verify and sign in' : 'Send sign-in code'}</button>{!loginChallengeId && <p className="register-prompt">New to Partner Hub? <button type="button" className="link-button" onClick={onRegister}>Create a vendor account</button></p>}</> : <><h2>Email access</h2><p className="muted">Verify your email to create vendor access or reset your password.</p><button type="button" className="link-button login-switch" onClick={() => { setMode('password'); setEmailCodeSent(false); setSetupToken(''); setPassword(''); setError(''); setResendCooldown(0); }}>← Use password login</button><label className="field"><span>Email</span><input required type="email" value={email} disabled={emailCodeSent} onChange={(e) => setEmail(e.target.value)} /></label>{emailCodeSent && !setupToken && <label className="field"><span>6-digit email code</span><input required inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" /></label>}{setupToken && <label className="field"><span>{activation ? 'Create password' : 'New password'}</span><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}{emailCodeSent && !setupToken && <div className="login-resend">{resendCooldown > 0 ? <span>Resend code in {resendCooldown}s</span> : <button type="button" className="link-button" disabled={busy} onClick={() => void requestEmailCode()}>Resend code</button>}</div>}<button className="btn primary wide" disabled={busy}>{busy ? 'Please wait...' : !emailCodeSent ? 'Send email code' : !setupToken ? 'Verify code' : activation ? 'Create account and continue' : 'Reset password and continue'}</button></>}
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert info">{notice}</div>}{demoOtp && mode === 'email' && <small className="login-demo-note">Local demo only — the code is shown here because no email provider is configured.</small>}
  </form></section></div>;
}

export function Register({ onRegistered, onBack }: { onRegistered: (user: User) => void | Promise<void>; onBack: () => void }) {
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('Day tours & sightseeing');
  const [city, setCity] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<User | null>(null);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [mobileVerificationRequired, setMobileVerificationRequired] = useState(false);
  const [emailChallengeId, setEmailChallengeId] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifiedEmailUser, setVerifiedEmailUser] = useState<User | null>(null);
  const [emailOtp, setEmailOtp] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');
  const [emailDemoOtp, setEmailDemoOtp] = useState('');
  const [mobileDemoOtp, setMobileDemoOtp] = useState('');
  const [verifyingEmailLink, setVerifyingEmailLink] = useState(false);
  const [emailLinkError, setEmailLinkError] = useState('');
  const emailLinkStarted = useRef(false);
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [teamInviteToken] = useState(() => new URLSearchParams(window.location.search).get('teamInvite') || '');
  const [invitePreview, setInvitePreview] = useState<{ email: string; role: string; workspaceName: string; expiresAt: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(Boolean(teamInviteToken));
  const [deviceToken] = useState(() => {
    const key = 'voya_vendor_trusted_device';
    const saved = window.localStorage.getItem(key);
    if (saved) return saved;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  });

  useEffect(() => {
    if (!teamInviteToken) return;
    api.request<{ email: string; role: string; workspaceName: string; expiresAt: string }>(`/auth/vendor/team-invitations/${encodeURIComponent(teamInviteToken)}`)
      .then((invitation) => { setInvitePreview(invitation); setEmail(invitation.email); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setInviteLoading(false));
  }, [teamInviteToken]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('emailVerify');
    if (!token || emailLinkStarted.current) return;
    emailLinkStarted.current = true;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    setVerifyingEmailLink(true);
    setEmailLinkError('');
    void (async () => {
      try {
        const result = await api.verifyVendorLoginLink(token, deviceToken);
        api.setToken(result.accessToken);
        const onboarding = await api.request<{ emailVerificationEnabled?: boolean; mobileVerificationEnabled?: boolean; contactNumber?: string }>('/vendor/onboarding');
        const requireEmail = onboarding.emailVerificationEnabled !== false;
        const requireMobile = onboarding.mobileVerificationEnabled === true;
        if (!requireMobile) {
          await onRegistered(result.user);
          return;
        }
        setRegisteredUser(result.user);
        setVerifiedEmailUser(result.user);
        setEmailVerificationRequired(requireEmail);
        setEmailVerified(true);
        setEmailChallengeId('email-link-verified');
        setMobileVerificationRequired(true);
        const contactNumber = onboarding.contactNumber || '';
        setMobile(contactNumber);
        setNotice('Email verified. Complete mobile verification to continue.');
        if (contactNumber) await requestPhoneOtp(contactNumber);
        else setError('Add a mobile number in onboarding to continue.');
      } catch (cause) {
        api.setToken(null);
        setEmailLinkError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setVerifyingEmailLink(false);
      }
    })();
  }, [deviceToken, onRegistered]);

  async function requestPhoneOtp(contactNumber: string) {
    setError('');
    try {
      const result = await api.request<{ demoOtp?: string }>('/vendor/onboarding/otp/request', { method: 'POST', body: JSON.stringify({ contactNumber }) });
      setMobileDemoOtp(result.demoOtp || '');
      setMobileOtp('');
      setOtpSent(true);
      setNotice(`A verification code was sent to ${contactNumber}.`);
    } catch (e) { setError((e as Error).message); }
  }

  async function requestEmailOtp(accountEmail: string) {
    setError(''); setNotice(''); setEmailOtp(''); setEmailDemoOtp(''); setEmailChallengeId('');
    try {
      const result = await api.requestVendorLoginCode(accountEmail);
      setEmailChallengeId(result.challengeId);
      setEmailDemoOtp(result.demoOtp || '');
      setNotice(result.demoOtp ? 'Local demo sign-in code is shown below.' : 'Check your email for a 6-digit sign-in code.');
    } catch (e) { setError((e as Error).message); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (registeredUser) {
        let finalUser = verifiedEmailUser || registeredUser;
        if (emailVerificationRequired && !emailVerified) {
          if (!emailChallengeId) { await requestEmailOtp(registeredUser.email); return; }
          const result = await api.verifyVendorLoginCode(emailChallengeId, emailOtp, deviceToken);
          api.setToken(result.accessToken);
          setEmailVerified(true);
          setVerifiedEmailUser(result.user);
          finalUser = result.user;
        }
        if (mobileVerificationRequired) {
          if (!otpSent) { await requestPhoneOtp(mobile); return; }
          await api.request('/vendor/onboarding/otp/verify', { method: 'POST', body: JSON.stringify({ otp: mobileOtp }) });
        }
        await onRegistered(finalUser);
        return;
      }
      if (!acceptedTerms) { setError('Please accept the Partner Terms and Privacy Policy to continue.'); return; }
      if (password.length < 8 || !/\d/.test(password)) { setError('Password must be at least 8 characters and include a number.'); return; }
      if (teamInviteToken) {
        if (!invitePreview) { setError('This team invitation is invalid or expired. Ask the workspace owner for a new link.'); return; }
        const result = await api.register({ fullName, email: invitePreview.email, password, acceptedTerms, teamInviteToken });
        api.setToken(result.accessToken);
        await onRegistered(result.user);
        return;
      }
      const contactNumber = mobile.trim().replace(/[^\d+]/g, '');
      if (!/^\+?[1-9]\d{9,14}$/.test(contactNumber)) { setError('Enter a valid mobile number with country code.'); return; }
      const result = await api.register({ fullName, businessName, email, mobile: contactNumber, password, category, city, acceptedTerms });
      api.setToken(result.accessToken);
      setRegisteredUser(result.user);
      setMobile(contactNumber);
      const onboarding = await api.request<{ emailVerificationEnabled?: boolean; mobileVerificationEnabled?: boolean }>('/vendor/onboarding');
      const requireEmail = onboarding.emailVerificationEnabled !== false;
      const requireMobile = onboarding.mobileVerificationEnabled === true;
      setEmailVerificationRequired(requireEmail);
      setMobileVerificationRequired(onboarding.mobileVerificationEnabled === true);
      if (requireEmail) {
        await requestEmailOtp(result.user.email);
      }
      if (requireMobile) await requestPhoneOtp(contactNumber);
      if (requireEmail) api.setToken(null);
      if (!requireEmail && !requireMobile) {
        await onRegistered(result.user);
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <div className="register-page"><section className="register-art"><div className="register-brand"><span className="register-logo">P</span><div><b>Partner Hub</b><small>Tours &amp; Attractions</small></div></div><h1>List your tours, tickets and experiences in front of millions of Indian travellers.</h1><ul className="register-benefits"><li><b>No listing fee.</b> You pay commission only on confirmed bookings.</li><li><b>Weekly payouts</b> to your bank, with a statement for every rupee.</li><li><b>Your rules.</b> Set your own prices, time slots, cancellation policy and promotions.</li><li><b>Live in 3–5 working days</b> once your KYC and agreement are done.</li></ul><div className="register-flow"><span>Sign up</span><i>→</i><span>Verify business</span><i>→</i><span>Sign agreement</span><i>→</i><span>List products</span><i>→</i><span>Start selling</span></div><p className="register-muted">Theme parks, monuments, day tours, cruises, adventure, treks, camping and workshops are all welcome.</p></section><section className="register-panel"><div className="register-tabs"><span className="active">{registeredUser ? 'Verify account' : 'Create account'}</span><button type="button" onClick={() => { if (registeredUser) api.setToken(null); onBack(); }}>Log in</button></div>{verifyingEmailLink ? <div className="register-link-status" role="status"><h2>Verifying your email</h2><p className="muted">Your secure link is being checked. You’ll continue to vendor onboarding when it’s complete.</p></div> : emailLinkError ? <div className="register-link-status"><h2>Email link unavailable</h2><div className="alert error" role="alert">{emailLinkError}</div><p className="muted">The link may have expired or already been used. Sign in with your password or request a fresh email code.</p><button type="button" className="btn primary wide" onClick={onBack}>Back to log in</button></div> : registeredUser ? <form onSubmit={submit}><h2>Verify your account</h2><p className="muted">Complete the enabled checks below to continue to your vendor profile.</p>{notice && <div className="alert info" role="status">{notice}</div>}{error && <div className="alert error" role="alert">{error}</div>}{emailVerificationRequired && <section className="register-verification-section"><h3>Email verification</h3><p className="muted">{emailVerified ? `Verified: ${registeredUser.email}` : `Enter the 6-digit sign-in code sent to ${registeredUser.email}.`}</p>{!emailVerified && <><label className="register-field"><span>Email OTP</span><input required autoComplete="one-time-code" inputMode="numeric" maxLength={6} disabled={busy || !emailChallengeId} value={emailOtp} onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" /></label>{emailDemoOtp && <small className="login-demo-note">Local demo code: {emailDemoOtp}</small>}<button type="button" className="link-button" disabled={busy} onClick={() => void requestEmailOtp(registeredUser.email)}>{emailChallengeId ? 'Resend email code' : 'Send email code'}</button></>}</section>}{mobileVerificationRequired && <section className="register-verification-section"><h3>Mobile verification</h3><p className="muted">{otpSent ? `Enter the 6-digit code sent to ${mobile}.` : `Verify the mobile number ${mobile}.`}</p><label className="register-field"><span>Mobile OTP</span><input required autoComplete="one-time-code" inputMode="numeric" maxLength={6} disabled={busy || !otpSent} value={mobileOtp} onChange={(event) => setMobileOtp(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" /></label>{mobileDemoOtp && <small className="login-demo-note">Local demo code: {mobileDemoOtp}</small>}<button type="button" className="link-button" disabled={busy} onClick={() => void requestPhoneOtp(mobile)}>{otpSent ? 'Resend mobile code' : 'Send mobile code'}</button></section>}<button className="btn primary wide register-submit" disabled={busy || (emailVerificationRequired && (!emailChallengeId || !emailVerified && emailOtp.length !== 6)) || (mobileVerificationRequired && (!otpSent || mobileOtp.length !== 6))}>{busy ? 'Verifying…' : 'Verify and continue'}</button></form> : teamInviteToken ? <form onSubmit={submit}><h2>Join {invitePreview?.workspaceName || 'the partner workspace'}</h2><p className="muted">{inviteLoading ? 'Checking your invitation…' : invitePreview ? `You were invited as ${{ OWNER: 'Owner', CATALOGUE: 'Manager', OPERATIONS: 'Operations', FINANCE: 'Accounts', VIEWER: 'Viewer' }[invitePreview.role] || invitePreview.role}.` : 'This invitation is invalid or expired. Ask the workspace owner for a new link.'}</p><label className="register-field"><span>Your full name</span><input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" /></label><label className="register-field"><span>Invited email</span><input required type="email" readOnly value={invitePreview?.email || ''} /></label><label className="register-field"><span>Password</span><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /><small>8+ characters with a number</small></label><label className="register-check"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} /> <span>I agree to Partner Terms and Privacy Policy.</span></label>{error && <div className="alert error" role="alert">{error}</div>}<button className="btn primary wide register-submit" disabled={busy || inviteLoading || !invitePreview}>{busy ? 'Joining…' : 'Accept invitation'}</button></form> : <form onSubmit={submit}><div className="register-grid"><label className="register-field"><span>Your full name</span><input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Savio Fernandes" /></label><label className="register-field"><span>Business / brand name</span><input required minLength={2} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Goa Coastal" /></label><label className="register-field full"><span>Work email</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" /></label><label className="register-field full"><span>Mobile number</span><input required type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 98765 43210" /></label><label className="register-field"><span>What do you offer?</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Day tours &amp; sightseeing</option><option>Theme / water park</option><option>Monument / museum</option><option>Adventure &amp; water sports</option><option>Cruises &amp; boats</option><option>Camping &amp; treks</option><option>Workshops &amp; experiences</option></select></label><label className="register-field"><span>Main city</span><input required value={city} onChange={(e) => setCity(e.target.value)} placeholder="North Goa" /></label><label className="register-field full"><span>Password</span><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /><small>8+ characters with a number</small></label></div><label className="register-check"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} /> <span>I agree to Partner Terms and Privacy Policy.</span></label>{error && <div className="alert error">{error}</div>}<button className="btn primary wide register-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account & continue'}</button><p className="register-note">Next, you’ll add business details and KYC. It takes about 15 minutes; keep PAN, GST and a cancelled cheque handy.</p></form>}</section></div>;
}
