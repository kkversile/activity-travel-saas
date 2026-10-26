import { useState } from 'react';
import type { ProductVariant, RatePlan } from '../../api';
import { Badge } from '../Ui';
import CommercialEditor from '../CommercialEditor';
import RatePlanFormModal from './RatePlanFormModal';
import type { WizardStepProps } from './types';

export default function RatesRulesStep({ snapshot, locked, onRefresh, onError }: WizardStepProps) {
  const variants = snapshot.variants;
  const [formTarget, setFormTarget] = useState<{ plan?: RatePlan; variantId: string } | null>(null);
  const plans = variants.flatMap((variant) => (variant.ratePlans || []).map((plan) => ({ plan, variant })));

  return <div className="experience-step-stack">
    <div className="experience-step-card"><div className="experience-card-heading"><div><h3>4 · Pricing & booking rules</h3><p>A rate plan is a sellable price rule for one option. Configure pricing, confirmation and cancellation rules here.</p></div><span className="experience-pill">{plans.length} rate plans</span></div>{plans.length ? <div className="rate-plan-list">{plans.map(({ plan, variant }) => <RatePlanCard key={plan.id} plan={plan} variant={variant} locked={locked} onRefresh={onRefresh} onError={onError} onEdit={() => setFormTarget({ plan, variantId: variant.id })} />)}</div> : <div className="experience-empty">Start by creating a rate plan for an option. You can create more than one plan for different customer or supplier agreements.</div>}</div>
    {!locked && variants.length > 0 && <>
      <div className="experience-step-card rate-plan-create-cta"><div><h4>Need another price plan?</h4><p>Create a sellable price rule for an option. The same form is used for new and existing plans.</p></div><button type="button" className="btn accent" onClick={() => setFormTarget({ variantId: variants[0].id })}>+ Create rate plan</button></div>
      {formTarget && <RatePlanFormModal variants={variants} initialPlan={formTarget.plan} initialVariantId={formTarget.variantId} onClose={() => setFormTarget(null)} onSaved={onRefresh} onError={onError} />}
    </>}
  </div>;
}

function RatePlanCard({ plan, variant, locked, onRefresh, onError, onEdit }: { plan: RatePlan; variant: ProductVariant; locked: boolean; onRefresh: () => Promise<void>; onError: (message: string) => void; onEdit: () => void }) {
  return <div className="rate-plan-card"><div className="experience-card-heading"><div><b>{plan.name}</b><small>{variant.name} · {plan.ratePlanCode} · {plan.currency} · {plan.minPax}–{plan.maxPax} pax · cutoff {plan.cutOffMinutes} min</small></div><div className="status-actions"><Badge value={plan.commercialReadiness?.ready ? 'READY' : 'NEEDS_REVIEW'} />{!locked && <button type="button" className="btn small" onClick={onEdit}>Edit rate plan</button>}</div></div><div className="cancellation-summary">{plan.cancellationRules?.length ? plan.cancellationRules.map((rule) => <span key={`${rule.minDaysBefore}-${rule.maxDaysBefore}`}>{rule.minDaysBefore}+ days: {rule.chargeValue}{rule.chargeType === 'PERCENTAGE' ? '%' : ` ${plan.currency}`}</span>) : <span>No cancellation rules configured</span>}</div>{!locked && <CommercialEditor plan={plan} onRefresh={onRefresh} setError={onError} />}</div>;
}
