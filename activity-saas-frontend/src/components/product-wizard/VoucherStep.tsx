import { Field } from '../Ui';
import { useEffect, useState } from 'react';
import { api, type Schedule } from '../../api';
import type { WizardStepProps } from './types';
import { voucherSample } from './voucherSample';

const codeSourceLabels: Record<string, string> = { PLATFORM: 'System-generated QR', SUPPLIER_BARCODE_POOL: 'Supplier barcode pool', SUPPLIER_API: 'Supplier API', NONE: 'No code; supplier name list' };
const acceptedAsLabels: Record<string, string> = { MOBILE_VOUCHER: 'Mobile or printed', PRINTED_VOUCHER: 'Printed only', BOOKING_REFERENCE: 'Booking reference at counter' };

export default function VoucherStep({ revisionForm: form, locked, onRevisionChange: set, snapshot }: WizardStepProps) {
  const productName = form.productName.trim() || snapshot.revision?.productName || 'Your marketplace experience';
  const optionId = snapshot.variants.find(variant => variant.status === 'ACTIVE')?.id;
  const [availability, setAvailability] = useState<{ variantId: string; schedules: Schedule[] } | null>(null);
  useEffect(() => {
    if (!optionId || snapshot.schedules.some(schedule => schedule.variantId === optionId)) return;
    let active = true;
    void api.request<Schedule[]>(`/variants/${encodeURIComponent(optionId)}/schedules`).then(schedules => {
      if (active) setAvailability({ variantId: optionId, schedules: Array.isArray(schedules) ? schedules : [] });
    }).catch(() => { if (active) setAvailability({ variantId: optionId, schedules: [] }); });
    return () => { active = false; };
  }, [optionId]);
  const sample = voucherSample({ ...snapshot, schedules: availability && availability.variantId === optionId ? [...snapshot.schedules, ...availability.schedules.filter(schedule => !snapshot.schedules.some(existing => existing.id === schedule.id))] : snapshot.schedules });
  const codeSource = form.voucherCodeSource || 'PLATFORM';
  const acceptedAs = form.voucherAcceptedAs || 'MOBILE_VOUCHER';
  const previewCode = codeSource === 'NONE' ? 'Example name list' : codeSource === 'PLATFORM' ? 'SAMPLE-ONLY' : 'Example supplier code';
  return <div className="experience-step-stack">
    <div className="experience-step-card">
      <div className="experience-card-heading"><div><h3>Voucher &amp; redemption</h3><p>What the customer shows at the gate or pickup, and where the code comes from.</p></div></div>
      <div className="experience-divider" />
      <div className="experience-form-grid two">
        <Field label="Code source"><select value={codeSource} onChange={event => set('voucherCodeSource', event.target.value as typeof form.voucherCodeSource)} disabled={locked}>
          <option value="PLATFORM">System-generated QR (we issue)</option><option value="SUPPLIER_BARCODE_POOL">Supplier barcode pool (upload CSV)</option><option value="SUPPLIER_API">Supplier API returns code</option><option value="NONE">No code, name list sent to supplier</option>
        </select></Field>
        <Field label="Voucher accepted as"><select value={acceptedAs} onChange={event => set('voucherAcceptedAs', event.target.value as typeof form.voucherAcceptedAs)} disabled={locked}>
          <option value="MOBILE_VOUCHER">Mobile or printed</option><option value="PRINTED_VOUCHER">Printed only</option><option value="BOOKING_REFERENCE">Exchange at counter for physical ticket</option>
        </select></Field>
        <div className="form-full"><Field label="Redemption instructions"><textarea rows={5} value={form.voucherInstructions} onChange={event => set('voucherInstructions', event.target.value)} disabled={locked} placeholder="Explain where guests should present their voucher and when to arrive." /></Field></div>
      </div>
    </div>
    <section className="experience-step-card prototype-voucher-preview" aria-label="Sample voucher preview">
      <div className="experience-card-heading"><div><h4>Sample voucher preview</h4><p>Illustration using your current option and voucher settings. No booking or redeemable voucher is created.</p></div></div>
      <div className="prototype-voucher-body"><div>
        <small className="prototype-voucher-label">Sample booking · <code>SAMPLE-BOOKING</code></small>
        <h4>{productName}</h4><p>{sample.optionName}<br />{sample.dateLabel}</p>
        <p>{sample.ticketLabel}<br />Guest: Sample guest</p>
        <small>Code source: {codeSourceLabels[codeSource] || codeSource} · Accepted as: {acceptedAsLabels[acceptedAs] || acceptedAs}</small>
        <p>{form.voucherInstructions || 'Add redemption instructions.'}</p>
        <small>Illustrative only. Date, time, tickets and availability are confirmed during booking.</small>
      </div><div className="prototype-voucher-code"><div aria-hidden="true">▦</div><code>{previewCode}</code><span className="experience-pill">Not for redemption</span></div></div>
    </section>
  </div>;
}
