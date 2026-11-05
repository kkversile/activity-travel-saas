import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox } from '../components/Ui';
import ExperienceWizardModal from '../components/product-wizard/ExperienceWizardModal';

type Vendor = { id: string; name: string; vendorProfile?: { legalBusinessName?: string | null } | null };
type AdminActivityForm = {
  tenantId: string; productName: string; type: string; subType: string; cityName: string;
  stateName: string; countryName: string; description: string; channels: string[];
  rankingBoost: string; marginOverride: string; marginModel: 'MARKUP_FIXED' | 'MARKUP_PERCENT';
  marginValue: string; approvalMode: string; internalNote: string;
};
const initialForm: AdminActivityForm = {
  tenantId: '', productName: '', type: 'ACTIVITY', subType: 'Guided experience',
  cityName: '', stateName: '', countryName: 'India', description: '',
  channels: ['WEBSITE_APP', 'TRAVEL_AGENTS'], rankingBoost: 'NONE',
  marginOverride: 'USE_PRICING_RULES', marginModel: 'MARKUP_PERCENT', marginValue: '',
  approvalMode: 'SEND_TO_QC', internalNote: '',
};

export default function AdminProductCreatePanel({ onCreated, canPublishDirectly = false, initialVendorId, openOnLoad = false }: { onCreated: () => void; canPublishDirectly?: boolean; initialVendorId?: string; openOnLoad?: boolean }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<AdminActivityForm>(initialForm);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);

  useEffect(() => {
    api.request<Vendor[]>('/admin/vendors').then(setVendors).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!initialVendorId) return;
    setForm((current) => ({ ...current, tenantId: initialVendorId }));
    if (openOnLoad) setOpen(true);
  }, [initialVendorId, openOnLoad]);

  const update = <K extends keyof AdminActivityForm>(key: K, value: AdminActivityForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleChannel = (channel: string) => setForm((current) => ({ ...current, channels: current.channels.includes(channel) ? current.channels.filter((item) => item !== channel) : [...current.channels, channel] }));
  const marginValueNumber = Number(form.marginValue);
  const marginValueFormatValid = /^\d+(\.\d{1,4})?$/.test(form.marginValue);
  const marginValid = form.marginOverride !== 'CUSTOM_RULE' || (
    marginValueFormatValid && Number.isFinite(marginValueNumber) && marginValueNumber > 0 &&
    (form.marginModel === 'MARKUP_FIXED' || marginValueNumber <= 100)
  );

  async function create() {
    setBusy(true); setError(''); setNotice('');
    try {
      const { marginModel, marginValue, ...draftForm } = form;
      const created = await api.request<{ productId: string }>('/admin/products', { method: 'POST', body: JSON.stringify(draftForm) });
      setCreatedProductId(created.productId);
      setOpen(false);
      setForm({ ...initialForm, tenantId: initialVendorId || '' });
      onCreated();

      if (form.marginOverride === 'CUSTOM_RULE') {
        const config = marginModel === 'MARKUP_FIXED'
          ? { model: marginModel, fixedAmount: marginValue }
          : { model: marginModel, percent: marginValue };
        await api.request('/admin/commercial-rules/with-initial-version', {
          method: 'POST',
          body: JSON.stringify({
            rule: {
              code: `ACTIVITY-MARGIN-${created.productId}`,
              name: `Activity margin override: ${form.productName.trim()}`,
              kind: 'VOYA_REVENUE', scopeType: 'PRODUCT', productId: created.productId,
            },
            version: { effectiveFrom: new Date().toISOString(), priority: 0, stackingMode: 'EXCLUSIVE', config },
          }),
        });
        setNotice('Activity created. Its product margin rule is saved as a draft and needs approval from a different Admin before it takes effect.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const vendorName = (vendor: Vendor) => vendor.vendorProfile?.legalBusinessName || vendor.name;
  return <>
    {error && <ErrorBox error={error} />}
    {notice && <div className="alert success" role="status">{notice}</div>}
    <div className="admin-hero"><div><h2>Activities</h2><p className="muted">All activities from all vendors. Admins can create on a vendor's behalf and edit anything a vendor uploaded.</p></div><button className="btn primary" onClick={() => setOpen((value) => !value)}>+ Create activity</button></div>
    {open && <section className="panel"><div className="panel-head"><h3>Create activity for a vendor</h3><span className="muted">Choose the vendor and the activity identity. The remaining content, options, rates, availability and policies are completed in the same 9-step wizard vendors use.</span></div><div className="panel-body"><div className="form-grid four">
      <label className="field"><span>Vendor</span><select value={form.tenantId} onChange={(e) => update('tenantId', e.target.value)}><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendorName(vendor)}</option>)}</select></label>
      <label className="field"><span>Activity name</span><input value={form.productName} onChange={(e) => update('productName', e.target.value)} /></label>
      <label className="field"><span>Type</span><select value={form.type} onChange={(e) => update('type', e.target.value)}><option value="ACTIVITY">Activity</option><option value="MEALS">Meals</option><option value="TRANSFER">Transfer</option><option value="PACKAGE_ADDON">Package add-on</option><option value="OTHERS">Other</option></select></label>
      <label className="field"><span>Sub-type</span><input value={form.subType} onChange={(e) => update('subType', e.target.value)} /></label>
      <label className="field"><span>City</span><input value={form.cityName} onChange={(e) => update('cityName', e.target.value)} /></label>
      <label className="field"><span>State / region</span><input value={form.stateName} onChange={(e) => update('stateName', e.target.value)} /></label>
      <label className="field"><span>Country</span><input value={form.countryName} onChange={(e) => update('countryName', e.target.value)} /></label>
      <label className="field"><span>Description</span><input value={form.description} onChange={(e) => update('description', e.target.value)} /></label>
      <div className="field"><span>Sell on</span><div className="admin-choice-row"><label><input type="checkbox" checked={form.channels.includes('WEBSITE_APP')} onChange={() => toggleChannel('WEBSITE_APP')} /> Website &amp; app</label><label><input type="checkbox" checked={form.channels.includes('TRAVEL_AGENTS')} onChange={() => toggleChannel('TRAVEL_AGENTS')} /> Travel agents</label><label><input type="checkbox" checked={form.channels.includes('API_PARTNERS')} onChange={() => toggleChannel('API_PARTNERS')} /> API partners</label></div></div>
      <label className="field"><span>Ranking boost</span><select value={form.rankingBoost} onChange={(e) => update('rankingBoost', e.target.value)}><option value="NONE">None</option><option value="PLUS_ONE">+1 (featured in city)</option><option value="PLUS_TWO">+2 (homepage carousel)</option></select></label>
      <label className="field"><span>Margin override</span><select value={form.marginOverride} onChange={(e) => update('marginOverride', e.target.value)}><option value="USE_PRICING_RULES">Use pricing rules</option><option value="CUSTOM_RULE">Custom Voya rule</option></select></label>
      {form.marginOverride === 'CUSTOM_RULE' && <div className="admin-margin-config"><div className="form-grid two">
        <label className="field"><span>Margin model</span><select value={form.marginModel} onChange={(e) => update('marginModel', e.target.value as AdminActivityForm['marginModel'])}><option value="MARKUP_PERCENT">Percent of vendor payable</option><option value="MARKUP_FIXED">Fixed amount per booking</option></select></label>
        <label className="field"><span>{form.marginModel === 'MARKUP_FIXED' ? 'Amount (INR)' : 'Percent'}</span><input type="number" min="0.0001" max={form.marginModel === 'MARKUP_PERCENT' ? 100 : undefined} step="0.0001" value={form.marginValue} onChange={(e) => update('marginValue', e.target.value)} /></label>
      </div><small className="muted">Saved as a product-scoped draft pricing rule. A different Admin must approve it before it affects quotes.</small></div>}
      <label className="field"><span>Approval</span><select value={form.approvalMode} onChange={(e) => update('approvalMode', e.target.value)}><option value="SEND_TO_QC">Send to QC</option>{canPublishDirectly && <option value="PUBLISH_DIRECTLY">Publish directly</option>}</select><small className="muted">{canPublishDirectly ? 'Super admin may publish directly; standard admins send activities to QC.' : 'Standard admins can send activities to QC. Direct publishing requires a permitted role.'}</small></label>
      <label className="field"><span>Internal note</span><input value={form.internalNote} onChange={(e) => update('internalNote', e.target.value)} placeholder="Visible only to staff" /></label>
    </div><div className="modal-actions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy || !marginValid || !form.tenantId || !form.productName.trim() || !form.cityName.trim() || !form.stateName.trim()} onClick={() => void create()}>{busy ? 'Creating…' : 'Create activity and continue'}</button></div></div></section>}
    {createdProductId && <ExperienceWizardModal product={{ id: createdProductId } as any} adminContext onDone={() => { setCreatedProductId(null); onCreated(); }} onChanged={onCreated} />}
  </>;
}
