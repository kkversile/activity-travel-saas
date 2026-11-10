import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Product, type ProductReadiness, type ProductRevision } from '../../api';
import { ErrorBox, Loading } from '../Ui';
import ActivityPricesAvailability from './ActivityPricesAvailability';
import BasicInfoStep from './BasicInfoStep';
import ExperienceStep from './ExperienceStep';
import PhotosStep from './PhotosStep';
import OptionsStep from './OptionsStep';
import ReviewSubmitStep from './ReviewSubmitStep';
import VoucherStep from './VoucherStep';
import WizardFooter from './WizardFooter';
import WizardNavigation from './WizardNavigation';
import type { ActivityContentSettings, FulfilmentForm, RevisionForm, WizardSnapshot, WizardStep } from './types';
import { emptyFulfilmentForm, emptyRevisionForm, splitList, toFulfilmentForm, toRevisionForm, vendorProductEditPath } from './types';

type Props = { product?: Product | null; initialStep?: WizardStep; preferredRevisionId?: string | null; onDone: () => void; onChanged: () => void; fullPage?: boolean; viewOnly?: boolean; adminContext?: boolean; vendorNameOverride?: string; reviewActions?: { onPublish: () => void; onReject: () => void } };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 409 && /revision changed in another session/i.test(message)) return 'This product changed in another session. Reload the draft and review the conflicting changes before saving again.';
  if (/COMMERCIAL_VERSION_OVERLAP_REQUIRES_SPLIT|effective history|overlaps an existing bounded|same-start commercial version/i.test(message)) return 'These pricing dates overlap an existing version for this rate plan. A rate plan can have only one effective price at a time, and two versions cannot share the same start date. Choose a start date after the current version ends, or edit the existing version instead.';
  return message;
}

export function selectProductRevision(loaded: Product, preferredRevisionId?: string | null) {
  const revisions = loaded.revisions || [];
  return (preferredRevisionId && revisions.find((revision) => revision.id === preferredRevisionId))
    || revisions.find((revision) => revision.status === 'DRAFT' || revision.status === 'UNDER_REVIEW')
    || loaded.currentRevision
    || revisions.find((revision) => revision.status === 'REJECTED')
    || null;
}

export function activityContentSettingsPath(adminContext: boolean) {
  return adminContext ? '/admin/activity-content-settings' : '/vendor/activity-content-settings';
}

export function shouldPersistBeforeStepChange(hasProduct: boolean, hasUnsavedChanges: boolean) {
  return !hasProduct || hasUnsavedChanges;
}

export function productBuilderStatus(productStatus?: Product['status'], revisionStatus?: ProductRevision['status']) {
  if (productStatus === 'ARCHIVED') return { label: 'Archived', live: false, draftEdit: false, description: 'This product is archived and is not available for sale.' };
  if (revisionStatus === 'UNDER_REVIEW') {
    if (productStatus === 'LIVE') return { label: 'Live · edits in QC', live: true, draftEdit: false, description: 'This revision is with the QC team. Your current live listing remains available while it is reviewed.' };
    if (productStatus === 'SUSPENDED') return { label: 'Paused · edits in QC', live: false, draftEdit: false, description: 'This revision is with the QC team. The product remains paused while it is reviewed.' };
    return { label: 'In QC · read-only', live: false, draftEdit: false, description: 'This revision is with the QC team and is read-only while under review.' };
  }
  if (revisionStatus === 'PUBLISHED') {
    if (productStatus === 'LIVE') return { label: 'Live · published revision', live: true, draftEdit: false, description: 'This is the published revision. Create a working revision before making changes.' };
    if (productStatus === 'SUSPENDED') return { label: 'Paused · published revision', live: false, draftEdit: false, description: 'This published product is paused. Resume selling from the product list.' };
    return { label: 'Draft', live: false, draftEdit: false, description: 'Review product content, then configure rates and availability before submission.' };
  }
  if (revisionStatus === 'DRAFT' && productStatus === 'LIVE') return { label: 'Live · draft edits', live: true, draftEdit: true, description: 'Your current listing stays live while you prepare these edits for review.' };
  if (revisionStatus === 'DRAFT' && productStatus === 'SUSPENDED') return { label: 'Paused · draft edits', live: false, draftEdit: true, description: 'This product is paused while you prepare edits for review.' };
  if (productStatus === 'LIVE') return { label: 'Live', live: true, draftEdit: false, description: 'This is the live product listing.' };
  if (productStatus === 'SUSPENDED') return { label: 'Paused', live: false, draftEdit: false, description: 'This product is paused and is not available for sale.' };
  return { label: 'Draft', live: false, draftEdit: false, description: 'Review product content, then configure rates and availability before submission.' };
}

