import { Fragment } from 'react';
import type { WizardStep } from './types';

const defaultLabels = ['Basic info', 'Experience', 'Options', 'Rates & rules', 'Availability', 'Fulfilment', 'Review & submit'];

export default function WizardNavigation({ activeStep, completed, onSelect, locked, busy = false, labels = defaultLabels, score }: { activeStep: WizardStep; completed: Set<number>; onSelect: (step: WizardStep) => void; locked: boolean; busy?: boolean; labels?: string[]; score?: number }) {
  return <nav className="experience-wizard-nav" aria-label="Experience setup steps">
    <div className="experience-wizard-counter">Step {activeStep} of {labels.length}</div>
    {labels.map((label, index) => { const step = (index + 1) as WizardStep; const done = completed.has(step) && step !== activeStep; return <Fragment key={label}>{labels.length === 9 && index % 3 === 0 && <div className="experience-nav-group">{['Tell the story', 'Make it bookable', 'Prepare for guests'][Math.floor(index / 3)]}</div>}<button type="button" key={label} className={`experience-wizard-step ${activeStep === step ? 'active' : ''} ${done ? 'completed' : ''}`} onClick={() => onSelect(step)} disabled={busy || (locked && step < labels.length)} aria-current={activeStep === step ? 'step' : undefined}><span className="experience-step-number">{done ? '✓' : step}</span><span>{label}</span></button></Fragment>; })}
    {score != null && <div className="experience-score-card" aria-label={`Setup progress ${score} percent`}><div><b>Setup progress</b><strong>{score}%</strong></div><span>Required fields checked in final review</span><div className="experience-score-track"><i style={{ width: `${Math.min(100, Math.max(0, score))}%` }} /></div></div>}
  </nav>;
}
