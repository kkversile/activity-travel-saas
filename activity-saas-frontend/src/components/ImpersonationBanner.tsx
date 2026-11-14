import { useLayoutEffect, useRef, useState } from 'react';
import { api, type User } from '../api';

const ORIGINAL_TOKEN_KEY = 'voya_impersonation_original_token';

export default function ImpersonationBanner({ user, onEnded }: { user: User; onEnded: () => void }) {
  const [busy, setBusy] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;
    const update = () => document.documentElement.style.setProperty('--impersonation-banner-height', `${banner.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(banner);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--impersonation-banner-height'); };
  }, []);
  async function end() {
    setBusy(true);
    try { await api.request('/auth/impersonation/end', { method: 'POST' }); } catch { /* restore the original session even if the short-lived target token expired */ }
    const original = sessionStorage.getItem(ORIGINAL_TOKEN_KEY);
    sessionStorage.removeItem(ORIGINAL_TOKEN_KEY);
    api.setToken(original);
    onEnded();
  }
  return <div className="impersonation-banner-slot" style={{ height: 'var(--impersonation-banner-height,44px)' }}><div ref={bannerRef} className="impersonation-banner" style={{ position: 'fixed', zIndex: 20, inset: '0 0 auto', background: 'var(--voya-primary, #6d28d9)', color: 'var(--voya-primary-text, var(--voya-on-primary))', minHeight: 44, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '8px 16px', fontSize: 13, boxShadow: '0 2px 12px rgba(0,0,0,.18)' }}><span>You are viewing Voya as <strong>{user.fullName || user.email}</strong> ({user.role.replace('_', ' ')})</span><button className="btn small" style={{ background: 'var(--voya-surface, #fff)', color: 'var(--voya-primary, #5b21b6)', borderColor: 'var(--voya-border, #fff)' }} disabled={busy} onClick={() => void end()}>{busy ? 'Ending…' : 'Return to Super Admin'}</button></div></div>;
}
