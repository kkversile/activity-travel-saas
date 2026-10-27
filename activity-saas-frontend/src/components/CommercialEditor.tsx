import { useEffect, useState } from 'react';
import { api, type CommercialVersion, type RatePlan } from '../api';
import { Field, Panel } from './Ui';
import { SharedDatePicker } from './SharedDatePicker';
import { readinessExplanation, readinessSummary } from './readinessLabels';

const travellerTypes = ['ADULT', 'CHILD', 'SENIOR'] as const;
const supplierModels = [['NET_RATE', 'Net supplier rate', 'Enter the amount payable to the supplier.'], ['COMMISSIONABLE', 'Commissionable rate', 'Enter the base amount and the supplier commission percentage.']] as const;
const pricingUnits = [['PER_PERSON', 'Per traveller', 'Each traveller is priced separately.'], ['PER_BOOKING', 'Per booking', 'One total price applies to the booking.'], ['PER_UNIT', 'Per unit', 'Price applies to each unit, seat or item.'], ['GROUP', 'Per group', 'One price applies to the whole group.']] as const;
const bookingModes = [['INSTANT', 'Instant confirmation', 'The booking is confirmed immediately.'], ['VENDOR_CONFIRMATION', 'Vendor confirmation', 'You confirm the booking before it is accepted.'], ['MANUAL_ON_REQUEST', 'Manual on request', 'The booking waits for manual handling.']] as const;
type CommercialResponse = { readiness: { ready: boolean; reasonCodes: string[]; activeVersion?: CommercialVersion | null; draftVersion?: CommercialVersion | null }; versions: CommercialVersion[] };

function optionDescription(options: readonly (readonly [string, string, string])[], value: string) { return options.find(([key]) => key === value)?.[2] || ''; }
function travellerLabel(type: string) { return type[0] + type.slice(1).toLowerCase(); }
function dateInputValue(value?: string | null) { return value ? value.slice(0, 10) : ''; }
function nextDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function dateStart(value: string) { return new Date(`${value}T00:00:00.000Z`).toISOString(); }
function dateEnd(value: string) { return new Date(`${value}T23:59:59.999Z`).toISOString(); }

