import { useEffect, useRef, useState } from 'react';
import { api, type Product, type ProductReadiness, type ProductRevision } from '../../api';
import { ErrorBox, Loading } from '../Ui';
import ActivityPricesAvailability from './ActivityPricesAvailability';
import BasicInfoStep from './BasicInfoStep';
import ExperienceStep from './ExperienceStep';
import OptionsStep from './OptionsStep';
import ReviewSubmitStep from './ReviewSubmitStep';
import WizardFooter from './WizardFooter';
import WizardNavigation from './WizardNavigation';
import type { FulfilmentForm, RevisionForm, WizardSnapshot, WizardStep } from './types';
import { emptyFulfilmentForm, emptyRevisionForm, splitList, toFulfilmentForm, toRevisionForm } from './types';

type Props = { product?: Product | null; initialStep?: WizardStep; onDone: () => void; onChanged: () => void };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 409 && /revision changed in another session/i.test(message)) return 'This product changed in another session. Reload the draft and review the conflicting changes before saving again.';
  if (/COMMERCIAL_VERSION_OVERLAP_REQUIRES_SPLIT|effective history|overlaps an existing bounded|same-start commercial version/i.test(message)) return 'These pricing dates overlap an existing version for this rate plan. A rate plan can have only one effective price at a time, and two versions cannot share the same start date. Choose a start date after the current version ends, or edit the existing version instead.';
  return message;
}

