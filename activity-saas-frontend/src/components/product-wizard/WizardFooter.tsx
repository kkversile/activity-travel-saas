import type { WizardStep } from './types';

export default function WizardFooter({ step, busy, locked, onBack, onSave, onNext, onSubmit }: { step: WizardStep; busy: boolean; locked: boolean; onBack: () => void; onSave: () => void; onNext: () => void; onSubmit: () => void }) {
  return <footer className="experience-step-footer"><div>{step > 1 && <button type="button" className="btn" onClick={onBack} disabled={busy}>← Back</button>}</div><div className="experience-footer-actions">{!locked && <button type="button" className="btn" onClick={onSave} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>}{step < 6 && <button type="button" className="btn primary" onClick={onNext} disabled={busy || locked}>Next: {['Experience', 'Options', 'Rates & rules', 'Availability', 'Review & submit'][step - 1]} →</button>}{step === 6 && !locked && <button type="button" className="btn accent" onClick={onSubmit} disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</button>}</div></footer>;
}
