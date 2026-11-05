import { MediaSection } from './ExperienceStep';
import type { WizardStepProps } from './types';

export default function PhotosStep({ snapshot, locked, onRefresh, onError }: WizardStepProps) {
  if (!snapshot.revision) return <div className="experience-step-card"><h3>Photos &amp; video</h3><p>Save the draft first, then add verified images or a hosted video.</p></div>;
  return <div className="experience-step-stack"><MediaSection revision={snapshot.revision} locked={locked} onRefresh={onRefresh} onError={onError} /></div>;
}
