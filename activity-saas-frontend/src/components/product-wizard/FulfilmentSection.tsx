import { useEffect, useState } from 'react';
import { Field } from '../Ui';
import type { FulfilmentForm } from './types';

export default function FulfilmentSection({ value, locked, onChange, onSave }: { value: FulfilmentForm; locked: boolean; onChange: (next: FulfilmentForm) => void; onSave: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value.mode === 'PNR_ONLY' && value.requiredEvidenceKinds.join() !== 'PNR_REFERENCE') onChange({ ...value, requiredEvidenceKinds: ['PNR_REFERENCE'], evidenceMatchMode: 'ALL' });
    if (value.mode === 'AUTO' && value.requiredEvidenceKinds.length) onChange({ ...value, requiredEvidenceKinds: [], evidenceMatchMode: 'ALL' });
  }, [value.mode]);
  return <section className="experience-step-card">
    <div className="experience-card-heading"><div><h3>Fulfilment</h3><p>Supplier operations information is entered here. AI does not fill contacts or fulfilment evidence rules.</p></div><span className="experience-pill">{value.mode || 'Not configured'}</span></div>
    <div className="experience-form-grid two"><Field label="Fulfilment mode"><select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as FulfilmentForm['mode'] })} disabled={locked}><option value="">Select a mode</option><option value="AUTO">Generate automatically after confirmation</option><option value="AFTER_FULFILMENT">Wait for supplier fulfilment evidence</option><option value="PNR_ONLY">PNR or reference required</option><option value="TICKET_QR">Supplier ticket or QR required</option></select></Field><Field label="Operations contact"><input value={value.operationsContactName} onChange={(e) => onChange({ ...value, operationsContactName: e.target.value })} disabled={locked} /></Field><Field label="Operations phone"><input value={value.operationsContactPhone} onChange={(e) => onChange({ ...value, operationsContactPhone: e.target.value })} disabled={locked} /></Field><Field label="Operations email"><input type="email" value={value.operationsContactEmail} onChange={(e) => onChange({ ...value, operationsContactEmail: e.target.value })} disabled={locked} /></Field></div>
    <div className="experience-subcard"><h4>Emergency contact</h4><div className="experience-form-grid three"><Field label="Name"><input value={value.emergencyContactName} onChange={(e) => onChange({ ...value, emergencyContactName: e.target.value })} disabled={locked} /></Field><Field label="Phone"><input value={value.emergencyContactPhone} onChange={(e) => onChange({ ...value, emergencyContactPhone: e.target.value })} disabled={locked} /></Field><Field label="Email"><input type="email" value={value.emergencyContactEmail} onChange={(e) => onChange({ ...value, emergencyContactEmail: e.target.value })} disabled={locked} /></Field></div></div>
    <Field label="Voucher notes"><textarea rows={3} value={value.voucherNotes} onChange={(e) => onChange({ ...value, voucherNotes: e.target.value })} disabled={locked} placeholder="Instructions printed or shown on the customer voucher" /></Field>
    <label className="wizard-check"><input type="checkbox" checked={value.reviewRequired} onChange={(e) => onChange({ ...value, reviewRequired: e.target.checked })} disabled={locked} /> Require supplier fulfilment evidence review</label>
    {!locked && <button type="button" className="btn" disabled={busy} onClick={() => void (async () => { setBusy(true); try { await onSave(); } finally { setBusy(false); } })()}>{busy ? 'Saving…' : 'Save fulfilment'}</button>}
  </section>;
}
