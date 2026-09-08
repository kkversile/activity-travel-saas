import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';

export function Badge({ value }: { value: string }) {
  const cls = value.toLowerCase().replaceAll('_', '-');
  return <span className={`badge ${cls}`}>{value.replaceAll('_', ' ')}</span>;
}

export function Panel({ title, action, children, className = '', id }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`panel ${className}`}>
      {(title || action) && <div className="panel-head"><h3>{title}</h3>{action}</div>}
      <div className="panel-body">{title === 'Standing Pricing Rules' ? <PricingRulesManager /> : children}</div>
    </section>
  );
}

type PricingRule = { id: string; activityId: string; name: string; appliesTo: string; adjustmentType: 'PERCENTAGE' | 'ABSOLUTE'; adjustment: number | string; startsAt: string; endsAt: string; active: boolean };
function PricingRulesManager() {
  const [rules, setRules] = useState<PricingRule[]>([]), [editing, setEditing] = useState<PricingRule | null>(null), [form, setForm] = useState({ activityId: '', name: '', appliesTo: 'All listings', adjustmentType: 'PERCENTAGE' as 'PERCENTAGE' | 'ABSOLUTE', adjustment: 0, startsAt: new Date().toISOString().slice(0, 10), endsAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), active: true }), [open, setOpen] = useState(false), [error, setError] = useState('');
  const load = async () => { try { const [loaded, activities] = await Promise.all([api.request<PricingRule[]>('/pricing-rules'), api.request<Array<{ id: string }>>('/activities')]); setRules(loaded); const activityId = loaded[0]?.activityId || activities[0]?.id || ''; if (!form.activityId && activityId) setForm(x => ({ ...x, activityId })); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);
  const edit = (rule?: PricingRule) => { setEditing(rule || null); setForm(rule ? { ...rule, adjustment: Number(rule.adjustment), startsAt: rule.startsAt.slice(0, 10), endsAt: rule.endsAt.slice(0, 10) } : { ...form, name: '', adjustment: 0 }); setOpen(true); setError(''); };
  const save = async () => { try { if (!form.name.trim()) throw new Error('Rule name is required.'); if (form.endsAt <= form.startsAt) throw new Error('End date must be after start date.'); const value = editing ? await api.request<PricingRule>(`/pricing-rules/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) }) : await api.request<PricingRule>('/pricing-rules', { method: 'POST', body: JSON.stringify(form) }); setRules(x => editing ? x.map(r => r.id === value.id ? value : r) : [...x, value]); setOpen(false); } catch (e) { setError((e as Error).message); } };
  const remove = async (id: string) => { if (!window.confirm('Delete this pricing rule?')) return; await api.request(`/pricing-rules/${id}`, { method: 'DELETE' }); setRules(x => x.filter(r => r.id !== id)); };
  return <>{error && <ErrorBox error={error} />}<div className="pricing-rule-toolbar"><button className="btn accent" onClick={() => edit()}>+ Add Pricing Rule</button></div>{rules.map(r => <div className="rule-row" key={r.id}><b>{r.name}</b><span>{r.appliesTo}</span><strong>{r.adjustmentType === 'PERCENTAGE' ? `${Number(r.adjustment) > 0 ? '+' : ''}${r.adjustment}%` : `₹${r.adjustment}`}</strong><button className="badge live" onClick={() => void api.request(`/pricing-rules/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active: !r.active }) }).then(load)}>{r.active ? 'Active' : 'Inactive'}</button><button className="btn small" onClick={() => edit(r)}>Edit</button><button className="btn small" onClick={() => void remove(r.id)}>Delete</button></div>)}{open && <div className="modal-backdrop"><div className="modal-card"><h3>{editing ? 'Edit Pricing Rule' : 'Add Pricing Rule'}</h3><div className="form-grid two"><Field label="Rule name"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><Field label="Applies to"><input value={form.appliesTo} onChange={e => setForm({ ...form, appliesTo: e.target.value })} /></Field><Field label="Adjustment type"><select value={form.adjustmentType} onChange={e => setForm({ ...form, adjustmentType: e.target.value as 'PERCENTAGE' | 'ABSOLUTE' })}><option value="PERCENTAGE">Percentage</option><option value="ABSOLUTE">Fixed amount</option></select></Field><Field label="Adjustment"><input type="number" min={0} value={form.adjustment} onChange={e => setForm({ ...form, adjustment: Number(e.target.value) })} /></Field><Field label="Start date"><input type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></Field><Field label="End date"><input type="date" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></Field></div><label className="check"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active</label><div className="modal-actions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={() => void save()}>Save Rule</button></div></div></div>}</>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (value: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" className="toggle-row" onClick={() => onChange(!checked)}>
      <span><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <span className={`toggle ${checked ? 'on' : ''}`}><i /></span>
    </button>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <div className="loading">{text}</div>;
}

export function ErrorBox({ error }: { error: string }) {
  return <div className="alert error">{error}</div>;
}

export const money = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
export const shortDate = (value: string | Date) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
