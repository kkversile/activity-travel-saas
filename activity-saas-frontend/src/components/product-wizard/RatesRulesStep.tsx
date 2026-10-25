import { useState } from 'react';
import { api, type ProductVariant, type RatePlan, type TravellerRule } from '../../api';
import { Badge, Field } from '../Ui';
import CommercialEditor from '../CommercialEditor';
import type { WizardStepProps } from './types';

type CancellationDraft = { minDaysBefore: string; maxDaysBefore: string; chargeValue: string; chargeType: 'PERCENTAGE' | 'ABSOLUTE' };
type TravellerDraft = { type: TravellerRule['type']; displayName: string; minAge: string; maxAge: string; minCount: string; maxCount: string };
const travellerTypes: TravellerRule['type'][] = ['ADULT', 'CHILD', 'SENIOR', 'YOUTH', 'INFANT', 'GROUP'];
const currencyOptions = [['INR', 'Indian rupee'], ['USD', 'US dollar'], ['AED', 'UAE dirham'], ['EUR', 'Euro'], ['GBP', 'Pound sterling']];
const today = () => new Date().toISOString().slice(0, 10);
const future = () => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
const blankCancellation = (): CancellationDraft => ({ minDaysBefore: '0', maxDaysBefore: '', chargeValue: '0', chargeType: 'PERCENTAGE' });
const labelFor = (type: TravellerRule['type']) => type[0] + type.slice(1).toLowerCase();

