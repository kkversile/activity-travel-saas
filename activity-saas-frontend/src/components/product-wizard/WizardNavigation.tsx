import type { WizardStep } from './types';

const labels = ['Basic info', 'Experience', 'Options', 'Rates & rules', 'Availability', 'Review & submit'];

export default function WizardNavigation({ activeStep, completed, onSelect, locked }: { activeStep: WizardStep; completed: Set<number>; onSelect: (step: WizardStep) => void; locked: boolean }) {
  return <nav className="experience-wizard-nav" aria-label="Experience setup steps">
    {labels.map((label, index) => { const step = (index + 1) as WizardStep; const done = completed.has(step) && step !== activeStep; return <button type="button" key={label} className={`experience-wizard-step ${activeStep === step ? 'active' : ''} ${done ? 'completed' : ''}`} onClick={() => onSelect(step)} disabled={locked && step < 6} aria-current={activeStep === step ? 'step' : undefined}><span className="experience-step-number">{done ? '✓' : step}</span><span>{label}</span></button>; })}
  </nav>;
}