export default function CommercialEditor({ plan, onRefresh, setError }: { plan: RatePlan; onRefresh: () => void; setError: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<CommercialResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [supplierModel, setSupplierModel] = useState('NET_RATE');
  const [pricingUnit, setPricingUnit] = useState('PER_PERSON');
  const [bookingMode, setBookingMode] = useState('INSTANT');
  const [effectiveFrom, setEffectiveFrom] = useState(dateInputValue(plan.validFrom));
  const [effectiveTo, setEffectiveTo] = useState(dateInputValue(plan.validTo));
  const [sla, setSla] = useState('');
  const [amount, setAmount] = useState('0');
  const [commission, setCommission] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({ ADULT: '', CHILD: '', SENIOR: '' });
  const readiness = data?.readiness || plan.commercialReadiness;
  const configuredTravellerTypes = plan.travellerRules.filter((rule) => rule.maxCount > 0).map((rule) => rule.type).filter((type): type is typeof travellerTypes[number] => travellerTypes.includes(type as typeof travellerTypes[number]));
  const requiredTravellerTypes = configuredTravellerTypes.length ? configuredTravellerTypes : ['ADULT' as const];

  async function load() {
    try {
      const result = await api.request<CommercialResponse>(`/rate-plans/${plan.id}/commercial`);
      setData(result);
      const draft = result.readiness.draftVersion;
      const active = result.readiness.activeVersion;
      setEffectiveFrom(dateInputValue(draft?.effectiveFrom || (active?.effectiveTo ? nextDate(active.effectiveTo) : new Date().toISOString())));
      setEffectiveTo(dateInputValue(draft?.effectiveTo || plan.validTo));
      if (draft) {
        setSupplierModel(draft.supplierModel || 'NET_RATE');
        setPricingUnit(draft.pricingUnit || 'PER_PERSON');
        setBookingMode(draft.bookingMode || 'INSTANT');
        setSla(draft.confirmationSlaMinutes == null ? '' : String(draft.confirmationSlaMinutes));
        setAmount(String(draft.supplierBaseAmount ?? ''));
        setCommission(draft.supplierCommissionPercent == null ? '' : String(draft.supplierCommissionPercent));
        setPrices(Object.fromEntries(travellerTypes.map((type) => [type, String(draft.travellerPrices.find((price) => price.travellerType === type)?.amount || '')])));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { void load(); }, [plan.id]);

  function validatePricing() {
    const errors: Record<string, string> = {};
    if (!effectiveFrom) errors.effectiveFrom = 'Selling start date is required.';
    if (effectiveFrom && effectiveTo && new Date(`${effectiveTo}T00:00:00.000Z`) <= new Date(`${effectiveFrom}T00:00:00.000Z`)) errors.effectiveTo = 'Selling end date must be after the start date.';
    if (!amount.trim()) errors.amount = 'Supplier base amount is required.';
    else if (!/^\d+(\.\d{1,4})?$/.test(amount.trim())) errors.amount = 'Enter a valid amount.';
    if (supplierModel === 'COMMISSIONABLE' && !commission.trim()) errors.commission = 'Commission percentage is required.';
    else if (supplierModel === 'COMMISSIONABLE' && !/^\d+(\.\d{1,4})?$/.test(commission.trim())) errors.commission = 'Enter a valid percentage.';
    if (bookingMode !== 'INSTANT' && (!sla.trim() || !/^\d+$/.test(sla.trim()) || Number(sla) < 1)) errors.sla = 'Enter the vendor response time in minutes.';
    if (pricingUnit === 'PER_PERSON') {
      for (const type of requiredTravellerTypes) if (!prices[type].trim()) errors[type] = `${travellerLabel(type)} price is required for this rate plan.`;
      for (const type of travellerTypes) if (prices[type].trim() && !/^\d+(\.\d{1,4})?$/.test(prices[type].trim())) errors[type] = 'Enter a valid amount.';
    }
    return errors;
  }

  function clearFieldError(field: string) {
    if (!fieldErrors[field]) return;
    setFieldErrors((current) => { const next = { ...current }; delete next[field]; return next; });
  }

  async function save(activate: boolean) {
    setError('');
    const validationErrors = validatePricing();
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;
    setBusy(true);
    try {
      const draft = data?.readiness.draftVersion;
      const payload = { effectiveFrom: dateStart(effectiveFrom), effectiveTo: effectiveTo ? dateEnd(effectiveTo) : undefined, supplierModel, pricingUnit, bookingMode, confirmationSlaMinutes: bookingMode === 'INSTANT' || !sla ? undefined : Number(sla), supplierBaseAmount: amount.trim(), supplierCommissionPercent: commission.trim() || undefined, currency: plan.currency, travellerPrices: pricingUnit === 'PER_PERSON' ? travellerTypes.filter((type) => prices[type].trim()).map((type) => ({ travellerType: type, amount: prices[type].trim() })) : [] };
      const version = draft ? await api.request<CommercialVersion>(`/rate-plan-commercial-versions/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) }) : await api.request<CommercialVersion>(`/rate-plans/${plan.id}/commercial/versions`, { method: 'POST', body: JSON.stringify(payload) });
      if (activate) await api.request(`/rate-plan-commercial-versions/${version.id}/activate`, { method: 'POST' });
      setOpen(false);
      await load();
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleEditor() { setFieldErrors({}); setError(''); setOpen((value) => !value); }

  return <Panel title={`Supplier pricing · ${plan.name}`} action={readiness ? <span className={`badge ${readiness.ready ? 'active' : 'pending'}`}>{readiness.ready ? 'Ready for booking' : 'Needs setup'}</span> : undefined}>
    <p className="commercial-intro">Set the supplier price, booking confirmation method and cancellation rules for this rate plan.</p>
    <div className="rate-meta"><span>Pricing details are versioned</span><span>{readiness?.activeVersion ? `Active version ${readiness.activeVersion.versionNumber}` : 'No active version'}</span><span>{readiness?.draftVersion ? `Draft version ${readiness.draftVersion.versionNumber}` : 'No draft'}</span></div>
    {readiness?.reasonCodes?.length ? <div className="commercial-readiness" title={`Internal readiness codes: ${readiness.reasonCodes.join(', ')}`}><b>{readinessSummary(readiness.reasonCodes)}</b><span>{readinessExplanation(readiness.reasonCodes)}</span></div> : null}
    <button className="btn small" onClick={toggleEditor}>Edit pricing details</button>
    {open && <div className="modal-backdrop rate-plan-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) toggleEditor(); }}><div className="modal-card rate-plan-modal commercial-pricing-modal" role="dialog" aria-modal="true" aria-labelledby={`commercial-editor-${plan.id}`} onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><h3 id={`commercial-editor-${plan.id}`}>Edit supplier pricing · {plan.name}</h3><p className="muted">Update the commercial version, booking confirmation and traveller prices.</p></div><button type="button" className="modal-close" disabled={busy} onClick={toggleEditor} aria-label="Close supplier pricing editor">×</button></div><div className="rate-plan-modal-body"><div className="commercial-editor">
      <div className="commercial-subcard commercial-effective-dates"><b className="commercial-subtitle">Effective selling dates</b><small className="commercial-help">Set when this pricing version applies. For a replacement, start it after the current version ends.</small><div className="form-grid two"><Field label="Selling starts *" error={fieldErrors.effectiveFrom}><SharedDatePicker value={effectiveFrom} onChange={(value) => { setEffectiveFrom(value); clearFieldError('effectiveFrom'); }} ariaInvalid={Boolean(fieldErrors.effectiveFrom)} placeholder="Selling starts" /></Field><Field label="Selling ends" error={fieldErrors.effectiveTo}><SharedDatePicker value={effectiveTo} onChange={(value) => { setEffectiveTo(value); clearFieldError('effectiveTo'); }} ariaInvalid={Boolean(fieldErrors.effectiveTo)} placeholder="Selling ends" /></Field></div>{readiness?.activeVersion && <small className="commercial-help">Current active version: {dateInputValue(readiness.activeVersion.effectiveFrom)} to {dateInputValue(readiness.activeVersion.effectiveTo) || 'open-ended'}.</small>}</div>
      <div className="commercial-section-heading"><span>1</span><div><b>Pricing setup</b><small>Choose how the supplier price is calculated.</small></div></div>
      <div className="form-grid three">
        <Field label="Supplier price model" hint={optionDescription(supplierModels, supplierModel)}><select value={supplierModel} onChange={(e) => setSupplierModel(e.target.value)}>{supplierModels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="How is this priced?" hint={optionDescription(pricingUnits, pricingUnit)}><select value={pricingUnit} onChange={(e) => setPricingUnit(e.target.value)}>{pricingUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Supplier base amount" hint="Amount payable to the supplier for this rate." error={fieldErrors.amount}><input className={fieldErrors.amount ? 'input-error' : ''} aria-invalid={Boolean(fieldErrors.amount)} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); clearFieldError('amount'); }} placeholder="0.00" /></Field>
      </div>
      {supplierModel === 'COMMISSIONABLE' && <div className="commercial-subcard"><Field label="Supplier commission %" hint="Commission percentage used for this rate." error={fieldErrors.commission}><input className={fieldErrors.commission ? 'input-error' : ''} aria-invalid={Boolean(fieldErrors.commission)} inputMode="decimal" value={commission} onChange={(e) => { setCommission(e.target.value); clearFieldError('commission'); }} placeholder="e.g. 15" /></Field></div>}
      {pricingUnit === 'PER_PERSON' && <div className="commercial-subcard"><b className="commercial-subtitle">Traveller prices</b><small className="commercial-help">Required categories are marked *. Other categories are optional.</small><div className="form-grid three">{travellerTypes.map((type) => { const required = requiredTravellerTypes.includes(type); return <Field key={type} label={`${travellerLabel(type)} price${required ? ' *' : ''}`} error={fieldErrors[type]} hint={required ? 'Required for this rate plan.' : 'Optional.'}><input className={fieldErrors[type] ? 'input-error' : ''} aria-invalid={Boolean(fieldErrors[type])} inputMode="decimal" value={prices[type]} onChange={(e) => { setPrices({ ...prices, [type]: e.target.value }); clearFieldError(type); }} placeholder={required ? 'Required' : 'Optional'} /></Field>; })}</div></div>}
      <div className="commercial-section-heading"><span>2</span><div><b>Booking confirmation</b><small>Tell customers when their booking becomes confirmed.</small></div></div>
      <div className="form-grid two"><Field label="Confirmation method" hint={optionDescription(bookingModes, bookingMode)}><select value={bookingMode} onChange={(e) => setBookingMode(e.target.value)}>{bookingModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>{bookingMode !== 'INSTANT' && <Field label="Vendor response time" hint="Required when confirmation is not instant." error={fieldErrors.sla}><div className="input-with-suffix"><input className={fieldErrors.sla ? 'input-error' : ''} aria-invalid={Boolean(fieldErrors.sla)} type="number" min="1" value={sla} onChange={(e) => { setSla(e.target.value); clearFieldError('sla'); }} placeholder="e.g. 120" /><span>minutes</span></div></Field>}</div>
      <div className="commercial-section-heading"><span>3</span><div><b>Activate when ready</b><small>Save a draft while working, or activate it when the pricing is complete.</small></div></div>
      <div className="actions"><button className="btn" disabled={busy} onClick={() => void save(false)}>Save pricing draft</button><button className="btn primary" disabled={busy} onClick={() => void save(true)}>Activate pricing</button></div>
    </div></div></div></div>}
  </Panel>;
}