export default function ExperienceWizardModal({ product, initialStep = 1, preferredRevisionId, onDone, onChanged, fullPage = false, viewOnly = false, adminContext = false, vendorNameOverride, reviewActions }: Props) {
  const [snapshot, setSnapshot] = useState<WizardSnapshot>({ product: product || null, revision: null, variants: product?.variants || [], schedules: [] });
  const [form, setForm] = useState<RevisionForm>({ ...emptyRevisionForm });
  const [fulfilment, setFulfilment] = useState<FulfilmentForm>({ ...emptyFulfilmentForm });
  const [contentSettings, setContentSettings] = useState<ActivityContentSettings>({ terms: [], howToRedeem: [], bookingQuestions: [] });
  const unifiedInitialStep = initialStep;
  const [activeStep, setActiveStep] = useState<WizardStep>(unifiedInitialStep);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(Boolean(product?.id)); const [error, setError] = useState(''); const [dirty, setDirty] = useState(false); const [notice, setNotice] = useState(''); const [rejected, setRejected] = useState<ProductRevision | null>(null); const [pricingSaved, setPricingSaved] = useState(false); const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const closeRef = useRef<HTMLButtonElement>(null); const dialogRef = useRef<HTMLDivElement>(null); const dirtyRef = useRef(false); const busyRef = useRef(false); const reloadSequenceRef = useRef(0); const saveInFlightRef = useRef<Promise<boolean | string> | null>(null); const pricingSaveRef = useRef<(() => Promise<boolean>) | null>(null);

  async function reload(id: string, preserveEditor = false) {
    const sequence = ++reloadSequenceRef.current;
    setLoading(true); setError('');
    try {
      const loaded = await api.request<Product>(`/products/${id}`);
      if (sequence !== reloadSequenceRef.current) return;
      const working = selectProductRevision(loaded, preferredRevisionId);
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
        const prototype = (revisionWithQuestions?.sourcePayload?.prototype || {}) as Record<string, unknown>;
        const existing = new Set<number>();
        if (revisionWithQuestions && [revisionWithQuestions.productName, revisionWithQuestions.type, revisionWithQuestions.subType, revisionWithQuestions.category, revisionWithQuestions.cityName, revisionWithQuestions.stateName, revisionWithQuestions.countryName, revisionWithQuestions.meetingModel].every((value) => String(value || '').trim())) existing.add(1);
        if (revisionWithQuestions?.shortDescription?.trim() && revisionWithQuestions.description?.trim()) existing.add(2);
        if ((revisionWithQuestions?.media || []).length) existing.add(3);
        if ((loaded.variants || []).length) existing.add(4);
        if ((loaded.variants || []).some((variant) => (variant.ratePlans || []).length)) existing.add(5);
        if (prototype.voucherCodeSource || prototype.voucherAcceptedAs || prototype.voucherInstructions) existing.add(8);
        setCompletedSteps(existing);
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
  useEffect(() => { setActiveStep(initialStep); if (product?.id) void reload(product.id); else { closeRef.current?.focus(); } }, [product?.id, initialStep, preferredRevisionId]);
  useEffect(() => { if (!viewOnly) void api.request<ActivityContentSettings>(activityContentSettingsPath(adminContext)).then(setContentSettings).catch(() => undefined); }, [viewOnly, adminContext]);
  useEffect(() => {
    if (!contentSettings.terms.length && !contentSettings.howToRedeem.length) return;
    setForm((current) => ({ ...current, terms: current.terms.trim() || contentSettings.terms.join(', '), howToRedeem: current.howToRedeem.trim() || contentSettings.howToRedeem.join(', ') }));
  }, [contentSettings, snapshot.revision?.id]);
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

  const revision = snapshot.revision; const locked = viewOnly || Boolean(revision && revision.status !== 'DRAFT'); const adminEdit = (revision?.sourcePayload as any)?.adminEdit as { editedByAdmin?: boolean; lastEditedByName?: string; lastEditedAt?: string } | undefined; const publishDirectly = adminContext && (revision?.sourcePayload as any)?.admin?.approvalMode === 'PUBLISH_DIRECTLY';
  const onError = useCallback((message: string) => { setError(`Not saved — ${errorMessage(message)}`); setNotice(''); }, []);
  const onRevisionChange = <K extends keyof RevisionForm>(key: K, value: RevisionForm[K]) => { setForm((old) => ({ ...old, [key]: value })); setDirty(true); setNotice(''); };
  async function refresh() { if (snapshot.product?.id) await reload(snapshot.product.id, dirtyRef.current); }
  function revisionPayload() {
    const mode = fulfilment.mode; const evidence = mode === 'AUTO' ? [] : mode === 'PNR_ONLY' ? ['PNR_REFERENCE'] : mode === 'TICKET_QR' ? (fulfilment.requiredEvidenceKinds.filter((kind) => ['TICKET_FILE', 'QR_TOKEN'].includes(kind)).length ? fulfilment.requiredEvidenceKinds.filter((kind) => ['TICKET_FILE', 'QR_TOKEN'].includes(kind)) : ['TICKET_FILE']) : fulfilment.requiredEvidenceKinds;
    const sourcePayload: Record<string, unknown> = {
      ...(snapshot.revision?.sourcePayload || {}),
      hasDifferentialVisitorPricing: form.hasDifferentialVisitorPricing,
      prototype: { durationValue: form.durationValue, durationUnit: form.durationUnit, guideIncluded: form.guideIncluded, guideLanguages: form.guideLanguages, included: form.included, notIncluded: form.notIncluded, endPoint: form.endPoint, thingsToKnow: form.thingsToKnow, accessibility: form.accessibility, followItinerary: form.followItinerary, subCategories: form.subCategories, voucherCodeSource: form.voucherCodeSource, voucherAcceptedAs: form.voucherAcceptedAs, voucherInstructions: form.voucherInstructions, cancellationPreset: form.cancellationPreset, travellerDetails: form.travellerDetails, amendmentPolicy: form.amendmentPolicy },
    };
    if (adminContext) {
      const priorAdmin = sourcePayload.admin && typeof sourcePayload.admin === 'object' ? sourcePayload.admin as Record<string, unknown> : {};
      sourcePayload.admin = { ...priorAdmin, channels: form.channels, rankingBoost: form.adminRankingBoost };
    }
    return { productName: form.productName.trim(), type: form.type, subType: form.subType.trim(), category: form.category.trim() || undefined, subCategory: form.subCategories.join(', ') || form.subCategory.trim() || undefined, shortDescription: form.shortDescription.trim() || undefined, metaname: form.metaname.trim() || undefined, description: form.description, highlights: splitList(form.highlights), channels: form.channels, terms: splitList(form.terms), importantInfo: splitList(form.importantInfo), thingsToCarry: splitList(form.thingsToCarry), safetyMeasures: splitList(form.safetyMeasures), additionalInfo: splitList(form.additionalInfo), howToRedeem: splitList(form.howToRedeem), labels: splitList(form.labels), cityName: form.cityName.trim(), stateName: form.stateName.trim(), countryName: form.countryName.trim(), address: form.address.trim() || undefined, lat: form.lat ? Number(form.lat) : undefined, lon: form.lon ? Number(form.lon) : undefined, meetingModel: form.meetingModel || undefined, meetingPoint: form.meetingPoint.trim() || undefined, durationValue: form.durationValue || undefined, durationUnit: form.durationUnit || undefined, guideIncluded: form.guideIncluded || undefined, guideLanguages: splitList(form.guideLanguages), included: splitList(form.included), notIncluded: splitList(form.notIncluded), endPoint: form.endPoint || undefined, thingsToKnow: form.thingsToKnow || undefined, accessibility: splitList(form.accessibility), followItinerary: form.followItinerary, voucherCodeSource: form.voucherCodeSource || undefined, voucherAcceptedAs: form.voucherAcceptedAs || undefined, voucherInstructions: form.voucherInstructions || undefined, cancellationPreset: form.cancellationPreset || undefined, travellerDetails: form.travellerDetails || undefined, amendmentPolicy: form.amendmentPolicy || undefined, sourcePayload, fulfilmentPolicy: mode ? { ...fulfilment, reviewRequired: fulfilment.reviewRequired, requiredEvidenceKinds: evidence, evidenceMatchMode: mode === 'PNR_ONLY' ? 'ALL' : mode === 'TICKET_QR' ? 'ANY' : fulfilment.evidenceMatchMode, voucherNotes: splitList(fulfilment.voucherNotes) } : undefined };
  }
  async function saveDraft(): Promise<boolean | string> {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const operation = (async () => {
      if (locked) return false;
      if (!form.productName.trim() || !form.type || !form.subType.trim()) { setError('Add a product name, product type, and sub-type before saving the draft.'); setActiveStep(1); return false; }
      setBusy(true); setError(''); setNotice('');
      try {
        if (!snapshot.product) {
          const payload = revisionPayload();
          const created = await api.request<Product>('/products/drafts', { method: 'POST', body: JSON.stringify({ ...payload, currency: form.currency, sourcePayload: payload.sourcePayload }) });
          // A full-page create flow must become a stable edit route after the
          // first save. Without this, refreshing /vendor/products/new starts a
          // second blank draft even though the original draft was persisted.
          if (fullPage && created.id) window.history.replaceState({}, '', vendorProductEditPath(created.id));
          await reload(created.id); onChanged(); setNotice('Draft saved successfully.'); return created.id;
        } else if (revision?.status === 'DRAFT' && (dirty || !revision.meetingModel || (!revision.terms?.length && Boolean(form.terms.trim())) || (!revision.howToRedeem?.length && Boolean(form.howToRedeem.trim())))) {
          await api.request(`/product-revisions/${revision.id}`, { method: 'PATCH', body: JSON.stringify(revisionPayload()) });
           if (form.address.trim() || form.lat || form.lon || form.meetingPoint.trim()) {
             const locationPath = adminContext ? `/admin/product-revisions/${revision.id}/location` : '/vendor/locations/verify';
             const locationBody = { ...(adminContext ? {} : { productRevisionId: revision.id }), address: form.address.trim(), lat: form.lat || undefined, lon: form.lon || undefined, meetingPoint: form.meetingPoint.trim(), provider: form.address.trim() ? 'MAP_SEARCH' : undefined };
             await api.request(locationPath, { method: adminContext ? 'PUT' : 'POST', body: JSON.stringify(locationBody) });
           }
          if (form.currency !== snapshot.product.currency) await api.request(`/products/${snapshot.product.id}/currency`, { method: 'PATCH', body: JSON.stringify({ currency: form.currency }) });
          onChanged();
        }
        setDirty(false); setNotice('Draft saved successfully.');
        return true;
      } catch (e) {
        setError(`Not saved — ${errorMessage(e)}`);
        return false;
      } finally {
        setBusy(false);
      }
    })();
    saveInFlightRef.current = operation;
    try { return await operation; } finally { if (saveInFlightRef.current === operation) saveInFlightRef.current = null; }
  }
  function validateStep(step: WizardStep) {
    if (step === 1) { const missing = [['product name', form.productName], ['product type', form.type], ['sub-type', form.subType], ['category', form.category], ['city', form.cityName], ['state / region', form.stateName], ['country', form.countryName], ['meeting model', form.meetingModel]].filter(([, value]) => !String(value || '').trim()).map(([label]) => label); if (missing.length) { setError(`Complete the required basic information: ${missing.join(', ')}.`); return false; } }
    if (step === 2) {
      const highlights = splitList(form.highlights);
      const missing = [['short summary', form.shortDescription], ['full description', form.description], ["what's included", form.included], ["what's not included", form.notIncluded], ['pickup / meeting point', form.meetingPoint], ['end point', form.endPoint]].filter(([, value]) => !String(value || '').trim()).map(([label]) => label);
      if (missing.length) { setError(`Complete the required content fields: ${missing.join(', ')}.`); return false; }
      if (highlights.length < 3 || highlights.length > 6) { setError('Add between 3 and 6 highlights before continuing.'); return false; }
    }
    if (step === 3 && !snapshot.revision?.media?.some((media) => media.kind === 'IMAGE')) { setError('Add at least one qualifying image before continuing.'); return false; }
    if (step === 4 && !snapshot.variants.length) { setError('Add at least one option before configuring rates.'); return false; }
    if ((step === 5 || step === 6 || step === 7) && !snapshot.variants.length) { setError('Add at least one option before continuing.'); return false; }
    if (step === 7 && !form.cancellationPreset) { setError('Choose a cancellation policy before continuing.'); return false; }
    if (step === 8 && (!form.voucherCodeSource || !form.voucherAcceptedAs || !form.voucherInstructions.trim())) { setError('Complete the voucher source, accepted format, and redemption instructions before continuing.'); return false; }
    return true;
  }
  async function next() { if (locked || !validateStep(activeStep)) return; const saved = (activeStep === 5 || activeStep === 6 || activeStep === 7) && pricingSaveRef.current ? await pricingSaveRef.current() : await saveDraft(); if (!saved) return; setCompletedSteps((current) => new Set(current).add(activeStep)); setActiveStep((step) => Math.min(9, step + 1) as WizardStep); }
  async function selectStep(step: WizardStep) {
    if (step === activeStep) return;
    if (!locked && step > activeStep) {
      if (!snapshot.product && !validateStep(1)) { setActiveStep(1); return; }
      if (shouldPersistBeforeStepChange(Boolean(snapshot.product), dirty)) {
        const saved = (activeStep === 5 || activeStep === 6 || activeStep === 7) && pricingSaveRef.current
          ? await pricingSaveRef.current()
          : await saveDraft();
        if (!saved) return;
      }
    }
    setActiveStep(step);
  }
  async function startRevision(sourceRevisionId?: string) { if (viewOnly || !snapshot.product) return; setBusy(true); setError(''); try { await api.request(`/products/${snapshot.product.id}/revisions`, { method: 'POST', body: JSON.stringify(sourceRevisionId ? { sourceRevisionId } : {}) }); await reload(snapshot.product.id); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function submit() { if (!snapshot.product || !revision || revision.status !== 'DRAFT') return; const saved = await saveDraft(); if (!saved) return; setBusy(true); try { const result = await api.request<ProductReadiness>(`/products/${snapshot.product.id}/readiness`); if (!result.ready) { setError('This experience still needs attention before it can be submitted.'); setActiveStep(9); return; } const submitted = await api.request<{ status?: string }>(`/product-revisions/${revision.id}/submit`, { method: 'POST' }); await reload(snapshot.product.id); onChanged(); setNotice(submitted.status === 'PUBLISHED' ? 'Published directly and is now live.' : 'Submitted for review. Platform review can now publish this revision.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function close() { if (busyRef.current) return; if (dirtyRef.current && !window.confirm('You have unsaved changes. Close without saving? Your persisted draft will remain available.')) return; onDone(); }
  const completed = new Set<number>(completedSteps);
  if (pricingSaved || snapshot.variants.some((variant) => (variant.ratePlans || []).length)) completed.add(5);
  const contentScore = Math.min(100, Math.round((completed.size / 8) * 100));
  const stepProps = { snapshot, locked, adminContext, viewOnly, vendorNameOverride, revisionForm: form, fulfilment, contentSettings, onSaveDraft: async () => Boolean(await saveDraft()), onSaveDraftWithId: saveDraft, onRegisterPricingSave: (handler: (() => Promise<boolean>) | null) => { pricingSaveRef.current = handler; }, onRevisionChange, onFulfilmentChange: (nextValue: FulfilmentForm) => { setFulfilment(nextValue); setDirty(true); setError(''); setNotice(''); }, onRefresh: refresh, onError, onPricingDirty: () => { setDirty(true); setError(''); setNotice(''); }, onPricingSaved: () => { setPricingSaved(true); setDirty(false); setError(''); setNotice('Draft saved successfully. Pricing and availability saved.'); } };
  // Keep the navigation wording identical to the Partner Hub prototype.
  const unifiedLabels = ['Basics', 'Content & itinerary', 'Photos', 'Options & tickets', 'Rates', 'Availability', 'Policies', 'Voucher', 'Review & submit'];
  async function saveActiveStep() { const saved = (activeStep === 5 || activeStep === 6 || activeStep === 7) && pricingSaveRef.current ? await pricingSaveRef.current() : await saveDraft(); if (saved) setCompletedSteps((current) => new Set(current).add(activeStep)); }
  const needsPhotoBeforeNext = activeStep === 3 && !snapshot.revision?.media?.some((media) => media.kind === 'IMAGE');
  const footer = viewOnly && reviewActions ? <footer className="experience-step-footer"><div><button type="button" className="btn" onClick={() => void close()}>Close</button></div><div className="experience-footer-actions"><button type="button" className="btn" onClick={reviewActions.onReject}>Reject</button><button type="button" className="btn primary" onClick={reviewActions.onPublish}>Publish</button></div></footer> : viewOnly ? <footer className="experience-step-footer"><div><button type="button" className="btn" onClick={() => void close()}>Close</button></div></footer> : <WizardFooter step={activeStep} busy={busy} locked={locked} totalSteps={9} submitLabel={publishDirectly ? 'Publish directly' : 'Submit for QC'} nextLabels={['Content & itinerary', 'Photos', 'Options & tickets', 'Rates', 'Availability', 'Policies', 'Voucher', 'Review & submit']} nextDisabled={needsPhotoBeforeNext} nextHintId={needsPhotoBeforeNext ? 'photo-step-next-hint' : undefined} onBack={() => setActiveStep((step) => Math.max(1, step - 1) as WizardStep)} onSave={saveActiveStep} onNext={() => void next()} onSubmit={() => void submit()} />;
  const status = productBuilderStatus(snapshot.product?.status, revision?.status);
  const pageHeader = fullPage && !loading ? <div className="partner-product-builder-header"><div><div className="partner-product-builder-crumb">Products / {snapshot.product ? 'Edit product' : 'New product'}{snapshot.product?.productCode ? ` · ${snapshot.product.productCode}` : ''}</div><h1>{form.productName || (snapshot.product ? 'Edit marketplace experience' : 'Create marketplace experience')}</h1><p>{snapshot.product ? status.description : 'Add the activity once, then configure pricing and availability as separate steps.'}</p></div><div className="partner-product-builder-header-actions"><span className={`partner-product-builder-status ${status.live ? 'live' : ''}`}><span className="partner-product-builder-status-dot" />{status.label}</span><button type="button" className="btn" onClick={() => void saveActiveStep()} disabled={busy || locked}>Save draft</button></div></div> : null;
  const adminEditorClass = adminContext && !fullPage ? ' admin-product-editor' : '';
  const frame = <div ref={dialogRef} className={fullPage ? 'partner-editor-card' : `experience-modal${adminEditorClass}${viewOnly && vendorNameOverride ? ' partner-editor-frame partner-editor-card admin-product-view' : ''}`} {...(fullPage ? { 'aria-labelledby': 'experience-modal-title' } : { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'experience-modal-title' })}><header className="experience-modal-header"><div><h2 id="experience-modal-title">{snapshot.product ? (viewOnly ? (form.productName || 'View marketplace experience') : 'Edit marketplace experience') : 'Create marketplace experience'}</h2><p>{viewOnly ? [vendorNameOverride, snapshot.product?.publicCode || snapshot.product?.productCode, 'Read-only product details'].filter(Boolean).join(' · ') : 'Add the activity once, then configure pricing and availability as separate steps.'}</p></div><button ref={closeRef} type="button" className="experience-modal-close" aria-label="Close experience wizard" onClick={() => void close()}>×</button></header>{loading ? <Loading text="Loading experience…" /> : <><div className="experience-modal-body">{error && <ErrorBox error={error} />}{notice && <div className="alert success">{notice}</div>}{!adminContext && adminEdit?.editedByAdmin && <div className="alert info" role="status">Updated by {adminEdit.lastEditedByName || 'Voya Admin'}{adminEdit.lastEditedAt ? ` · ${new Date(adminEdit.lastEditedAt).toLocaleString()}` : ''}. Please review the latest activity details.</div>}{rejected && !revision && <div className="alert error"><b>Revision rejected:</b> {rejected.rejectionReason || 'No reason supplied.'} <button type="button" className="link-button" onClick={() => void startRevision(rejected.id)}>Create corrected draft</button></div>}{snapshot.product && revision && revision.status !== 'DRAFT' && <div className="experience-readonly-banner"><b>{revision.status === 'UNDER_REVIEW' ? 'Under review' : revision.status === 'PUBLISHED' ? 'Published revision' : revision.status}</b><span>This revision is read-only. {revision.status === 'PUBLISHED' && 'Create a working revision to make changes.'}</span>{revision.status !== 'UNDER_REVIEW' && !viewOnly && <button type="button" className="btn small" onClick={() => void startRevision()}>Create working revision</button>}</div>}<div className="experience-wizard"><WizardNavigation activeStep={activeStep} completed={completed} onSelect={selectStep} locked={false} labels={unifiedLabels} score={contentScore} /><main className="experience-wizard-content"><>{activeStep === 1 && <BasicInfoStep {...stepProps} />}{activeStep === 2 && <ExperienceStep {...stepProps} />}{activeStep === 3 && <PhotosStep {...stepProps} />}{activeStep === 4 && <OptionsStep {...stepProps} />}{activeStep === 5 && <ActivityPricesAvailability {...stepProps} section="pricing" />}{activeStep === 6 && <ActivityPricesAvailability {...stepProps} section="availability" />}{activeStep === 7 && <ActivityPricesAvailability {...stepProps} section="policies" />}{activeStep === 8 && <VoucherStep {...stepProps} />}{activeStep === 9 && <ReviewSubmitStep {...stepProps} onNavigate={selectStep} />}</>{fullPage && footer}</main></div></div>{!fullPage && footer}</>}</div>;
  return fullPage ? <div className="partner-editor-frame">{pageHeader}{frame}</div> : <div className="experience-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) void close(); }}>{frame}</div>;
}
