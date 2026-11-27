import { useState, type ReactNode } from 'react';
import type { VendorOutlet } from '../api';

export type VendorShellNavItem = {
  key: string;
  label: string;
  count?: number;
  section?: 'main' | 'account' | 'internal';
};

type Props = {
  activeKey: string;
  navItems: VendorShellNavItem[];
  vendorName: string;
  vendorLocation?: string;
  statusLabel: string;
  onboardingStatus?: string | null;
  onNavigate: (key: string) => void;
  onSignOut: () => void;
  onChangePassword: () => void;
  outlets?: VendorOutlet[];
  outletAccess?: 'ALL' | 'ASSIGNED';
  activeOutletId?: string | null;
  onOutletChange?: (id: string | null) => boolean | void;
  children: ReactNode;
};

const sections: Array<{ key: VendorShellNavItem['section']; label?: string }> = [
  { key: 'main' },
  { key: 'account', label: 'Account' },
  { key: 'internal', label: 'Not in product' },
];

export default function VendorShell({
  activeKey,
  navItems,
  vendorName,
  vendorLocation,
  statusLabel,
  onboardingStatus,
  onNavigate,
  onSignOut,
  onChangePassword,
  outlets = [],
  outletAccess,
  activeOutletId = null,
  onOutletChange,
  children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const awaitingApproval = onboardingStatus !== undefined && onboardingStatus !== "APPROVED";
  const initials = vendorName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'V';
  const activeOutlets = outlets;
  const showOutletSelector = activeOutlets.length > 1 || (outletAccess === 'ALL' && activeOutlets.length > 0);
  const activeOutlet = activeOutlets.find((outlet) => outlet.id === activeOutletId);
  const outletLabel = activeOutlet?.name || (outletAccess === 'ASSIGNED' ? activeOutlets[0]?.name || 'No outlet assigned' : 'All outlets');

  return <div className={`partner-app-shell${activeKey === 'onboarding' ? ' partner-onboarding-shell' : ''}${activeKey === 'add-product' || activeKey === 'edit-product' ? ' partner-product-builder-shell' : ''}`}>
    <a className="partner-skip-link" href="#partner-page-content">Skip to main content</a>
    <aside className={`partner-sidebar${menuOpen ? " partner-menu-open" : ""}`}>
      <div className="partner-brand">
        <div className="partner-logo">P</div>
        <div><b>Partner Hub</b><small>Tours &amp; Attractions</small></div>
      </div>

      <button type="button" className="partner-menu-toggle btn" aria-expanded={menuOpen} aria-controls="partner-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "Close menu" : "Menu"}</button>
      <nav id="partner-navigation" className="partner-nav" aria-label="Partner Hub navigation">
        {sections.map(({ key, label }) => {
          const items = navItems.filter((item) => (item.section || 'main') === key);
          if (!items.length) return null;
          return <div key={key} className="partner-nav-section">
            {label && <div className="partner-nav-label">{label}</div>}
            {items.map((item) => <button
              type="button"
              key={item.key}
              className={activeKey === item.key || (activeKey === 'edit-product' && item.key === 'add-product') ? 'active' : ''}
              aria-label={`${item.label}${awaitingApproval && ['bookings', 'payouts', 'promotions', 'reports'].includes(item.key) ? ' After approval' : ''}`}
              aria-disabled={awaitingApproval && ['bookings', 'payouts', 'promotions', 'reports'].includes(item.key) || undefined}
              title={awaitingApproval && ['bookings', 'payouts', 'promotions', 'reports'].includes(item.key) ? 'Available after your business is approved' : undefined}
              onClick={() => { if (awaitingApproval && ['bookings', 'payouts', 'promotions', 'reports'].includes(item.key)) return; onNavigate(item.key); setMenuOpen(false); }}
            >
              <span>{item.label}{awaitingApproval && ['bookings', 'payouts', 'promotions', 'reports'].includes(item.key) && <small className="partner-access-hint"> After approval</small>}</span>
              {item.count !== undefined && item.count > 0 && <span className="partner-nav-count">{item.count}</span>}
            </button>)}
          </div>;
        })}
      </nav>

      <div className="partner-user-card">
        <div className="partner-avatar">{initials}</div>
        <div className="partner-user-copy">
          <b>{vendorName}</b>
          <small>{vendorLocation || 'Vendor account'}</small>
        </div>
        <button type="button" className="partner-signout" onClick={onSignOut}>Sign out</button>
      </div>
    </aside>

    <main className="partner-main">
      <header className="partner-topbar">
        <div className="partner-mobile-brand"><div className="partner-logo">P</div><b>Partner Hub</b></div>
        <div className="partner-topbar-actions">
          <span className="partner-status">{statusLabel}</span>
          <div className="partner-avatar partner-avatar-small">{initials}</div>
          <button type="button" className="partner-link-button" onClick={onChangePassword}>Change password</button>
          <button type="button" className="partner-link-button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>
      <div className="partner-scope-bar">          {showOutletSelector && onOutletChange && <label className="partner-outlet-switcher"><span>Outlet</span><select aria-label="Current outlet" value={outletAccess === 'ALL' ? (activeOutletId || '') : (activeOutletId || activeOutlets[0]?.id || '')} onChange={(event) => { if (onOutletChange(event.target.value || null) === false) event.currentTarget.value = activeOutletId || (outletAccess === 'ASSIGNED' ? activeOutlets[0]?.id || '' : ''); }}>{outletAccess === 'ALL' && <option value="">All outlets</option>}{activeOutlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}{outlet.status === 'INACTIVE' ? ' (inactive)' : ''}</option>)}</select></label>}
          <span className="partner-outlet-scope" aria-live="polite">{outletLabel}</span>
</div>
      <div className="partner-content" id="partner-page-content" tabIndex={-1}>{children}</div>
    </main>
  </div>;
}
