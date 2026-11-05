import { useRef, useState } from 'react';
import { api, type ProductVariant } from '../../api';
import { Badge, Field } from '../Ui';
import type { VariantForm, WizardStepProps } from './types';
import { emptyVariantForm, splitList, toVariantForm } from './types';

function payload(form: VariantForm) {
  return {
    variantCode: form.variantCode.trim(), name: form.name.trim(), description: form.description.trim() || undefined,
    durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
    minPax: Number(form.minPax), maxPax: Number(form.maxPax),
    // The prototype asks the supplier for hours. The API/database keep the
    // operational value in minutes so booking eligibility remains unchanged.
    cutOffMinutes: Math.round(Number(form.cutOffMinutes || 0) * 60),
    privateShared: form.privateShared || undefined, vehicleType: form.vehicleType.trim() || undefined,
    pickupIncluded: form.pickupIncluded, pickupType: form.pickupIncluded ? form.pickupType.trim() || undefined : undefined,
    pickupInput: form.pickupIncluded ? form.pickupInput.trim() || undefined : undefined,
    pickupTimings: form.pickupIncluded ? form.pickupTimings.trim() || undefined : undefined,
    dropoffIncluded: form.dropoffIncluded, dropoffTimings: form.dropoffIncluded ? form.dropoffTimings.trim() || undefined : undefined,
    mealIncluded: form.mealIncluded, mealType: form.mealIncluded ? form.mealType.trim() || undefined : undefined,
    menu: form.mealIncluded ? splitList(form.menu) : [], mealVariety: form.mealIncluded ? form.mealVariety.trim() || undefined : undefined,
    pointsOfInterest: splitList(form.pointsOfInterest), inclusions: splitList(form.inclusions), exclusions: splitList(form.exclusions), suitableFor: splitList(form.suitableFor),
    sourcePayload: { ...form.sourcePayload, prototype: { ticketTypes: form.ticketTypes, unitRows: form.unitRows, unitType: form.unitRows[0]?.name || form.unitType, unitMinPax: form.unitRows[0]?.minPax || form.unitMinPax, unitMaxPax: form.unitRows[0]?.maxPax || form.unitMaxPax, paxIncluded: form.unitRows[0]?.paxIncluded || form.paxIncluded, extraPerPerson: form.unitRows[0]?.extraPerPerson || form.extraPerPerson, unitsPerSlot: form.unitRows[0]?.unitsPerSlot || form.unitsPerSlot } },
  };
}

