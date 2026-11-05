import type { ReactNode } from 'react';

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
  onNavigate: (key: string) => void;
  onSignOut: () => void;
  onChangePassword: () => void;
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
  onNavigate,
  onSignOut,
  onChangePassword,
  children,
}: Props) {
  const initials = vendorName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'V';

  return <div className={`partner-app-shell${activeKey === 'onboarding' ? ' partner-onboarding-shell' : ''}${activeKey === 'add-product' || activeKey === 'edit-product' ? ' partner-product-builder-shell' : ''}`}>
    <aside className="partner-sidebar">
      <div className="partner-brand">
        <div className="partner-logo">P</div>
        <div><b>Partner Hub</b><small>Tours &amp; Attractions</small></div>
      </div>

      <nav className="partner-nav" aria-label="Partner Hub navigation">
        {sections.map(({ key, label }) => {
          const items = navItems.filter((item) => (item.section || 'main') === key);
          if (!items.length) return null;
          return <div key={key} className="partner-nav-section">
            {label && <div className="partner-nav-label">{label}</div>}
            {items.map((item) => <button
              type="button"
              key={item.key}
              className={activeKey === item.key || (activeKey === 'edit-product' && item.key === 'add-product') ? 'active' : ''}
              onClick={() => onNavigate(item.key)}
            >
              <span>{item.label}</span>
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
      <div className="partner-content">{children}</div>
    </main>
  </div>;
}
