import { type ReactNode } from 'react';
export function Badge({ value }: { value: string }) { return <span className={`badge ${value.toLowerCase().replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span>; }
export function Panel({ title, action, children, className = '', id }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) { return <section id={id} className={`panel ${className}`}>{(title || action) && <div className="panel-head"><h3>{title}</h3>{action}</div>}<div className="panel-body">{children}</div></section>; }
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (value: boolean) => void; label: string; sub?: string }) { return <button type="button" className="toggle-row" onClick={() => onChange(!checked)}><span><b>{label}</b>{sub && <small>{sub}</small>}</span><span className={`toggle ${checked ? 'on' : ''}`}><i /></span></button>; }
export function Loading({ text = 'Loading…' }: { text?: string }) { return <div className="loading">{text}</div>; }
export function ErrorBox({ error }: { error: string }) { return <div className="alert error">{error}</div>; }
export const money = (value: number | string, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: String(currency || 'INR').toUpperCase(), maximumFractionDigits: 2 }).format(Number(value));
export const shortDate = (value: string | Date) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
