import { useEffect, useState } from 'react';
import { api, type ProductReadiness } from '../../api';
import { Badge } from '../Ui';
import { readinessReasonLabel } from '../readinessLabels';
import type { WizardStep, WizardStepProps } from './types';
import FulfilmentSection from './FulfilmentSection';

const sectionLabels: Array<[keyof ProductReadiness['sections'], string, WizardStep]> = [
  ['basicInfo', 'Basics', 1], ['experience', 'Content & itinerary', 2], ['mediaFulfilment', 'Photos', 3],
  ['options', 'Options & tickets', 4], ['rates', 'Rates', 5], ['availability', 'Availability', 6], ['policies', 'Policies', 7], ['voucher', 'Voucher', 8], ['distribution', 'Review & submit', 9],
];
const reasonLabels: Record<string, string> = {
  PRODUCT_NAME_MISSING: 'Product name is missing', PRODUCT_TYPE_MISSING: 'Product type is missing', PRODUCT_SUBTYPE_MISSING: 'Product type classification is missing',
  CATEGORY_MISSING: 'Category is missing', DESTINATION_MISSING: 'Complete city, state and country', MEETING_MODEL_MISSING: 'Meeting model is missing',
  EXPERIENCE_DESCRIPTION_MISSING: 'Full description is missing', MEETING_POINT_MISSING: 'Meeting point is missing for this model', OPTIONS_MISSING: 'No option has been created',
  RATE_PLAN_MISSING: 'No active rate plan exists', CANCELLATION_RULES_MISSING: 'Cancellation policy is missing', VISITOR_PRICES_MISSING: 'Indian and foreign visitor prices are incomplete',
  NO_ACTIVE_COMMERCIAL_VERSION: readinessReasonLabel('NO_ACTIVE_COMMERCIAL_VERSION'), LEGACY_COMMERCIAL_REVIEW_REQUIRED: readinessReasonLabel('LEGACY_COMMERCIAL_REVIEW_REQUIRED'),
  COMMERCIAL_VERSION_MISSING: 'Commercial terms need configuration', SUPPLIER_MODEL_MISSING: 'Supplier model is missing', PRICING_UNIT_MISSING: 'Pricing unit is missing',
  BOOKING_MODE_MISSING: 'Booking mode is missing', SUPPLIER_BASE_AMOUNT_MISSING: 'Supplier base amount is missing', TRAVELLER_PRICE_MISSING: 'Traveller prices are missing',
  CONFIRMATION_SLA_MISSING: 'Confirmation SLA is required', VOYA_REVENUE_RULE_MISSING: 'Voya revenue rule is not configured', TAX_CONFIGURATION_MISSING: 'Tax configuration is not configured',
  RATE_PLAN_NOT_MAPPED: 'A ready rate plan is not mapped to a schedule', SCHEDULE_MISSING: 'No active operating schedule exists', FUTURE_AVAILABILITY_MISSING: 'No future inventory with available capacity exists',
  SHORT_SUMMARY_MISSING: 'Short summary is missing', HIGHLIGHTS_COUNT_INVALID: 'Add between 3 and 6 highlights', INCLUDED_MISSING: 'What is included is missing', NOT_INCLUDED_MISSING: 'What is not included is missing', END_POINT_MISSING: 'End point is missing', ITINERARY_STOPS_MISSING: 'Add itinerary stops or choose single-location activity', ITINERARY_STOP_NAME_MISSING: 'Every itinerary stop needs a name', CANCELLATION_POLICY_MISSING: 'Cancellation policy is missing', VOUCHER_CONFIGURATION_MISSING: 'Voucher configuration is incomplete', VOUCHER_INSTRUCTIONS_MISSING: 'Redemption instructions are missing', SUPPLIER_VOUCHER_INTEGRATION_MISSING: 'Supplier voucher integration is not configured', COVER_IMAGE_MISSING: 'Cover image is missing', EXTERNAL_IMAGE_QUALITY_UNVERIFIED: 'External image quality needs verification; upload a validated image', FULFILMENT_POLICY_MISSING: 'Fulfilment policy is missing', CHANNEL_PRODUCT_NOT_MAPPED: 'Product is not connected to the Agent Marketplace',
};