export default function OptionsStep({ snapshot, locked, onRefresh, onError }: WizardStepProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<VariantForm>({ ...emptyVariantForm });
  const [busy, setBusy] = useState(false);
  const addOptionRef = useRef<HTMLDivElement | null>(null);
  const variants = snapshot.variants;
  const update = <K extends keyof VariantForm>(key: K, value: VariantForm[K]) => setForm((old) => ({ ...old, [key]: value }));
  function edit(variant: ProductVariant) { setEditing(variant.id); setForm(toVariantForm(variant)); }
  function reset() { setEditing(null); setForm({ ...emptyVariantForm }); }
  function updateTicket(index: number, key: keyof VariantForm['ticketTypes'][number], value: string | boolean) { setForm((old) => ({ ...old, ticketTypes: old.ticketTypes.map((ticket, ticketIndex) => ticketIndex === index ? { ...ticket, [key]: value } : ticket) })); }
  function updateUnit(index: number, key: keyof VariantForm['unitRows'][number], value: string) { setForm((old) => ({ ...old, unitRows: old.unitRows.map((unit, unitIndex) => unitIndex === index ? { ...unit, [key]: value } : unit) })); }
  function addUnit(name?: string) { setForm((old) => { const unitName = name || old.unitType || 'CAR'; return { ...old, unitType: old.unitType || unitName, unitRows: [...old.unitRows, { name: unitName, minPax: '1', maxPax: '4', paxIncluded: '4', extraPerPerson: '', unitsPerSlot: '1' }] }; }); }
  function selectUnitType(value: string) { setForm((old) => ({ ...old, unitType: value, unitRows: old.unitRows.length ? old.unitRows : [{ name: value, minPax: '1', maxPax: '4', paxIncluded: '4', extraPerPerson: '', unitsPerSlot: '1' }] })); }
  async function saveBlueprint(variantId: string) {
    await api.request(`/variants/${variantId}/blueprint`, { method: 'PUT', body: JSON.stringify({ ticketTypes: form.ticketTypes, unitRows: form.unitRows }) });
  }

  async function save() {
    if (!snapshot.product || !form.name.trim() || (!editing && !form.variantCode.trim())) return;
    const minPax = Number(form.minPax); const maxPax = Number(form.maxPax); const cutOffHours = Number(form.cutOffMinutes);
    if (!Number.isInteger(minPax) || minPax < 1) return onError('Minimum travellers must be a whole number of 1 or more.');
    if (!Number.isInteger(maxPax) || maxPax < minPax) return onError('Maximum travellers must be a whole number and at least the minimum.');
    if (!Number.isInteger(cutOffHours) || cutOffHours < 0) return onError('Booking cutoff must be a whole number of 0 hours or more.');
    setBusy(true);
    let persistedVariantId = editing;
    try {
      const next = payload(form);
      if (editing) { const { variantCode: _variantCode, ...editable } = next; const current = variants.find((variant) => variant.id === editing); await api.request(`/variants/${editing}`, { method: 'PATCH', body: JSON.stringify({ ...editable, expectedVersion: current?.version }) }); await saveBlueprint(editing); }
      else { const created = await api.request<ProductVariant>(`/products/${snapshot.product.id}/variants`, { method: 'POST', body: JSON.stringify(next) }); persistedVariantId = created.id; setEditing(created.id); await saveBlueprint(created.id); }
      reset(); await onRefresh();
    } catch (e) {
      // The variant and its ticket/unit blueprint are separate writes. If the
      // blueprint fails, retain the variant ID and refresh its version so the
      // user can retry the same option instead of creating a duplicate.
      if (persistedVariantId) await onRefresh();
      onError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function archive(variant: ProductVariant) {
    if (!window.confirm(`Archive ${variant.name}? Existing rate plans and bookings remain retained.`)) return;
    setBusy(true);
    try { await api.request(`/variants/${variant.id}/archive`, { method: 'POST', body: JSON.stringify({ expectedVersion: variant.version }) }); await onRefresh(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return <div className="experience-step-stack">
    <div className="experience-step-card"><div className="experience-card-heading"><div><h3>Options &amp; ticket types</h3><p>An option is a bookable variant (private vs shared, with or without lunch). Each option has its own ticket types and rates.</p></div><div className="experience-header-actions">{!locked && <button type="button" className="btn small" onClick={() => addOptionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>+ Add option</button>}<span className="experience-pill">{variants.length} options</span></div></div>
      {variants.length ? <div className="option-card-grid">{variants.map((variant) => <div className="option-card" key={variant.id}><div className="experience-card-heading"><div><b>{variant.name}</b><small>{variant.variantCode} · {variant.durationMinutes ? `${variant.durationMinutes} min` : 'Duration not set'} · {variant.privateShared || 'Shared'}</small></div><Badge value={variant.status} /></div><p>{[variant.vehicleType, variant.pickupIncluded ? 'Pickup included' : 'No pickup', variant.mealIncluded ? 'Meal included' : 'No meal'].filter(Boolean).join(' · ')}</p><small>Booking: {variant.minPax ?? 1}–{variant.maxPax ?? 99} travellers · cutoff {Math.round((variant.cutOffMinutes ?? 0) / 60)} hours</small><small>{variant.ratePlans?.length || 0} rate plan{variant.ratePlans?.length === 1 ? '' : 's'}</small>{!locked && <div className="experience-footer-actions"><button type="button" className="btn small" onClick={() => edit(variant)}>Edit</button><button type="button" className="btn small" onClick={() => void archive(variant)} disabled={busy}>Archive</button></div>}</div>)}</div> : <div className="experience-empty">No options yet. Add at least one real option before submitting.</div>}
    </div>
    {!locked && snapshot.product && <div ref={addOptionRef} className="experience-step-card"><div className="experience-card-heading"><div><h4>{editing ? 'Edit option' : 'Add option'}</h4><p>Operational and booking defaults belong to the option, not to an individual price.</p></div>{editing && <button type="button" className="link-button" onClick={reset}>Cancel edit</button>}</div>
      <div className="experience-form-grid two"><Field label="Option code *"><input value={form.variantCode} onChange={(e) => update('variantCode', e.target.value)} readOnly={Boolean(editing)} placeholder="OPT-SHARED" /></Field><Field label="Option name *"><input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Standard shared" /></Field><Field label="Duration (minutes)"><input type="number" min="0" value={form.durationMinutes} onChange={(e) => update('durationMinutes', e.target.value)} /></Field><Field label="Shared or private"><select value={form.privateShared} onChange={(e) => update('privateShared', e.target.value)}><option>Shared</option><option>Private</option></select></Field></div>
      <section className="option-pricing-mode"><div className="experience-card-heading"><div><h4>How is this option priced?</h4><p>Choose whether the price is per traveller or for a car, boat, yacht, tent or room.</p></div></div><div className="option-pricing-mode-cards"><button type="button" className={`option-pricing-mode-card ${!form.unitType ? 'selected' : ''}`} onClick={() => setForm((old) => ({ ...old, unitType: '', unitRows: [] }))}><b>Per person</b><span>Price per traveller, split by age band</span></button><button type="button" className={`option-pricing-mode-card ${form.unitType ? 'selected' : ''}`} onClick={() => selectUnitType(form.unitType || 'CAR')}><b>Per unit</b><span>One price for a car, boat, yacht, tent or room</span></button></div></section>
      <div className="experience-form-grid three option-booking-defaults"><Field label="Minimum travellers" hint="Smallest group size this option accepts"><input type="number" min="1" value={form.minPax} onChange={(e) => update('minPax', e.target.value)} /></Field><Field label="Maximum travellers" hint="Largest group size this option accepts"><input type="number" min="1" value={form.maxPax} onChange={(e) => update('maxPax', e.target.value)} /></Field><Field label="Booking cutoff (hours)" hint="Bookings close this many hours before start"><input type="number" min="0" value={form.cutOffMinutes} onChange={(e) => update('cutOffMinutes', e.target.value)} /></Field></div>
      <details className="advanced-details option-advanced-details"><summary>Advanced option details</summary>
        <div className="experience-form-grid two"><Field label="Vehicle / guide type"><input value={form.vehicleType} onChange={(e) => update('vehicleType', e.target.value)} placeholder="Optional" /></Field><Field label="Description"><textarea rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} /></Field></div>
        <div className="experience-toggle-grid"><label className="wizard-check"><input type="checkbox" checked={form.pickupIncluded} onChange={(e) => update('pickupIncluded', e.target.checked)} /> Pickup included</label><label className="wizard-check"><input type="checkbox" checked={form.dropoffIncluded} onChange={(e) => update('dropoffIncluded', e.target.checked)} /> Drop-off included</label><label className="wizard-check"><input type="checkbox" checked={form.mealIncluded} onChange={(e) => update('mealIncluded', e.target.checked)} /> Meal included</label></div>
        {form.pickupIncluded && <div className="experience-form-grid three"><Field label="Pickup type"><input value={form.pickupType} onChange={(e) => update('pickupType', e.target.value)} /></Field><Field label="Pickup instructions"><input value={form.pickupInput} onChange={(e) => update('pickupInput', e.target.value)} /></Field><Field label="Pickup timings"><input value={form.pickupTimings} onChange={(e) => update('pickupTimings', e.target.value)} /></Field></div>}
        {form.dropoffIncluded && <Field label="Drop-off timings"><input value={form.dropoffTimings} onChange={(e) => update('dropoffTimings', e.target.value)} /></Field>}
        {form.mealIncluded && <div className="experience-form-grid three"><Field label="Meal type"><input value={form.mealType} onChange={(e) => update('mealType', e.target.value)} /></Field><Field label="Menu"><input value={form.menu} onChange={(e) => update('menu', e.target.value)} placeholder="Tea, snack" /></Field><Field label="Meal variety"><input value={form.mealVariety} onChange={(e) => update('mealVariety', e.target.value)} /></Field></div>}
        <div className="experience-form-grid three">{(['inclusions', 'exclusions', 'suitableFor'] as const).map((key) => <Field key={key} label={key === 'suitableFor' ? 'Suitable for' : key[0].toUpperCase() + key.slice(1)} hint="Separate items with commas"><input value={form[key]} onChange={(e) => update(key, e.target.value)} /></Field>)}</div>
      </details>
      <section className="option-ticket-config"><div className="experience-card-heading"><div><h4>Ticket types</h4><p>Define age bands and whether each ticket consumes capacity.</p></div><button type="button" className="btn small" onClick={() => setForm((old) => ({ ...old, ticketTypes: [...old.ticketTypes, { name: '', ageFrom: '', ageTo: '', needsAdult: false, countsCapacity: true }] }))}>+ Add ticket type</button></div>{form.ticketTypes.map((ticket, index) => <div className="experience-form-grid five option-ticket-row" key={`${index}-${ticket.name}`}><Field label="Ticket type"><input value={ticket.name} onChange={(e) => updateTicket(index, 'name', e.target.value)} placeholder="Child" /></Field><Field label="Age from"><input type="number" min="0" value={ticket.ageFrom} onChange={(e) => updateTicket(index, 'ageFrom', e.target.value)} placeholder="0" /></Field><Field label="Age to"><input type="number" min="0" value={ticket.ageTo} onChange={(e) => updateTicket(index, 'ageTo', e.target.value)} placeholder="12" /></Field><label className="wizard-check"><input type="checkbox" checked={ticket.needsAdult} onChange={(e) => updateTicket(index, 'needsAdult', e.target.checked)} /> Needs adult</label><label className="wizard-check"><input type="checkbox" checked={ticket.countsCapacity} onChange={(e) => updateTicket(index, 'countsCapacity', e.target.checked)} /> Counts capacity</label>{form.ticketTypes.length > 1 && <button type="button" className="link-button" onClick={() => setForm((old) => ({ ...old, ticketTypes: old.ticketTypes.filter((_, ticketIndex) => ticketIndex !== index) }))}>Remove</button>}</div>)}</section>
      {form.unitType && <section className="option-ticket-config"><div className="experience-card-heading"><div><h4>Units and capacity</h4><p>Add each unit size separately. Each one gets its own price in Rates.</p></div><button type="button" className="btn small" onClick={() => addUnit()}>+ Add unit</button></div><div className="unit-type-chips">{[['CAR','Car / cab'], ['BOAT','Boat'], ['YACHT','Yacht'], ['TENT','Tent / room'], ['CUSTOM','Other']].map(([value, label]) => <button type="button" key={value} className={`chip ${form.unitType === value ? 'selected' : ''}`} onClick={() => selectUnitType(value)}>{label}</button>)}</div>{form.unitRows.length ? <div className="unit-capacity-table"><div className="unit-capacity-head"><span>Unit</span><span>Min pax</span><span>Max pax</span><span>Pax included</span><span>Extra / person</span><span>Units / slot</span><span /></div>{form.unitRows.map((unit, index) => <div className="unit-capacity-row" key={`${index}-${unit.name}`}><input aria-label={`Unit ${index + 1}`} value={unit.name} onChange={(e) => updateUnit(index, 'name', e.target.value)} /><input aria-label={`Unit ${index + 1} minimum pax`} type="number" min="1" value={unit.minPax} onChange={(e) => updateUnit(index, 'minPax', e.target.value)} /><input aria-label={`Unit ${index + 1} maximum pax`} type="number" min="1" value={unit.maxPax} onChange={(e) => updateUnit(index, 'maxPax', e.target.value)} /><input aria-label={`Unit ${index + 1} pax included`} type="number" min="1" value={unit.paxIncluded} onChange={(e) => updateUnit(index, 'paxIncluded', e.target.value)} /><input aria-label={`Unit ${index + 1} extra per person`} type="number" min="0" value={unit.extraPerPerson} onChange={(e) => updateUnit(index, 'extraPerPerson', e.target.value)} /><input aria-label={`Unit ${index + 1} units per slot`} type="number" min="1" value={unit.unitsPerSlot} onChange={(e) => updateUnit(index, 'unitsPerSlot', e.target.value)} />{!locked && <button type="button" className="link-button" onClick={() => setForm((old) => ({ ...old, unitRows: old.unitRows.filter((_, unitIndex) => unitIndex !== index) }))}>Remove</button>}</div>)}</div> : <p className="experience-help">Choose a unit type and add a unit when this option is priced per unit.</p>}</section>}
      <button type="button" className="btn accent" disabled={busy || !form.name.trim() || (!editing && !form.variantCode.trim())} onClick={() => void save()}>{busy ? 'Saving…' : editing ? 'Save option' : 'Add option'}</button>
    </div>}
  </div>;
}
