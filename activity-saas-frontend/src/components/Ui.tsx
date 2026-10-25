import { type ReactNode } from 'react';
export function Badge({ value }: { value: string }) { return <span className={`badge ${value.toLowerCase().replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span>; }
export function Panel({ title, action, children, className = '', id }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) { return <section id={id} className={`panel ${className}`}>{(title || action) && <div className="panel-head"><h3>{title}</h3>{action}</div>}<div className="panel-body">{children}</div></section>; }
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}{hint && <small>{hint}</small>}</label>; }
export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (value: boolean) => void; label: string; sub?: string }) { return <button type="button" className="toggle-row" onClick={() => onChange(!checked)}><span><b>{label}</b>{sub && <small>{sub}</small>}</span><span className={`toggle ${checked ? 'on' : ''}`}><i /></span></button>; }
export function Loading({ text = 'Loading…' }: { text?: string }) { return <div className="loading">{text}</div>; }
export function ErrorBox({ error }: { error: string }) { return <div className="alert error">{error}</div>; }
export function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm, busy = false, reason, onReasonChange, reasonLabel = 'Reason', reasonPlaceholder = 'Enter a reason' }: { title: string; message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void; busy?: boolean; reason?: string; onReasonChange?: (value: string) => void; reasonLabel?: string; reasonPlaceholder?: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h3 id="confirm-dialog-title">{title}</h3><p className="muted">{message}</p></div><button type="button" className="modal-close" disabled={busy} onClick={onCancel} aria-label="Close confirmation">×</button></div>{onReasonChange && <label className="field"><span>{reasonLabel}</span><textarea rows={3} value={reason || ''} onChange={(event) => onReasonChange(event.target.value)} placeholder={reasonPlaceholder} /></label>}<div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="btn primary" disabled={busy || Boolean(onReasonChange && !reason?.trim())} onClick={onConfirm}>{busy ? 'Saving…' : confirmLabel}</button></div></div></div>;
}
export const money = (value: number | string, currency = 'INR') => {
  const code = String(currency || 'INR').toUpperCase();
  const amount = Number(value);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount);
  } catch (error) {
    // Legacy or externally imported records can contain a non-ISO currency code.
    // Keep the screen usable and preserve the raw code until the data is corrected.
    if (error instanceof RangeError) return `${code} ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)}`;
    throw error;
  }
};
export const shortDate = (value: string | Date) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