export default function ReviewSubmitStep({ snapshot, locked, onNavigate, fulfilment, onFulfilmentChange, onSaveDraft }: WizardStepProps & { onNavigate: (step: WizardStep) => void }) {
  const [data, setData] = useState<ProductReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const revisionStatus = snapshot.revision?.status;
  const reviewDescription = revisionStatus === 'PUBLISHED'
    ? 'This is the published product version. Create a working revision to prepare changes for review.'
    : revisionStatus === 'UNDER_REVIEW'
      ? 'This revision is under review. It will go live after platform approval.'
      : 'Submitting sends the product to QC. It goes live only after QC approves.';
  async function load() {
    if (!snapshot.product) return;
    setLoading(true);
    setLoadError('');
    try { setData(await api.request<ProductReadiness>(`/products/${snapshot.product.id}/readiness`)); }
    catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [snapshot.product?.id, snapshot.revision?.id, snapshot.revision?.status, snapshot.variants.length, snapshot.schedules.length]);
  return (
    <div className="experience-step-stack">
      <div className="experience-step-card">
        <div className="experience-card-heading">
          <div>
            <h3>Review &amp; submit</h3>
            <p>{reviewDescription}</p>
          </div>
          {data && <Badge value={data.ready ? 'READY' : 'NEEDS_REVIEW'} />}
        </div>
        {!snapshot.product && <div className="experience-empty">Save the draft first to ask the server for readiness.</div>}
        {snapshot.product && (
          <>
            {loadError && <div className="alert error" role="alert">Readiness could not be loaded: {loadError}</div>}
            {loading && <p className="experience-help">Checking canonical product readiness…</p>}
            {data && (
              <>
                <div className="review-prototype-flow" aria-label="Product lifecycle">
                  <span className="complete">✓ Draft<small>You</small></span><i>→</i>
                  <span className="active">In QC<small>Content + rate check</small></span><i>→</i>
                  <span>Live<small>Sellable on all channels</small></span><i>⇄</i>
                  <span>Paused<small>Hidden, data kept</small></span>
                </div>
                <div className="experience-notice">
                  <b>{data.ready ? 'Ready for submission.' : 'Items need attention before submission.'}</b><br />
                  QC will also check spelling, image rights, and rate parity.
                </div>
                <div className="review-checklist">
                  {sectionLabels.map(([key, label, step]) => {
                    const item = data.sections[key];
                    const hasFulfilmentGap = item.reasonCodes.some((code) => code.startsWith('FULFILMENT_'));
                    const hasMediaGap = item.reasonCodes.some((code) => !code.startsWith('FULFILMENT_'));
                    const displayLabel = key === 'mediaFulfilment'
                      ? hasFulfilmentGap && hasMediaGap ? 'Photos & fulfilment' : hasFulfilmentGap ? 'Fulfilment' : 'Photos'
                      : label;
                    const fixStep = key === 'mediaFulfilment' && hasFulfilmentGap && !hasMediaGap ? 9 : step;
                    return <div className={`review-checklist-row ${item.ready ? 'ready' : 'attention'}`} key={key}>
                      <span className={`review-check-icon ${item.ready ? 'ready' : 'attention'}`}>{item.ready ? '✓' : '!'}</span>
                      <div className="review-check-content">
                        <b>{displayLabel}</b>
                        {item.ready ? <p>Configured and available to submit.</p> : <ul>{item.reasonCodes.map((code) => <li key={code}>{reasonLabels[code] || code.replaceAll('_', ' ').toLowerCase()}</li>)}</ul>}
                      </div>
                      <button type="button" className="link-button" onClick={() => onNavigate(fixStep as WizardStep)}>{item.ready ? 'Review' : 'Fix'}</button>
                    </div>;
                  })}
                </div>
                <div className="review-prototype-note">{data.ready ? 'All required sections are complete. Submit the draft for QC when you are ready.' : `${data.reasonCodes.length || 'Some'} item(s) block submission. Fix them before sending to QC.`}</div>
              </>
            )}
            <button type="button" className="btn" onClick={() => void load()} disabled={loading}>Refresh readiness</button>
            {locked && <div className="experience-notice"><b>This revision is read-only.</b> It is already under review or published; create a new working revision to make changes.</div>}
          </>
        )}
      </div>
      <details className="experience-step-card advanced-details review-fulfilment-details">
        <summary>Advanced fulfilment settings</summary>
        <p className="experience-help">Supplier operations and fulfilment evidence rules are kept here without changing the reference Review &amp; submit flow.</p>
        <FulfilmentSection value={fulfilment} locked={locked} onChange={onFulfilmentChange} onSave={onSaveDraft} />
      </details>
    </div>
  );
}
