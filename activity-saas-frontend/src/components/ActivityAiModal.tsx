import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { ErrorBox } from './Ui';
import { parseProductJson, type ImportIssue } from './product-import/productImport';

type Row = Record<string, any>;
type Draft = { Basic_Info?: Row[]; Experience?: Row[]; Options?: Row[]; [key: string]: any };
type Result = { generationId: string; draft: Draft; missingSupplierData: string[]; warnings: string[]; model: string; requiresVerification?: string[]; provenance?: Record<string, unknown> };
type Phase = 'IDLE' | 'GENERATING' | 'GENERATED' | 'REVIEWING' | 'INCOMPLETE' | 'READY_TO_IMPORT' | 'IMPORTING' | 'DRAFT_SAVED' | 'ERROR';
type ReviewField = { key: string; section: 'basic' | 'experience'; source: string; label: string; list?: boolean };

const fields: ReviewField[] = [
  { key: 'short_description', section: 'basic', source: 'short_description', label: 'Short description' },
  { key: 'description', section: 'experience', source: 'full_description', label: 'Description' },
  { key: 'highlights', section: 'experience', source: 'highlights', label: 'Highlights', list: true },
  { key: 'important_information', section: 'experience', source: 'important_information', label: 'Important information', list: true },
  { key: 'things_to_carry', section: 'experience', source: 'things_to_carry', label: 'Things to carry', list: true },
  { key: 'safety_measures', section: 'experience', source: 'safety_measures', label: 'Safety measures', list: true },
  { key: 'terms', section: 'experience', source: 'terms', label: 'Terms', list: true },
  { key: 'how_to_redeem', section: 'experience', source: 'how_to_redeem', label: 'How to redeem', list: true },
  { key: 'additional_information', section: 'experience', source: 'additional_information', label: 'Additional information', list: true },
];

function displayValue(value: unknown) { return Array.isArray(value) ? value.join('\n') : String(value || ''); }
function listValue(value: string) { return value.split(/\n|\|/).map((item) => item.trim()).filter(Boolean); }
function isHttpsUrl(value: unknown): value is string {
  try { return new URL(String(value)).protocol === 'https:'; } catch { return false; }
}
function AiMediaPreview({ media }: { media: Row }) {
  const [failed, setFailed] = useState(false);
  return <article className="activity-ai-media-card">
    {failed ? <div className="activity-ai-media-fallback" role="img" aria-label="Image preview unavailable">Image preview unavailable</div> : <img src={media.url} alt={media.description || 'AI-suggested activity image'} loading="lazy" onError={() => setFailed(true)} />}
    <div className="activity-ai-media-copy"><b>{media.description || 'Suggested activity image'}</b><a href={media.source_url || media.url} target="_blank" rel="noreferrer">Open source</a><small>Verify accuracy, usage rights, and image quality before adding it in the main wizard.</small></div>
  </article>;
}
function draftWithSelectedFields(base: Draft, incoming: Draft, selected: Set<string>) {
  const next: Draft = { ...base, Basic_Info: [{ ...(base.Basic_Info?.[0] || {}) }], Experience: [{ ...(base.Experience?.[0] || {}) }] };
  for (const field of fields) {
    if (!selected.has(field.key)) continue;
    const sourceRow = field.section === 'basic' ? incoming.Basic_Info?.[0] : incoming.Experience?.[0];
    const targetRow = field.section === 'basic' ? next.Basic_Info![0] : next.Experience![0];
    if (sourceRow && sourceRow[field.source] !== undefined) targetRow[field.source] = sourceRow[field.source];
  }
  return next;
}

