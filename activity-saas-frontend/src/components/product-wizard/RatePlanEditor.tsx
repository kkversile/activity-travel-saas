import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Field } from '../Ui';
import { isImportDate, isMoneyAmount } from '../../../../activity-saas-backend/src/common/product-import-contract';

export type OfferVersion = { id: string; status: string; versionNumber: number; effectiveFrom: string; effectiveTo?: string | null; currency: string; pricingUnit: string; supplierBaseAmount?: string | null; travellerPrices?: Array<{ travellerType: string; amount: string }>; sourcePayload?: Record<string, any> };
export type Offer = { id: string; code?: string; name?: string; currency?: string; selectable?: boolean; editable?: boolean; advanced?: boolean; protected?: boolean; travellerRules?: Array<{ type: string; maxCount: number }>; versions?: OfferVersion[] };
export type OfferData = { options?: Array<{ variantId: string; name?: string; ratePlans?: Offer[] }> };

/** Present effective draft/active periods, including active gaps outside a draft. */
export function offerPeriods(versions: OfferVersion[]) {
  const priced = versions.filter(v => ['DRAFT','ACTIVE'].includes(v.status) && v.pricingUnit && (v.travellerPrices?.length || v.supplierBaseAmount != null));
  const end = (v: OfferVersion) => v.effectiveTo?.slice(0,10) || '9999-12-31';
  const bounds = [...new Set(priced.flatMap(v => [v.effectiveFrom.slice(0,10), end(v)]))].sort();
  const result: Array<{ from: string; to: string; version: OfferVersion }> = [];
  for (let i=0;i<bounds.length-1;i++) {
    const from=bounds[i], to=bounds[i+1];
    const version=priced.filter(v => v.effectiveFrom.slice(0,10)<=from && end(v)>from).sort((a,b)=>(Number(b.status==='DRAFT')-Number(a.status==='DRAFT')) || b.versionNumber-a.versionNumber)[0];
    if (!version) continue;
    const last=result.at(-1);
    if (last?.version.id===version.id && last.to===from) last.to=to;
    else result.push({from,to,version});
  }
  return result;
}