export default function ExperienceWizardModal({ product, initialStep = 1, onDone, onChanged }: Props) {
  const [snapshot, setSnapshot] = useState<WizardSnapshot>({ product: product || null, revision: null, variants: product?.variants || [], schedules: [] });
  const [form, setForm] = useState<RevisionForm>({ ...emptyRevisionForm });
  const [fulfilment, setFulfilment] = useState<FulfilmentForm>({ ...emptyFulfilmentForm });
  const unifiedInitialStep = initialStep;
  const [activeStep, setActiveStep] = useState<WizardStep>(unifiedInitialStep);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(Boolean(product?.id)); const [error, setError] = useState(''); const [dirty, setDirty] = useState(false); const [notice, setNotice] = useState(''); const [rejected, setRejected] = useState<ProductRevision | null>(null); const [pricingSaved, setPricingSaved] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null); const dialogRef = useRef<HTMLDivElement>(null); const dirtyRef = useRef(false); const busyRef = useRef(false); const reloadSequenceRef = useRef(0); const saveInFlightRef = useRef<Promise<boolean | string> | null>(null); const pricingSaveRef = useRef<(() => Promise<boolean>) | null>(null);

  async function reload(id: string, preserveEditor = false) {
    const sequence = ++reloadSequenceRef.current;
    setLoading(true); setError('');
    try {
      const loaded = await api.request<Product>(`/products/${id}`);
      if (sequence !== reloadSequenceRef.current) return;
      const working = loaded.revisions?.find((revision) => revision.status === 'DRAFT' || revision.status === 'UNDER_REVIEW') || loaded.currentRevision || null;
      // Older live API builds do not include bookingQuestions in GET /products/:id,
      // even though the records exist and the dedicated endpoint is available.
      // Enrich the revision from that endpoint so reopening the wizard does not
      // make saved questions appear to have disappeared.
      let revisionWithQuestions = working;
      if (working) {
        try {
          const questions = await api.request<NonNullable<ProductRevision['bookingQuestions']>>(`/product-revisions/${working.id}/booking-questions`);
          revisionWithQuestions = { ...working, bookingQuestions: questions };
        } catch {
          // Keep the embedded response when the endpoint is unavailable.
        }
      }
      const latestRejected = loaded.revisions?.filter((revision) => revision.status === 'REJECTED').sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
      setSnapshot({ product: loaded, revision: revisionWithQuestions, variants: loaded.variants || [], schedules: [] });
      setRejected(latestRejected);
      if (!preserveEditor) {
        setForm(toRevisionForm(revisionWithQuestions, loaded));
        setFulfilment(toFulfilmentForm(revisionWithQuestions?.fulfilmentPolicy));
        setDirty(false);
      }
    } catch (e) {
      if (sequence === reloadSequenceRef.current) setError(errorMessage(e));
    } finally {
      if (sequence === reloadSequenceRef.current) setLoading(false);
    }
  }
  useEffect(() => { setActiveStep(initialStep); if (product?.id) void reload(product.id); else { closeRef.current?.focus(); } }, [product?.id, initialStep]);
  useEffect(() => { dirtyRef.current = dirty; busyRef.current = busy; }, [dirty, busy]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || busyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
  useEffect(() => {
    if (!error) return;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('.experience-modal-body > .alert.error')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [error]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (!dialogRef.current) return; if (event.key === 'Escape') { event.preventDefault(); void close(); return; } if (event.key !== 'Tab') return; const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')); if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [onDone]);

  const revision = snapshot.revision; const locked = Boolean(revision && revision.status !== 'DRAFT');
  const onError = (message: string) => { setError(errorMessage(message)); setNotice(''); };
  const onRevisionChange = <K extends keyof RevisionForm>(key: K, value: RevisionForm[K]) => { setForm((old) => ({ ...old, [key]: value })); setDirty(true); setNotice(''); };
  async function refresh() { if (snapshot.product?.id) await reload(snapshot.product.id, dirtyRef.current); }
  function revisionPayload() {
    const mode = fulfilment.mode; const evidence = mode === 'AUTO' ? [] : mode === 'PNR_ONLY' ? ['PNR_REFERENCE'] : mode === 'TICKET_QR' ? (fulfilment.requiredEvidenceKinds.filter((kind) => ['TICKET_FILE', 'QR_TOKEN'].includes(kind)).length ? fulfilment.requiredEvidenceKinds.filter((kind) => ['TICKET_FILE', 'QR_TOKEN'].includes(kind)) : ['TICKET_FILE']) : fulfilment.requiredEvidenceKinds;
    return { productName: form.productName.trim(), type: form.type, subType: form.subType.trim(), subCategory: form.subCategory.trim() || undefined, shortDescription: form.shortDescription.trim() || undefined, metaname: form.metaname.trim() || undefined, description: form.description, highlights: splitList(form.highlights), terms: splitList(form.terms), importantInfo: splitList(form.importantInfo), thingsToCarry: splitList(form.thingsToCarry), safetyMeasures: splitList(form.safetyMeasures), additionalInfo: splitList(form.additionalInfo), howToRedeem: splitList(form.howToRedeem), labels: splitList(form.labels), cityName: form.cityName.trim(), stateName: form.stateName.trim(), countryName: form.countryName.trim(), address: form.address.trim() || undefined, lat: form.lat ? Number(form.lat) : undefined, lon: form.lon ? Number(form.lon) : undefined, meetingModel: form.meetingModel || undefined, meetingPoint: form.meetingPoint.trim() || undefined, sourcePayload: { hasDifferentialVisitorPricing: form.hasDifferentialVisitorPricing }, fulfilmentPolicy: mode ? { ...fulfilment, reviewRequired: fulfilment.reviewRequired, requiredEvidenceKinds: evidence, evidenceMatchMode: mode === 'PNR_ONLY' ? 'ALL' : mode === 'TICKET_QR' ? 'ANY' : fulfilment.evidenceMatchMode, voucherNotes: splitList(fulfilment.voucherNotes) } : undefined };
  }
  async function saveDraft(): Promise<boolean | string> {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const operation = (async () => {
      if (locked) return false;
      if (!form.productName.trim() || !form.type || !form.subType.trim()) { setError('Add a product name, product type, and sub-type before saving the draft.'); setActiveStep(1); return false; }
      setBusy(true); setError(''); setNotice('');
      try {
        if (!snapshot.product) {
          const created = await api.request<Product>('/products/drafts', { method: 'POST', body: JSON.stringify({ productName: form.productName.trim(), currency: form.currency, type: form.type, subType: form.subType.trim(), subCategory: form.subCategory.trim() || undefined, shortDescription: form.shortDescription.trim() || undefined, cityName: form.cityName.trim() || undefined, stateName: form.stateName.trim() || undefined, countryName: form.countryName.trim() || undefined, meetingModel: form.meetingModel || undefined, meetingPoint: form.meetingPoint.trim() || undefined }) });
          await reload(created.id); onChanged(); return created.id;
        } else if (revision?.status === 'DRAFT' && dirty) {
          await api.request(`/product-revisions/${revision.id}`, { method: 'PATCH', body: JSON.stringify(revisionPayload()) });
          await api.request(`/products/${snapshot.product.id}/currency`, { method: 'PATCH', body: JSON.stringify({ currency: form.currency }) });
          await reload(snapshot.product.id); onChanged();
        }
        setDirty(false);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    })();
    saveInFlightRef.current = operation;
    try { return await operation; } finally { if (saveInFlightRef.current === operation) saveInFlightRef.current = null; }
  }
  function validateStep(step: WizardStep) {
    if (step === 1) { const missing = [['product name', form.productName], ['product type', form.type], ['sub-type', form.subType], ['sub-category', form.subCategory], ['city', form.cityName], ['state / region', form.stateName], ['country', form.countryName], ['meeting model', form.meetingModel], ['short description', form.shortDescription]].filter(([, value]) => !String(value || '').trim()).map(([label]) => label); if (missing.length) { setError(`Complete the required basic information: ${missing.join(', ')}.`); return false; } }
    if (step === 2) { if (!form.description.trim()) { setError('Add a full experience description before continuing.'); return false; } }
    if (step === 3) { if (!snapshot.variants.length) { setError('Add at least one option before configuring prices.'); return false; } }
    if (step === 4) { if (!pricingSaved && !snapshot.variants.some((variant) => (variant.ratePlans || []).length)) { setError('Save prices for at least one option before continuing.'); return false; } }
    return true;
  }
  async function next() { if (locked || !validateStep(activeStep)) return; const saved = await saveDraft(); if (!saved) return; setActiveStep((step) => Math.min(6, step + 1) as WizardStep); }
  async function startRevision(sourceRevisionId?: string) { if (!snapshot.product) return; setBusy(true); setError(''); try { await api.request(`/products/${snapshot.product.id}/revisions`, { method: 'POST', body: JSON.stringify(sourceRevisionId ? { sourceRevisionId } : {}) }); await reload(snapshot.product.id); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function submit() { if (!snapshot.product || !revision || revision.status !== 'DRAFT') return; const saved = await saveDraft(); if (!saved) return; setBusy(true); try { const result = await api.request<ProductReadiness>(`/products/${snapshot.product.id}/readiness`); if (!result.ready) { setError('This experience still needs attention before it can be submitted.'); setActiveStep(5); return; } await api.request(`/product-revisions/${revision.id}/submit`, { method: 'POST' }); await reload(snapshot.product.id); onChanged(); setNotice('Submitted for review. Platform review can now publish this revision.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function close() { if (busyRef.current) return; if (dirtyRef.current && !window.confirm('You have unsaved changes. Close without saving? Your persisted draft will remain available.')) return; onDone(); }
  const completed = new Set<number>([...(snapshot.revision && form.productName.trim() && form.type && form.subType.trim() ? [1] : []), ...(snapshot.revision && form.description.trim() ? [2] : []), ...(snapshot.variants.length ? [3] : []), ...(pricingSaved || snapshot.variants.some((variant) => (variant.ratePlans || []).length) ? [4] : [])]);
  const stepProps = { snapshot, locked, revisionForm: form, fulfilment, onSaveDraft: async () => Boolean(await saveDraft()), onSaveDraftWithId: saveDraft, onRegisterPricingSave: (handler: (() => Promise<boolean>) | null) => { pricingSaveRef.current = handler; }, onRevisionChange, onFulfilmentChange: (nextValue: FulfilmentForm) => { setFulfilment(nextValue); setDirty(true); }, onRefresh: refresh, onError, onPricingDirty: () => { setDirty(true); setNotice(''); }, onPricingSaved: () => { setPricingSaved(true); setDirty(false); } };
  const unifiedLabels = ['Activity details', 'Experience', 'Options', 'Pricing', 'Availability', 'Review & submit'];
  async function saveActiveStep() { if ((activeStep === 4 || activeStep === 5) && pricingSaveRef.current) { await pricingSaveRef.current(); return; } await saveDraft(); }
  return <div className="experience-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) void close(); }}><div ref={dialogRef} className="experience-modal" role="dialog" aria-modal="true" aria-labelledby="experience-modal-title"><header className="experience-modal-header"><div><h2 id="experience-modal-title">{snapshot.product ? 'Edit marketplace experience' : 'Create marketplace experience'}</h2><p>Add the activity once, then configure pricing and availability as separate steps.</p></div><button ref={closeRef} type="button" className="experience-modal-close" aria-label="Close experience wizard" onClick={() => void close()}>×</button></header>{loading ? <Loading text="Loading experience…" /> : <><div className="experience-modal-body">{error && <ErrorBox error={error} />}{notice && <div className="alert success">{notice}</div>}{rejected && !revision && <div className="alert error"><b>Revision rejected:</b> {rejected.rejectionReason || 'No reason supplied.'} <button type="button" className="link-button" onClick={() => void startRevision(rejected.id)}>Create corrected draft</button></div>}{snapshot.product && revision && revision.status !== 'DRAFT' && <div className="experience-readonly-banner"><b>{revision.status === 'UNDER_REVIEW' ? 'Under review' : revision.status === 'PUBLISHED' ? 'Published revision' : revision.status}</b><span>This revision is read-only. {revision.status === 'PUBLISHED' && 'Create a working revision to make changes.'}</span>{revision.status !== 'UNDER_REVIEW' && <button type="button" className="btn small" onClick={() => void startRevision()}>Create working revision</button>}</div>}<div className="experience-wizard"><WizardNavigation activeStep={activeStep} completed={completed} onSelect={setActiveStep} locked={false} labels={unifiedLabels} /><main className="experience-wizard-content"><>{activeStep === 1 && <BasicInfoStep {...stepProps} />}{activeStep === 2 && <ExperienceStep {...stepProps} />}{activeStep === 3 && <OptionsStep {...stepProps} />}{activeStep === 4 && <ActivityPricesAvailability {...stepProps} section="pricing" />}{activeStep === 5 && <ActivityPricesAvailability {...stepProps} section="availability" />}{activeStep === 6 && <ReviewSubmitStep {...stepProps} onNavigate={setActiveStep} />}</></main></div></div><WizardFooter step={activeStep} busy={busy} locked={locked} totalSteps={6} nextLabels={['Experience', 'Options', 'Pricing', 'Availability', 'Review & submit']} onBack={() => setActiveStep((step) => Math.max(1, step - 1) as WizardStep)} onSave={saveActiveStep} onNext={() => void next()} onSubmit={() => void submit()} /></>}</div></div>;
}