export default function ActivityAiModal({ onClose, onSaved }: { onClose: () => void; onSaved: (productId: string) => void }) {
  const [form, setForm] = useState({ activityName: '', city: '', state: '', country: 'India', category: '', vendorNotes: '' });
  const [result, setResult] = useState<Result | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [acceptedOptions, setAcceptedOptions] = useState<Record<number, boolean>>({});
  const [regenerateFields, setRegenerateFields] = useState<Record<string, boolean>>({});
  const [modifiedFields, setModifiedFields] = useState<Record<string, boolean>>({});
  const [newOptionCode, setNewOptionCode] = useState('');
  const [newOptionName, setNewOptionName] = useState('');
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIssues, setPreviewIssues] = useState<ImportIssue[]>([]);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const busy = phase === 'GENERATING' || phase === 'IMPORTING';
  useEffect(() => () => controllerRef.current?.abort(), []);
  function close() { controllerRef.current?.abort(); onClose(); }
  function update(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }

  async function generate(selectedKeys: string[] = [], merge = false) {
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    setPhase('GENERATING'); setError('');
    try {
      const response = await api.request<Result>('/activity-ai/generate', { method: 'POST', signal: controller.signal, body: JSON.stringify({ ...form, mode: merge ? 'REFRESH_DESCRIPTION' : 'FILL_MISSING', selectedFields: selectedKeys }) });
      if (merge && result) {
        const selected = new Set(selectedKeys); const merged = draftWithSelectedFields(result.draft, response.draft, selected);
        setResult({ ...result, draft: merged, model: response.model, warnings: response.warnings, missingSupplierData: response.missingSupplierData });
        setValues((current) => { const next = { ...current }; for (const field of fields) if (selected.has(field.key)) { const row = field.section === 'basic' ? response.draft.Basic_Info?.[0] : response.draft.Experience?.[0]; next[field.key] = displayValue(row?.[field.source]); } return next; });
      } else {
        const basic = response.draft.Basic_Info?.[0] || {}; const experience = response.draft.Experience?.[0] || {};
        setResult(response); setValues(Object.fromEntries(fields.map((field) => [field.key, displayValue((field.section === 'basic' ? basic : experience)[field.source])] ))); setAccepted({}); setAcceptedOptions({}); setRegenerateFields({}); setModifiedFields({});
      }
      setPhase('GENERATED');
    } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; setPhase('ERROR'); setError(e instanceof Error ? e.message : String(e)); }
  }

  const selectedCount = Object.values(accepted).filter(Boolean).length + Object.values(acceptedOptions).filter(Boolean).length;
  const hasDescription = Boolean(accepted.description && values.description?.trim()); const optionCount = result?.draft.Options?.length || 0;
  const verification = useMemo(() => result?.requiresVerification || [], [result]);
  const location = result?.draft.Basic_Info?.[0] || {};
  const hasVerifiedLocation = Boolean(location.address || location.meeting_point || location.latitude || location.longitude);
  const mediaSuggestions = useMemo(() => (result?.draft.Media || []).filter((media: Row) => media?.kind === 'IMAGE' && isHttpsUrl(media.url)).slice(0, 8), [result]);
  function reviewedDraft() {
    if (!result) return null; const basic: Row = { ...(result.draft.Basic_Info?.[0] || {}) }; const experience: Row = { ...(result.draft.Experience?.[0] || {}) };
    for (const field of fields) { const target = field.section === 'basic' ? basic : experience; if (accepted[field.key]) target[field.source] = field.list ? listValue(values[field.key] || '') : (values[field.key] || '').trim(); else delete target[field.source]; }
    const safeDraft = { ...result.draft }; delete safeDraft.Rate_Plans; delete safeDraft.Availability;
    return { ...safeDraft, Basic_Info: [basic], Experience: [experience], Options: (result.draft.Options || []).filter((_, index) => acceptedOptions[index]) };
  }
  function addConfirmedOption() {
    if (!result || !newOptionCode.trim() || !newOptionName.trim()) return;
    const code = newOptionCode.trim().toUpperCase(); const name = newOptionName.trim(); const productKey = result.draft.Basic_Info?.[0]?.product_key || result.generationId;
    if ((result.draft.Options || []).some((option) => option.option_code === code)) return;
    const option = { product_key: productKey, option_code: code, option_name: name, description: 'Supplier-confirmed option.' };
    setResult((current) => current ? { ...current, draft: { ...current.draft, Options: [...(current.draft.Options || []), option] } } : current);
    setAcceptedOptions((current) => ({ ...current, [result.draft.Options?.length || 0]: true }));
    setNewOptionCode(''); setNewOptionName('');
  }
  function downloadDraft() {
    const draft = reviewedDraft(); if (!draft) return; const blob = new Blob([JSON.stringify({ README: ['VOYA AI draft export', 'This file contains descriptive content and options only. Add prices, rate plans, availability and other supplier-owned data in the main VOYA product wizard.'], ...draft }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${form.activityName.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'voya-ai-draft'}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function toggleImportPreview() {
    if (!previewOpen) {
      const draft = reviewedDraft();
      setPreviewIssues(parseProductJson(JSON.stringify(draft || {})).issues);
    }
    setPreviewOpen((current) => !current);
  }
  function acceptAllSuggestions() {
    setAccepted(Object.fromEntries(fields.map((field) => [field.key, true])));
    setAcceptedOptions(Object.fromEntries((result?.draft.Options || []).map((_, index) => [index, true])));
    setPhase('REVIEWING');
  }
  async function saveDraft() {
    const draft = reviewedDraft(); if (!result || !draft || !hasDescription) return; setPhase('INCOMPLETE'); setError(''); setPhase('IMPORTING');
    try { const response = await api.request<{ productId: string }>('/activity-ai/save-draft', { method: 'POST', body: JSON.stringify({ generationId: result.generationId, draft, provenance: result.provenance, acceptedChanges: [], acceptedFields: Object.keys(accepted).filter((key) => accepted[key]), rejectedFields: fields.map((field) => field.key).filter((key) => !accepted[key]), modifiedFields: Object.keys(modifiedFields).filter((key) => modifiedFields[key]) }) }); setPhase('DRAFT_SAVED'); onSaved(response.productId); }
    catch (e) { setPhase('ERROR'); setError(e instanceof Error ? e.message : String(e)); }
  }
  function startOver() { controllerRef.current?.abort(); setResult(null); setPhase('IDLE'); setAccepted({}); setAcceptedOptions({}); setRegenerateFields({}); setModifiedFields({}); setValues({}); setError(''); }

  return <div className="modal-backdrop" role="presentation"><div className="modal-card activity-ai-modal" role="dialog" aria-modal="true" aria-labelledby="activity-ai-title">
    <div className="modal-header"><div><h2 id="activity-ai-title">Create activity with AI</h2><p>Generate descriptive content and options. Enter prices, rate plans and availability in the main product wizard.</p></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></div>
    {error && <ErrorBox error={error} />}{phase === 'GENERATING' && <div className="activity-ai-notice" role="status">Generating a reviewable draft…</div>}
    {!result ? <div className="activity-ai-form"><label>Activity name *<input aria-label="Activity name" value={form.activityName} onChange={(e) => update('activityName', e.target.value)} placeholder="e.g. Dream Land Fun and Adventure" /></label><div className="activity-ai-grid"><label>City<input aria-label="City" value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Munnar" /></label><label>State<input aria-label="State" value={form.state} onChange={(e) => update('state', e.target.value)} placeholder="Kerala" /></label><label>Country<input aria-label="Country" value={form.country} onChange={(e) => update('country', e.target.value)} placeholder="India" /></label><label>Category<input aria-label="Category" value={form.category} onChange={(e) => update('category', e.target.value)} placeholder="Adventure park" /></label></div><label>Describe the experience <span className="muted">(optional)</span><textarea aria-label="Supplier notes" value={form.vendorNotes} onChange={(e) => update('vendorNotes', e.target.value)} placeholder="Describe only facts the supplier can verify." /></label><div className="activity-ai-actions"><button className="btn" onClick={close}>Cancel</button><button className="btn accent" disabled={busy || !form.activityName.trim()} onClick={() => void generate()}>{busy ? 'Generating…' : 'Generate draft'}</button></div></div> : <div className="activity-ai-review">
      <div className="activity-ai-notice">{phase === 'GENERATED' ? 'Draft ready for review.' : 'Review in progress.'} AI draft generated with <b>{result.model}</b>. Nothing is accepted automatically. Select the fields and options you confirm.</div><p className="muted">Review each suggestion, edit it if needed, then accept it. Select fields for regeneration only when you want a new suggestion; accepted manual edits are preserved.</p>
      {fields.map((field) => <div className="activity-ai-review-field" key={field.key}><div className="activity-ai-field-heading"><label className="activity-ai-accept"><input type="checkbox" checked={Boolean(accepted[field.key])} onChange={(e) => { setAccepted((current) => ({ ...current, [field.key]: e.target.checked })); setPhase('REVIEWING'); }} /> Accept {field.label}</label><label className="activity-ai-regenerate"><input type="checkbox" checked={Boolean(regenerateFields[field.key])} onChange={(e) => setRegenerateFields((current) => ({ ...current, [field.key]: e.target.checked }))} /> Regenerate</label></div><textarea aria-label={field.label} value={values[field.key] || ''} onChange={(e) => { setValues((current) => ({ ...current, [field.key]: e.target.value })); setModifiedFields((current) => ({ ...current, [field.key]: true })); setPhase('REVIEWING'); }} placeholder={`Suggested ${field.label.toLowerCase()}`} /></div>)}
      <div className="activity-ai-section"><h3>Location found by AI</h3>{hasVerifiedLocation ? <><p><b>Meeting point:</b> {location.meeting_point || 'Not provided'}</p><p><b>Address:</b> {location.address || 'Not provided'}</p>{(location.latitude || location.longitude) && <p><b>Coordinates:</b> {location.latitude || '—'}, {location.longitude || '—'}</p>}<p className="muted">Verify this location in the main wizard before publishing.</p></> : <p className="muted">No verified exact address was found in the researched sources. Search for the meeting point in the main wizard to fill the address and map coordinates.</p>}</div>
      <div className="activity-ai-section"><div className="activity-ai-section-heading"><h3>Suggested images</h3><span className="muted">Included when you save this draft</span></div>{mediaSuggestions.length ? <><p className="muted">These reviewed image suggestions will be added to the draft Media section. Verify supplier rights and image accuracy before publishing.</p><div className="activity-ai-media-grid">{mediaSuggestions.map((media: Row, index: number) => <AiMediaPreview media={media} key={`${media.url}-${index}`} />)}</div></> : <p className="muted">No verified direct image URLs were found. Add images manually in the main product wizard after confirming supplier rights.</p>}</div>
      <div className="activity-ai-section"><div className="activity-ai-section-heading"><h3>Suggested options</h3><button className="btn small" onClick={acceptAllSuggestions}>Accept all</button></div>{optionCount ? result.draft.Options?.map((option, index) => <label className="activity-ai-option" key={`${option.option_code || 'option'}-${index}`}><input type="checkbox" checked={Boolean(acceptedOptions[index])} onChange={(e) => setAcceptedOptions((current) => ({ ...current, [index]: e.target.checked }))} /><span><b>{option.option_name || 'Suggested option'}</b><small>{option.description || 'Supplier must verify this option before selling.'}</small></span></label>) : <p>No options were suggested. Add a confirmed supplier option below.</p>}<div className="activity-ai-add-option"><label>Option code<input aria-label="Confirmed option code" value={newOptionCode} onChange={(e) => setNewOptionCode(e.target.value)} placeholder="STANDARD" /></label><label>Option name<input aria-label="Confirmed option name" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)} placeholder="Standard entry" /></label><button className="btn" onClick={addConfirmedOption} disabled={!newOptionCode.trim() || !newOptionName.trim()}>Add confirmed option</button></div></div>
      <div className="activity-ai-section"><h3>Next step in the product wizard</h3><p className="muted">AI does not enter commercial or operational data. After you save this review, the main wizard opens so you can complete meeting details, prices, rate plans, availability, fulfilment and final review.</p>{result.missingSupplierData.length > 0 && <p className="muted">Supplier confirmation still needed: {result.missingSupplierData.join(' · ')}</p>}{verification.length > 0 && <p className="muted">Verify in the wizard: {verification.join(' · ')}</p>}<button className="btn small" onClick={toggleImportPreview}>{previewOpen ? 'Hide draft structure preview' : 'Preview draft structure'}</button>{previewOpen && <div className="activity-ai-preview"><b>Existing import preview</b><p className="muted">This reuses the standard import parser. Commercial and operational sections stay empty here and are completed in the main wizard.</p>{previewIssues.length ? <ul>{previewIssues.slice(0, 8).map((issue, index) => <li key={`${issue.sheet}-${issue.row}-${index}`}>{issue.sheet}: {issue.message}</li>)}</ul> : <p>Draft structure is import-ready.</p>}</div>}</div>
      <div className="activity-ai-actions"><span className="muted">{selectedCount} accepted · unselected suggestions are rejected</span><button className="btn" onClick={startOver}>Start over</button><button className="btn" onClick={() => void generate(Object.keys(regenerateFields).filter((key) => regenerateFields[key]), true)} disabled={busy || !Object.values(regenerateFields).some(Boolean)}>Regenerate selected</button><button className="btn" onClick={downloadDraft}>Download JSON draft</button><button className="btn accent" disabled={busy || !hasDescription} onClick={() => void saveDraft()}>{phase === 'IMPORTING' ? 'Saving…' : phase === 'DRAFT_SAVED' ? 'Draft saved' : 'Save draft & open product wizard'}</button></div>
    </div>}
  </div></div>;
}
