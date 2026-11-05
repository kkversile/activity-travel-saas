import type { WizardStepProps } from './types';
import { Field } from '../Ui';

export default function VoucherRedemptionStep({ locked, revisionForm: form, onRevisionChange: set }: WizardStepProps) {
  return <div className="experience-step-stack">
    <section className="experience-step-card"><div className="experience-card-heading"><div><h3>8 · Voucher &amp; redemption</h3><p>Tell travellers how to use their confirmation and what they should know on arrival.</p></div><span className="experience-pill">Supplier review</span></div><div className="experience-form-grid two"><Field label="How to redeem"><textarea rows={5} value={form.howToRedeem} onChange={(event) => set('howToRedeem', event.target.value)} disabled={locked} placeholder="Show the voucher at the meeting point, ticket counter or entrance…" /></Field><Field label="Terms and conditions"><textarea rows={5} value={form.terms} onChange={(event) => set('terms', event.target.value)} disabled={locked} placeholder="Supplier terms, restrictions and customer conditions…" /></Field><Field label="Additional information"><textarea rows={4} value={form.additionalInfo} onChange={(event) => set('additionalInfo', event.target.value)} disabled={locked} placeholder="Any final operational notes for the traveller…" /></Field></div><div className="partner-note">AI suggestions can prefill these fields, but the supplier remains responsible for confirming redemption instructions and terms before submission.</div></section>
  </div>;
}