export default function RatePlanEditor({ productId, data, locked, onBusyChange }: { productId: string; data: OfferData; locked: boolean; onBusyChange?: (busy: boolean, saved?: boolean)=>void }) {
  const [current,setCurrent]=useState(data),[planId,setPlanId]=useState(''),[periodIndex,setPeriodIndex]=useState(0);
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[amounts,setAmounts]=useState<Record<string,string>>({}),[base,setBase]=useState('');
  const [foreign,setForeign]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  // Keep the selected offer's version snapshot until an explicit reload or save.
  // A sibling editor refreshing must not silently advance optimistic locking.
  useEffect(()=>{if(!planId)setCurrent(data);},[data,planId]);
  const choices=(current.options || []).filter(o=>o.ratePlans?.some(p=>p.advanced || p.protected)).flatMap(o=>(o.ratePlans || []).map(plan=>({option:o,plan})));
  const choice=choices.find(c=>c.plan.id===planId),plan=choice?.plan,periods=offerPeriods(plan?.versions || []),period=periods[periodIndex];
  function load(id: string,index=0,source=current) {
    const offer=source.options?.flatMap(o=>o.ratePlans || []).find(p=>p.id===id),range=offerPeriods(offer?.versions || [])[index];
    setPlanId(id);setPeriodIndex(index);setError('');setMessage('');
    setFrom(range?.from || '');setTo(range?.to==='9999-12-31' ? `${Number(range.from.slice(0,4))+1}${range.from.slice(4)}` : range?.to || '');
    setAmounts({...Object.fromEntries((offer?.travellerRules || []).filter(r=>r.maxCount>0).map(r=>[r.type,''])),...Object.fromEntries((range?.version.travellerPrices || []).map(p=>[p.travellerType,String(p.amount)]))});setBase(String(range?.version.supplierBaseAmount ?? ''));
    setForeign(Object.fromEntries((range?.version.sourcePayload?.visitorPrices || []).map((p:any)=>[p.travellerType,String(p.foreign)])));
  }
  async function save() {
    if (!plan || !choice || !period || plan.protected || plan.selectable===false) return;
    setError('');setMessage('');
    if (!isImportDate(from) || !isImportDate(to) || from>=to || from<period.from || to>period.to) {setError('Choose real start/end dates within the selected selling period. The end date is exclusive.');return;}
    const original=Object.fromEntries((period.version.travellerPrices || []).map(p=>[p.travellerType,String(p.amount)]));
    const changes=Object.entries(amounts).filter(([type,value])=>original[type]!==value);
    const originalForeign=Object.fromEntries((period.version.sourcePayload?.visitorPrices || []).map((p:any)=>[p.travellerType,String(p.foreign)]));
    const foreignChanges=Object.entries(foreign).filter(([type,value])=>originalForeign[type]!==value);
    if (period.version.pricingUnit==='PER_PERSON' ? Object.values(amounts).some(v=>!isMoneyAmount(v)) : !isMoneyAmount(base)) {setError('Keep a valid price for each ticket type, or enter 0 for free admission. Amounts support up to four decimals.');return;}
    if (Object.values(foreign).some(v=>!isMoneyAmount(v))) {setError('Keep valid foreign guest prices, or enter 0 for free admission.');return;}
    if (!changes.length && !foreignChanges.length && base===String(period.version.supplierBaseAmount ?? '')) {setError('Change a price before saving.');return;}
    const option={updateMode:'PATCH',variantId:choice.option.variantId,ratePlanId:plan.id,expectedVersion:Math.max(...(plan.versions || []).map(v=>v.versionNumber)),effectiveFrom:from,effectiveTo:to,
      ...(period.version.pricingUnit==='PER_PERSON' ? {travellerPrices:changes.map(([travellerType,amount])=>({travellerType,amount})),...(foreignChanges.length?{visitorPrices:foreignChanges.map(([travellerType,value])=>({travellerType,indian:amounts[travellerType],foreign:value}))}:{})} : {supplierBaseAmount:base})};
    setBusy(true);onBusyChange?.(true);let saved=false;
    try {
      const preview=await api.request<{valid:boolean;errors:string[]}>(`/products/${productId}/prices-availability/preview`,{method:'POST',body:JSON.stringify({options:[option]})});
      if (!preview.valid) throw new Error(preview.errors.join(' '));
      await api.request(`/products/${productId}/prices-availability/apply`,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({options:[option]})});
      const next=await api.request<OfferData>(`/products/${productId}/prices-availability`);setCurrent(next);load(plan.id,0,next);setMessage('Rate plan prices saved as a draft. Other plans and confirmed booking prices are unchanged.');saved=true;
    } catch(e) {setError(e instanceof Error?e.message:String(e));} finally {setBusy(false);onBusyChange?.(false,saved);}
  }
  async function reload() {
    setBusy(true);setError('');
    try {const next=await api.request<OfferData>(`/products/${productId}/prices-availability`);setCurrent(next);load(planId,0,next);setMessage('Rate plans reloaded. Unsaved prices were cleared.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  if (!choices.length) return null;
  const readOnly=locked || busy || !!plan?.protected || plan?.selectable===false;
  return <section className="experience-step-card" aria-label="Individual rate plans"><h3>Individual rate plans</h3>
    <p>Choose the offer and selling period to edit. Prices save as drafts for review. Changing the plan or period resets unsaved prices.</p>
    <Field label="Rate plan"><select value={planId} disabled={locked || busy} onChange={e=>load(e.target.value)}><option value="">Choose a rate plan</option>{choices.map(({option,plan:p})=><option key={p.id} value={p.id}>{option.name || option.variantId} · {p.name || 'Rate plan'} · {p.code || p.id} · {p.currency}{p.protected || p.selectable===false?' · Read only':''}</option>)}</select></Field>
    <button type="button" className="btn secondary" disabled={busy} onClick={()=>void reload()}>Reload rate plans</button>
    {plan && <><Field label="Selling period"><select value={periodIndex} disabled={locked || busy} onChange={e=>load(plan.id,Number(e.target.value))}>{periods.map((p,i)=><option key={`${p.from}-${p.to}`} value={i}>{p.from} to {p.to==='9999-12-31'?'open ended':p.to} · {p.version.status==='DRAFT'?'Draft':'Current'}</option>)}</select></Field>
      {!period ? <p>No complete saved prices are available for this plan. Complete its commercial setup before editing.</p> : <>
        <p>Currency: <b>{period.version.currency}</b> · {period.version.pricingUnit==='PER_PERSON'?'Per traveller':'Per booking / resource'}. Booking limits, cancellation rules and other offers keep their existing values.</p>
        {period.version.sourcePayload?.mrpMode!=='NO' && period.version.sourcePayload?.mrpAmount!=null && <p>MRP / gate price: {period.version.currency} {String(period.version.sourcePayload.mrpAmount)}</p>}
        {plan.protected || plan.selectable===false ? <p role="status">This contract or channel-linked plan is read only. Its prices are preserved.</p>:null}
        <div className="experience-form-grid two"><Field label="Plan selling starts"><input type="date" value={from} disabled={readOnly} onChange={e=>setFrom(e.target.value)}/></Field><Field label="Plan selling ends (exclusive)"><input type="date" value={to} disabled={readOnly} onChange={e=>setTo(e.target.value)}/></Field></div>
        <div className="experience-form-grid three">{period.version.pricingUnit==='PER_PERSON'?Object.entries(amounts).map(([type,value])=><Field key={type} label={`${type[0]+type.slice(1).toLowerCase()} price (${period.version.currency})`}><input inputMode="decimal" value={value} disabled={readOnly} onChange={e=>setAmounts(a=>({...a,[type]:e.target.value}))}/></Field>):<Field label={`Booking price (${period.version.currency})`}><input inputMode="decimal" value={base} disabled={readOnly} onChange={e=>setBase(e.target.value)}/></Field>}</div>
        {period.version.pricingUnit==='PER_PERSON' && Object.keys(foreign).length>0 && <div className="experience-form-grid three">{Object.entries(foreign).map(([type,value])=><Field key={type} label={`Foreign ${type.toLowerCase()} price (${period.version.currency})`}><input inputMode="decimal" value={value} disabled={readOnly} onChange={e=>setForeign(a=>({...a,[type]:e.target.value}))}/></Field>)}</div>}
        <button type="button" className="btn primary" disabled={readOnly} onClick={()=>void save()}>{busy?'Saving rate plan…':'Save rate plan prices'}</button>
      </>}
    </>}
    {error && <p role="alert" className="alert error">{error}</p>}{message && <p role="status" className="alert success">{message}</p>}
  </section>;
}