export default function RatesRulesStep({ snapshot, locked, onRefresh, onError }: WizardStepProps) {
  const variants = snapshot.variants;
  const [variantId, setVariantId] = useState(variants[0]?.id || '');
  const [name, setName] = useState('Standard B2B');
  const [code, setCode] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(future());
  const [minPax, setMinPax] = useState('1');
  const [maxPax, setMaxPax] = useState('99');
  const [cutoff, setCutoff] = useState('0');
  const [rules, setRules] = useState<CancellationDraft[]>([]);
  const [travellers, setTravellers] = useState<TravellerDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const plans = variants.flatMap((variant) => (variant.ratePlans || []).map((plan) => ({ plan, variant })));

  function updateRule(index: number, key: keyof CancellationDraft, value: string) { setRules((old) => old.map((rule, i) => i === index ? { ...rule, [key]: value } : rule)); }
  function toggleTraveller(type: TravellerRule['type']) { setTravellers((old) => old.some((rule) => rule.type === type) ? old.filter((rule) => rule.type !== type) : [...old, { type, displayName: labelFor(type), minAge: '', maxAge: '', minCount: type === 'GROUP' ? '1' : '0', maxCount: '99' }]); }
  function updateTraveller(type: TravellerRule['type'], key: keyof TravellerDraft, value: string) { setTravellers((old) => old.map((rule) => rule.type === type ? { ...rule, [key]: value } : rule)); }

  async function createPlan() {
    if (!variantId || !name.trim() || !code.trim()) return;
    if (from > to) { onError('Valid to must be on or after valid from.'); return; }
    if (Number(minPax) < 1 || Number(maxPax) < Number(minPax)) { onError('Maximum passengers must be greater than or equal to minimum passengers.'); return; }
    if (travellers.some((rule) => (rule.minAge && rule.maxAge && Number(rule.maxAge) < Number(rule.minAge)) || Number(rule.maxCount) < Number(rule.minCount))) { onError('Check traveller age and count ranges.'); return; }
    if (rules.some((rule) => Number(rule.chargeValue) < 0 || (rule.chargeType === 'PERCENTAGE' && Number(rule.chargeValue) > 100) || (rule.maxDaysBefore && Number(rule.maxDaysBefore) < Number(rule.minDaysBefore)))) { onError('Check cancellation tiers: ranges and charges must be valid.'); return; }
    const sortedRanges = rules.map((rule) => ({ min: Number(rule.minDaysBefore), max: rule.maxDaysBefore === '' ? Number.POSITIVE_INFINITY : Number(rule.maxDaysBefore) })).sort((a, b) => a.min - b.min);
    if (sortedRanges.some((range, index) => index > 0 && sortedRanges[index - 1].max >= range.min)) { onError('Cancellation tiers cannot overlap.'); return; }
    setBusy(true);
    try {
      const travellerRules = travellers.map((rule) => ({ type: rule.type, displayName: rule.displayName.trim() || labelFor(rule.type), ...(rule.minAge ? { minAge: Number(rule.minAge) } : {}), ...(rule.maxAge ? { maxAge: Number(rule.maxAge) } : {}), minCount: Number(rule.minCount), maxCount: Number(rule.maxCount) }));
      await api.request(`/variants/${variantId}/rate-plans`, { method: 'POST', body: JSON.stringify({ ratePlanCode: code.trim(), name: name.trim(), currency, validFrom: from, validTo: to, minPax: Number(minPax), maxPax: Number(maxPax), cutOffMinutes: Number(cutoff), adultRequired: travellerRules.some((rule) => rule.type === 'ADULT' && rule.minCount > 0), minAdultRequired: travellerRules.find((rule) => rule.type === 'ADULT')?.minCount || 0, travellerRules, cancellationRules: rules.map((rule) => ({ minDaysBefore: Number(rule.minDaysBefore), ...(rule.maxDaysBefore ? { maxDaysBefore: Number(rule.maxDaysBefore) } : {}), chargeValue: Number(rule.chargeValue), chargeType: rule.chargeType })) }) });
      setCode('');
      await onRefresh();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return <div className="experience-step-stack">
    <div className="experience-step-card"><div className="experience-card-heading"><div><h3>4 · Pricing & booking rules</h3><p>A rate plan is a sellable price rule for one option. Configure pricing, confirmation and cancellation rules here.</p></div><span className="experience-pill">{plans.length} rate plans</span></div>{plans.length ? <div className="rate-plan-list">{plans.map(({ plan, variant }) => <RatePlanCard key={plan.id} plan={plan} variant={variant} locked={locked} onRefresh={onRefresh} onError={onError} />)}</div> : <div className="experience-empty">Start by creating a rate plan for an option. You can create more than one plan for different customer or supplier agreements.</div>}</div>
    {!locked && variants.length > 0 && <div className="experience-step-card"><div className="experience-card-heading"><div><h4>Create a sellable rate plan</h4><p>Choose an option, give this price rule a name, then add its selling dates and traveller limits.</p></div></div><div className="experience-notice"><b>Example:</b> Standard Agent, Private Group or Seasonal Promotional Price can each be separate rate plans for the same option.</div><div className="experience-form-grid three">
      <Field label="Which option is this for?" hint="The activity variant that customers will book."><select value={variantId} onChange={(e) => setVariantId(e.target.value)}>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {variant.variantCode}</option>)}</select></Field>
      <Field label="Plan name" hint="Use a name vendors and agents will understand."><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard Agent Price" /></Field>
      <Field label="Plan code" hint="Internal unique code."><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RP-STANDARD-01" /></Field>
      <Field label="Currency" hint="Currency used for this plan."><select value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencyOptions.map(([value, label]) => <option key={value} value={value}>{value} · {label}</option>)}</select></Field>
      <Field label="Selling starts"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Selling ends"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <Field label="Booking cutoff" hint="Minutes before start time when booking closes."><input type="number" min="0" value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></Field>
      <Field label="Minimum travellers"><input type="number" min="1" value={minPax} onChange={(e) => setMinPax(e.target.value)} /></Field>
      <Field label="Maximum travellers"><input type="number" min="1" value={maxPax} onChange={(e) => setMaxPax(e.target.value)} /></Field>
    </div><h4 className="experience-section-title">Who can book this rate?</h4><p className="experience-help">Select the traveller categories supported by this plan. You can add age and quantity limits after selecting a category.</p><div className="traveller-type-picker">{travellerTypes.map((type) => <label key={type} className="wizard-check"><input type="checkbox" checked={travellers.some((rule) => rule.type === type)} onChange={() => toggleTraveller(type)} /> {labelFor(type)}</label>)}</div>{travellers.map((rule) => <div className="traveller-rule" key={rule.type}><b>{labelFor(rule.type)}</b><Field label="Display name"><input value={rule.displayName} onChange={(e) => updateTraveller(rule.type, 'displayName', e.target.value)} /></Field><Field label="Minimum age"><input type="number" min="0" value={rule.minAge} onChange={(e) => updateTraveller(rule.type, 'minAge', e.target.value)} /></Field><Field label="Maximum age"><input type="number" min="0" value={rule.maxAge} onChange={(e) => updateTraveller(rule.type, 'maxAge', e.target.value)} /></Field><Field label="Minimum count"><input type="number" min="0" value={rule.minCount} onChange={(e) => updateTraveller(rule.type, 'minCount', e.target.value)} /></Field><Field label="Maximum count"><input type="number" min="0" value={rule.maxCount} onChange={(e) => updateTraveller(rule.type, 'maxCount', e.target.value)} /></Field></div>)}<h4 className="experience-section-title">Cancellation policy</h4><p className="experience-help">Tell customers what charge applies when they cancel. Use the suggested example only if it matches your actual policy.</p><div className="cancellation-rule-list">{rules.map((rule, index) => <div className="cancellation-rule" key={index}><Field label="Days before (from)"><input type="number" min="0" value={rule.minDaysBefore} onChange={(e) => updateRule(index, 'minDaysBefore', e.target.value)} /></Field><Field label="Days before (to)"><input type="number" min="0" placeholder="No upper limit" value={rule.maxDaysBefore} onChange={(e) => updateRule(index, 'maxDaysBefore', e.target.value)} /></Field><Field label="Cancellation charge"><input type="number" min="0" value={rule.chargeValue} onChange={(e) => updateRule(index, 'chargeValue', e.target.value)} /></Field><Field label="Charge type"><select value={rule.chargeType} onChange={(e) => updateRule(index, 'chargeType', e.target.value as CancellationDraft['chargeType'])}><option value="PERCENTAGE">Percentage</option><option value="ABSOLUTE">Fixed currency</option></select></Field><button type="button" className="link-button" onClick={() => setRules((old) => old.filter((_, i) => i !== index))}>Remove</button></div>)}</div><div className="experience-footer-actions"><button type="button" className="btn" onClick={() => setRules((old) => [...old, blankCancellation()])}>+ Add cancellation rule</button><button type="button" className="btn" onClick={() => setRules([{ minDaysBefore: '7', maxDaysBefore: '', chargeValue: '0', chargeType: 'PERCENTAGE' }, { minDaysBefore: '3', maxDaysBefore: '6', chargeValue: '50', chargeType: 'PERCENTAGE' }, { minDaysBefore: '0', maxDaysBefore: '2', chargeValue: '100', chargeType: 'PERCENTAGE' }])}>Use suggested policy</button><button type="button" className="btn accent" disabled={busy || !variantId || !name.trim() || !code.trim()} onClick={() => void createPlan()}>{busy ? 'Creating…' : 'Create rate plan'}</button></div></div>}
  </div>;
}

function RatePlanCard({ plan, variant, locked, onRefresh, onError }: { plan: RatePlan; variant: ProductVariant; locked: boolean; onRefresh: () => Promise<void>; onError: (message: string) => void }) {
  return <div className="rate-plan-card"><div className="experience-card-heading"><div><b>{plan.name}</b><small>{variant.name} · {plan.ratePlanCode} · {plan.currency} · {plan.minPax}–{plan.maxPax} pax · cutoff {plan.cutOffMinutes} min</small></div><Badge value={plan.commercialReadiness?.ready ? 'READY' : 'NEEDS_REVIEW'} /></div><div className="cancellation-summary">{plan.cancellationRules?.length ? plan.cancellationRules.map((rule) => <span key={`${rule.minDaysBefore}-${rule.maxDaysBefore}`}>{rule.minDaysBefore}+ days: {rule.chargeValue}{rule.chargeType === 'PERCENTAGE' ? '%' : ` ${plan.currency}`}</span>) : <span>No cancellation rules configured</span>}</div>{!locked && <CommercialEditor plan={plan} onRefresh={onRefresh} setError={onError} />}</div>;
}
