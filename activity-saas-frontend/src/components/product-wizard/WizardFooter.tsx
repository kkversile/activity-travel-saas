import type { WizardStep } from './types';

export default function WizardFooter({ step, busy, locked, onBack, onSave, onNext, onSubmit, totalSteps = 7, nextLabels, submitLabel = 'Submit for QC' }: { step: WizardStep; busy: boolean; locked: boolean; onBack: () => void; onSave: () => void; onNext: () => void; onSubmit: () => void; totalSteps?: number; nextLabels?: string[]; submitLabel?: string }) {
  const labels = nextLabels || ['Experience', 'Options', 'Pricing & booking rules', 'Availability', 'Fulfilment', 'Review & submit'];
  return <footer className="experience-step-footer"><div>{step > 1 && <button type="button" className="btn" onClick={onBack} disabled={busy}>← Back</button>}</div><div className="experience-footer-actions">{!locked && <button type="button" className="btn" onClick={onSave} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>}{step < totalSteps && <button type="button" className="btn primary" onClick={onNext} disabled={busy || locked}>Next →</button>}{step === totalSteps && !locked && <button type="button" className="btn accent" onClick={onSubmit} disabled={busy}>{busy ? 'Submitting…' : submitLabel}</button>}</div></footer>;
}
