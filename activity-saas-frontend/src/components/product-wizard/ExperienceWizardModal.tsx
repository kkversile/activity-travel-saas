import { useEffect, useRef, useState } from 'react';
import { api, type Product, type ProductReadiness, type ProductRevision } from '../../api';
import { ErrorBox, Loading } from '../Ui';
import AvailabilityStep from './AvailabilityStep';
import BasicInfoStep from './BasicInfoStep';
import ExperienceStep from './ExperienceStep';
import OptionsStep from './OptionsStep';
import RatesRulesStep from './RatesRulesStep';
import ReviewSubmitStep from './ReviewSubmitStep';
import WizardFooter from './WizardFooter';
import WizardNavigation from './WizardNavigation';
import type { FulfilmentForm, RevisionForm, WizardSnapshot, WizardStep } from './types';
import { emptyFulfilmentForm, emptyRevisionForm, splitList, toFulfilmentForm, toRevisionForm } from './types';

type Props = { product?: Product | null; onDone: () => void; onChanged: () => void };

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 409) return 'This product changed in another session. Reloaded the latest version; please review and retry.';
  return error instanceof Error ? error.message : String(error);
}

export default function ExperienceWizardModal({ product, onDone, onChanged }: Props) {
  const [snapshot, setSnapshot] = useState<WizardSnapshot>({ product: product || null, revision: null, variants: product?.variants || [], schedules: [] });
  const [form, setForm] = useState<RevisionForm>({ ...emptyRevisionForm });
  const [fulfilment, setFulfilment] = useState<FulfilmentForm>({ ...emptyFulfilmentForm });
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(Boolean(product?.id)); const [error, setError] = useState(''); const [dirty, setDirty] = useState(false); const [notice, setNotice] = useState(''); const [rejected, setRejected] = useState<ProductRevision | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null); const dialogRef = useRef<HTMLDivElement>(null); const dirtyRef = useRef(false); const busyRef = useRef(false);

  async function reload(id: string) {
    setLoading(true); setError('');
    try { const loaded = await api.request<Product>(`/products/${id}`); const working = loaded.revisions?.find((revision) => revision.status === 'DRAFT' || revision.status === 'UNDER_REVIEW') || loaded.currentRevision || null; const latestRejected = loaded.revisions?.filter((revision) => revision.status === 'REJECTED').sort((a, b) => b.versionNumber - a.versionNumber)[0] || null; setSnapshot({ product: loaded, revision: working, variants: loaded.variants || [], schedules: [] }); setRejected(latestRejected); setForm(toRevisionForm(working)); setFulfilment(toFulfilmentForm(working?.fulfilmentPolicy)); setDirty(false); } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }
  useEffect(() => { if (product?.id) void reload(product.id); else { closeRef.current?.focus(); } }, [product?.id]);
  useEffect(() => { dirtyRef.current = dirty; busyRef.current = busy; }, [dirty, busy]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (!dialogRef.current) return; if (event.key === 'Escape') { event.preventDefault(); void close(); return; } if (event.key !== 'Tab') return; const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')); if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [onDone]);

  const revision = snapshot.revision; const locked = Boolean(revision && revision.status !== 'DRAFT');
  const onError = (message: string) => { setError(message); setNotice(''); };
  const onRevisionChange = <K extends keyof RevisionForm>(key: K, value: RevisionForm[K]) => { setForm((old) => ({ ...old, [key]: value })); setDirty(true); setNotice(''); };
  async function refresh() { if (snapshot.product?.id) await reload(snapshot.product.id); }
  function revisionPayload() {
    const mode = fulfilment.mode; const evidence = mode === 'AUTO' ? [] : mode === 'PNR_ONLY' ? ['PNR_REFERENCE'] : mode === 'TICKET_QR' ? (fulfilment.requiredEvidenceKinds.filter((kind) => ['TICKET_FILE', 'QR_TOKEN'].includes(kind)).length ? fulfilment.requiredEvidenceKinds.filter((kind) => ['TICKET_FILE', 'QR_TOKEN'].includes(kind)) : ['TICKET_FILE']) : fulfilment.requiredEvidenceKinds;
    return { productName: form.productName.trim(), type: form.type, subType: form.subType.trim(), subCategory: form.subCategory.trim() || undefined, shortDescription: form.shortDescription.trim() || undefined, metaname: form.metaname.trim() || undefined, description: form.description, highlights: splitList(form.highlights), terms: splitList(form.terms), importantInfo: splitList(form.importantInfo), thingsToCarry: splitList(form.thingsToCarry), safetyMeasures: splitList(form.safetyMeasures), additionalInfo: splitList(form.additionalInfo), howToRedeem: splitList(form.howToRedeem), labels: splitList(form.labels), cityName: form.cityName.trim(), stateName: form.stateName.trim(), countryName: form.countryName.trim(), address: form.address.trim() || undefined, lat: form.lat ? Number(form.lat) : undefined, lon: form.lon ? Number(form.lon) : undefined, meetingModel: form.meetingModel || undefined, meetingPoint: form.meetingPoint.trim() || undefined, fulfilmentPolicy: mode ? { ...fulfilment, requiredEvidenceKinds: evidence, evidenceMatchMode: mode === 'PNR_ONLY' ? 'ALL' : mode === 'TICKET_QR' ? 'ANY' : fulfilment.evidenceMatchMode, voucherNotes: splitList(fulfilment.voucherNotes) } : undefined };
  }
  async function saveDraft() {
    if (locked) return; if (!form.productName.trim() || !form.subType.trim()) { setError('Add a product name and experience type before saving the draft.'); setActiveStep(1); return false; }
    setBusy(true); setError(''); setNotice('');
    try { if (!snapshot.product) { const created = await api.request<Product>('/products/drafts', { method: 'POST', body: JSON.stringify({ productName: form.productName.trim(), type: form.type, subType: form.subType.trim(), subCategory: form.subCategory.trim() || undefined, shortDescription: form.shortDescription.trim() || undefined, cityName: form.cityName.trim() || undefined, stateName: form.stateName.trim() || undefined, countryName: form.countryName.trim() || undefined, meetingModel: form.meetingModel || undefined, meetingPoint: form.meetingPoint.trim() || undefined }) }); await reload(created.id); onChanged(); } else if (revision?.status === 'DRAFT' && dirty) { await api.request(`/product-revisions/${revision.id}`, { method: 'PATCH', body: JSON.stringify(revisionPayload()) }); await reload(snapshot.product.id); onChanged(); } setDirty(false); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  }
  function validateStep(step: WizardStep) {
    if (step === 1) { const missing = [['product name', form.productName], ['experience type', form.subType], ['sub-category', form.subCategory], ['city', form.cityName], ['state / region', form.stateName], ['country', form.countryName], ['meeting model', form.meetingModel], ['short description', form.shortDescription]].filter(([, value]) => !String(value || '').trim()).map(([label]) => label); if (missing.length) { setError(`Complete the required basic information: ${missing.join(', ')}.`); return false; } }
    if (step === 2 && !form.description.trim()) { setError('Add a full experience description before continuing.'); return false; }
    if (step === 3 && !snapshot.variants.length) { setError('Add at least one option before configuring rates.'); return false; }
    if (step === 4 && !snapshot.variants.some((variant) => (variant.ratePlans || []).length)) { setError('Add at least one rate plan before configuring availability.'); return false; }
    return true;
  }
  async function next() { if (locked || !validateStep(activeStep)) return; const saved = await saveDraft(); if (!saved) return; setActiveStep((step) => Math.min(6, step + 1) as WizardStep); }
  async function startRevision(sourceRevisionId?: string) { if (!snapshot.product) return; setBusy(true); setError(''); try { await api.request(`/products/${snapshot.product.id}/revisions`, { method: 'POST', body: JSON.stringify(sourceRevisionId ? { sourceRevisionId } : {}) }); await reload(snapshot.product.id); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function submit() { if (!snapshot.product || !revision || revision.status !== 'DRAFT') return; const saved = await saveDraft(); if (!saved) return; setBusy(true); try { const result = await api.request<ProductReadiness>(`/products/${snapshot.product.id}/readiness`); if (!result.ready) { setError('This experience still needs attention before it can be submitted.'); setActiveStep(6); return; } await api.request(`/product-revisions/${revision.id}/submit`, { method: 'POST' }); await reload(snapshot.product.id); onChanged(); setNotice('Submitted for review. Platform review can now publish this revision.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function close() { if (busyRef.current) return; if (dirtyRef.current && !window.confirm('You have unsaved changes. Close without saving? Your persisted draft will remain available.')) return; onDone(); }
  const completed = new Set<number>([...(snapshot.revision ? [1] : []), ...(snapshot.variants.length ? [3] : []), ...(snapshot.variants.some((variant) => (variant.ratePlans || []).length) ? [4] : [])]);
  const stepProps = { snapshot, locked, revisionForm: form, fulfilment, onRevisionChange, onFulfilmentChange: (nextValue: FulfilmentForm) => { setFulfilment(nextValue); setDirty(true); }, onRefresh: refresh, onError };
  return <div className="experience-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) void close(); }}><div ref={dialogRef} className="experience-modal" role="dialog" aria-modal="true" aria-labelledby="experience-modal-title"><header className="experience-modal-header"><div><h2 id="experience-modal-title">{snapshot.product ? 'Edit marketplace experience' : 'Create marketplace experience'}</h2><p>Build the product once; add options, rates and inventory underneath it.</p></div><button ref={closeRef} type="button" className="experience-modal-close" aria-label="Close experience wizard" onClick={() => void close()}>×</button></header>{loading ? <Loading text="Loading experience…" /> : <><div className="experience-modal-body">{error && <ErrorBox error={error} />}{notice && <div className="alert success">{notice}</div>}{rejected && !revision && <div className="alert error"><b>Revision rejected:</b> {rejected.rejectionReason || 'No reason supplied.'} <button type="button" className="link-button" onClick={() => void startRevision(rejected.id)}>Create corrected draft</button></div>}{snapshot.product && revision && revision.status !== 'DRAFT' && <div className="experience-readonly-banner"><b>{revision.status === 'UNDER_REVIEW' ? 'Under review' : revision.status === 'PUBLISHED' ? 'Published revision' : revision.status}</b><span>This revision is read-only. {revision.status === 'PUBLISHED' && 'Create a working revision to make changes.'}</span>{revision.status !== 'UNDER_REVIEW' && <button type="button" className="btn small" onClick={() => void startRevision()}>Create working revision</button>}</div>}<div className="experience-wizard"><WizardNavigation activeStep={activeStep} completed={completed} onSelect={setActiveStep} locked={false} /><main className="experience-wizard-content">{activeStep === 1 && <BasicInfoStep {...stepProps} />}{activeStep === 2 && <ExperienceStep {...stepProps} />}{activeStep === 3 && <OptionsStep {...stepProps} />}{activeStep === 4 && <RatesRulesStep {...stepProps} />}{activeStep === 5 && <AvailabilityStep {...stepProps} />}{activeStep === 6 && <ReviewSubmitStep {...stepProps} onNavigate={setActiveStep} />}</main></div></div><WizardFooter step={activeStep} busy={busy} locked={locked} onBack={() => setActiveStep((step) => Math.max(1, step - 1) as WizardStep)} onSave={() => void saveDraft()} onNext={() => void next()} onSubmit={() => void submit()} /></>}</div></div>;
}
