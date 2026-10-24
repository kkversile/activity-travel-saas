import { Badge, Field } from '../Ui';
import type { WizardStepProps } from './types';

const productTypeOptions = [['ACTIVITY', 'Activity'], ['MEALS', 'Meals'], ['TRANSFER', 'Transfer'], ['PACKAGE_ADDON', 'Package add-on'], ['OTHERS', 'Other']];
const subTypeOptions: Record<string, string[]> = {
  ACTIVITY: ['EXPERIENCE', 'GUIDED_TOUR', 'ATTRACTION', 'TICKET_ONLY'],
  MEALS: ['RESTAURANT', 'DINING_EXPERIENCE', 'COOKING_CLASS'],
  TRANSFER: ['AIRPORT_TRANSFER', 'POINT_TO_POINT', 'SHUTTLE'],
  PACKAGE_ADDON: ['EXCURSION', 'EQUIPMENT_RENTAL', 'SERVICE_ADDON'],
  OTHERS: ['OTHER'],
};
const subCategorySuggestions = ['Nature & culture', 'Outdoor sports / activities', 'Food & dining', 'Transfers', 'Attractions', 'Family activities'];
const meetingOptions = [['FIXED_MEETING_POINT', 'Fixed meeting point'], ['PICKUP_AVAILABLE', 'Pickup available'], ['FLEXIBLE_ENTRY', 'Flexible entry']];

export default function BasicInfoStep({ revisionForm: form, onRevisionChange: set, locked, snapshot }: WizardStepProps) {
  const subtypeOptions = subTypeOptions[form.type] || [];
  const unsupportedLegacySubtype = Boolean(form.subType && !subtypeOptions.includes(form.subType));
  return <div className="experience-step-card">
    <div className="experience-card-heading"><div><h3>1 · Basic information</h3><p>Start with the canonical experience—not a rate plan.</p></div><Badge value={snapshot.revision?.status || 'DRAFT'} /></div>
    <div className="experience-divider" />
    <div className="experience-form-grid two">
      <div className="form-full"><Field label="Product name *"><input autoFocus value={form.productName} onChange={(e) => set('productName', e.target.value)} disabled={locked} placeholder="e.g. Sunrise tea estate walk" /></Field></div>
      <Field label="Type *"><select value={form.type} onChange={(e) => { set('type', e.target.value as typeof form.type); if (!subTypeOptions[e.target.value]?.includes(form.subType)) set('subType', ''); }} disabled={locked}><option value="">Select a product type</option>{productTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Activity sub-type *"><select value={form.subType} onChange={(e) => set('subType', e.target.value)} disabled={locked}><option value="">Select a sub-type</option>{unsupportedLegacySubtype && <option value={form.subType}>{form.subType.replaceAll('_', ' ')} (existing)</option>}{subtypeOptions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></Field>
      <div className="form-full"><Field label="Sub-category *"><input list="product-subcategories" value={form.subCategory} onChange={(e) => set('subCategory', e.target.value)} disabled={locked} placeholder="e.g. Nature & culture" /></Field><datalist id="product-subcategories">{subCategorySuggestions.map((value) => <option key={value} value={value} />)}</datalist></div>
      <Field label="Destination *"><div className="destination-fields"><input value={form.cityName} onChange={(e) => set('cityName', e.target.value)} disabled={locked} placeholder="City" aria-label="City" /><input value={form.stateName} onChange={(e) => set('stateName', e.target.value)} disabled={locked} placeholder="State / region" aria-label="State or region" /><input value={form.countryName} onChange={(e) => set('countryName', e.target.value)} disabled={locked} placeholder="Country" aria-label="Country" /></div></Field>
      <Field label="Meeting model *"><select value={form.meetingModel || ''} onChange={(e) => set('meetingModel', e.target.value as typeof form.meetingModel)} disabled={locked}><option value="">Select a meeting model</option>{meetingOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <div className="form-full"><Field label="Short marketplace description *"><textarea rows={3} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} disabled={locked} placeholder="A concise description for marketplace cards." /></Field></div>
    </div>
    <div className="experience-divider" />
    <h3 className="experience-section-title">Example options</h3>
    <p className="experience-help">Guidance only. These examples do not create database records.</p>
    <div className="example-option-grid"><div className="example-option"><div className="experience-card-heading"><b>Standard Shared · 2 hours</b><span className="experience-pill success">Suggested</span></div><small>Capacity: 15 people · Instant confirmation · Adult / Child pricing</small></div><div className="example-option"><div className="experience-card-heading"><b>Private Guide · 2 hours</b><span className="experience-pill">Optional</span></div><small>Capacity: 1 booking · On-request confirmation · Group pricing</small></div></div>
    <div className="experience-notice"><b>Product architecture:</b> Product → Option/Variant → Rate Plan → Schedule/Inventory. This keeps Voya ready for multi-channel distribution later.</div>
  </div>;
}
