import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Badge, Field } from '../Ui';
import type { WizardStepProps } from './types';

const productTypeCards: Array<[string, string, string, string, string]> = [['ATTRACTION', 'Attraction ticket', 'Theme park, museum, ASI monument', 'ACTIVITY', 'ATTRACTION'], ['GUIDED_TOUR', 'Guided tour', 'Day tour, walking tour, city tour', 'ACTIVITY', 'GUIDED_TOUR'], ['EXPERIENCE', 'Activity', 'Scuba, paragliding, trek, workshop', 'ACTIVITY', 'EXPERIENCE'], ['TRANSFER', 'Transfer / ferry', 'Point-to-point, seat map, sectors', 'TRANSFER', 'POINT_TO_POINT'], ['COMBO', 'Combo', 'Two or more products sold together', 'PACKAGE_ADDON', 'EXCURSION']];
const subTypeOptions: Record<string, string[]> = {
  ACTIVITY: ['EXPERIENCE', 'GUIDED_TOUR', 'ATTRACTION', 'TICKET_ONLY'],
  MEALS: ['RESTAURANT', 'DINING_EXPERIENCE', 'COOKING_CLASS'],
  TRANSFER: ['AIRPORT_TRANSFER', 'POINT_TO_POINT', 'SHUTTLE'],
  PACKAGE_ADDON: ['EXCURSION', 'EQUIPMENT_RENTAL', 'SERVICE_ADDON'],
  OTHERS: ['OTHER'],
};
const meetingOptions = [['FIXED_MEETING_POINT', 'Fixed meeting point'], ['PICKUP_AVAILABLE', 'Pickup available'], ['FLEXIBLE_ENTRY', 'Flexible entry']];
type Taxonomy = { id: string; code: string; name: string; subcategories: Array<{ id: string; code: string; name: string }> };

function productTypeSelected(cardKey: string, type: string, subType: string) {
  const normalizedSubType = subType.trim().toUpperCase().replaceAll(' ', '_');
  if (cardKey === 'TRANSFER') return type === 'TRANSFER';
  if (cardKey === 'COMBO') return type === 'PACKAGE_ADDON';
  if (cardKey === 'EXPERIENCE' && ['MEALS', 'OTHERS'].includes(type)) return true;
  if (type !== 'ACTIVITY') return false;
  if (cardKey === 'ATTRACTION') return ['ATTRACTION', 'TICKET_ONLY'].includes(normalizedSubType);
  if (cardKey === 'GUIDED_TOUR') return ['GUIDED_TOUR', 'GUIDED_EXPERIENCE', 'SIGHTSEEING'].includes(normalizedSubType);
  if (cardKey === 'EXPERIENCE') return !['ATTRACTION', 'TICKET_ONLY', 'GUIDED_TOUR', 'GUIDED_EXPERIENCE', 'SIGHTSEEING'].includes(normalizedSubType);
  return false;
}

export default function BasicInfoStep({ revisionForm: form, onRevisionChange: set, locked, snapshot, vendorNameOverride, adminContext = false, viewOnly = false }: WizardStepProps & { vendorNameOverride?: string }) {
  const [taxonomy, setTaxonomy] = useState<Taxonomy[]>([]);
  const [vendorName, setVendorName] = useState(vendorNameOverride || 'Current vendor account');
  useEffect(() => { void api.request<Taxonomy[]>('/vendor/activity-categories').then(setTaxonomy).catch(() => undefined); if (vendorNameOverride) { setVendorName(vendorNameOverride); return; } void api.request<{ displayName?: string | null; legalBusinessName?: string; tenant?: { name?: string }}>('/vendor/profile').then((profile) => setVendorName(profile.displayName || profile.legalBusinessName || profile.tenant?.name || 'Current vendor account')).catch(() => undefined); }, [vendorNameOverride]);
  const subtypeOptions = subTypeOptions[form.type] || [];
  const unsupportedLegacySubtype = Boolean(form.subType && !subtypeOptions.includes(form.subType));
  const selectedCategory = taxonomy.find((item) => item.code === form.category);
  const guideLanguages = form.guideLanguages.split(',').map((value) => value.trim()).filter(Boolean);
  const guideLanguageOptions = ['English', 'Hindi', 'Marathi', 'Konkani', 'Kannada', 'Tamil'];
  function selectProductType(subType: string, type: typeof form.type) { set('type', type); set('subType', subType); }
  function toggleGuideLanguage(language: string) {
    const next = guideLanguages.includes(language) ? guideLanguages.filter((value) => value !== language) : [...guideLanguages, language];
    set('guideLanguages', next.join(', '));
  }
  function toggleChannel(channel: string) {
    set('channels', form.channels.includes(channel) ? form.channels.filter((value) => value !== channel) : [...form.channels, channel]);
  }
  return <div className="experience-step-card">
    <div className="experience-card-heading"><div><h3>Basics</h3><p>Identity of the product. Product type controls which later steps appear.</p></div><Badge value={snapshot.revision?.status || 'DRAFT'} /></div>
    <div className="experience-divider" />
    <div className="experience-form-grid two">
      <div className="form-full"><Field label="Product type"><div className="product-type-cards">{productTypeCards.map(([cardKey, label, description, type, subType]) => { const legacyType = cardKey === 'EXPERIENCE' && form.type === 'MEALS' ? 'Meals · existing' : cardKey === 'EXPERIENCE' && form.type === 'OTHERS' ? 'Other product · existing' : label; const legacyDescription = cardKey === 'EXPERIENCE' && form.type === 'MEALS' ? 'Restaurant, dining experience, cooking class' : cardKey === 'EXPERIENCE' && form.type === 'OTHERS' ? `Existing product type · ${form.subType || 'Other'}` : description; const selected = productTypeSelected(cardKey, form.type, form.subType); return <button type="button" className={`product-type-card ${selected ? 'selected' : ''}`} aria-pressed={selected} key={cardKey} onClick={() => { if (!selected) selectProductType(subType, type as typeof form.type); }} disabled={locked}><b>{legacyType}</b><span>{legacyDescription}</span></button>; })}</div></Field></div>
      <div className="form-full"><Field label="Product title *" hint={`${form.productName.length} / 80 characters. Lead with the place, then the format.`}><input autoFocus maxLength={80} value={form.productName} onChange={(e) => set('productName', e.target.value)} disabled={locked} placeholder="e.g. Sunrise tea estate walk" /></Field></div>
      <Field label="Operated by" hint="🔒 Your business, shown on the listing."><input value={vendorName} readOnly /></Field>
      <Field label="Product code" hint="🔒 Generated automatically when the draft is created. Can't be edited."><input className="mono-input" value={snapshot.product?.publicCode || snapshot.product?.productCode || 'Generated when the draft is created'} readOnly /></Field>
      <Field label="Category *"><select value={form.category} onChange={(e) => { set('category', e.target.value); set('subCategory', ''); set('subCategories', []); }} disabled={locked}><option value="">Select a category</option>{taxonomy.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</select></Field>
      <Field label="Sub-category tags"><div className="product-tags">{selectedCategory?.subcategories.map((item) => { const selected = form.subCategories.includes(item.code); return <button type="button" className={`product-tag ${selected ? 'selected' : ''}`} key={item.id} onClick={() => { const next = selected ? form.subCategories.filter((value) => value !== item.code) : [...form.subCategories, item.code]; set('subCategories', next); set('subCategory', next[0] || ''); }} disabled={locked}>{item.name}</button>; }) || <small className="experience-help">Choose a category first.</small>}</div><small className="experience-help">Select all that apply.</small></Field>
      <div className="form-full"><Field label="Destination city *" hint="Use the customer-facing destination, for example: North Goa, Goa."><input value={[form.cityName, form.stateName].filter(Boolean).join(', ')} onChange={(e) => { const parts = e.target.value.split(',').map((value) => value.trim()); set('cityName', parts[0] || ''); set('stateName', parts[1] || ''); if (parts[2] !== undefined) set('countryName', parts.slice(2).join(', ')); }} disabled={locked} placeholder="City, state / region" /></Field></div>
      <Field label="Duration"><div className="inline-fields"><input type="number" min="0" value={form.durationValue} onChange={(e) => set('durationValue', e.target.value)} disabled={locked} placeholder="Duration" /><select value={form.durationUnit} onChange={(e) => set('durationUnit', e.target.value as typeof form.durationUnit)} disabled={locked}><option value="">Select</option><option value="HOURS">Hours</option><option value="DAYS">Days</option><option value="FLEXIBLE">Flexible</option></select></div></Field>
      <div className="form-full"><Field label="Guide"><div className="prototype-segmented-control" role="group" aria-label="Guide availability"><button type="button" className={form.guideIncluded === 'WITH_GUIDE' ? 'selected' : ''} onClick={() => set('guideIncluded', 'WITH_GUIDE')} disabled={locked}>With guide</button><button type="button" className={form.guideIncluded === 'WITHOUT_GUIDE' ? 'selected' : ''} onClick={() => set('guideIncluded', 'WITHOUT_GUIDE')} disabled={locked}>Without guide</button></div>{form.guideIncluded !== 'WITHOUT_GUIDE' && <div className="guide-language-picker"><span className="experience-help">Guide languages (select all that apply)</span><div className="product-tags">{guideLanguageOptions.map((language) => <button type="button" className={`product-tag ${guideLanguages.includes(language) ? 'selected' : ''}`} key={language} onClick={() => toggleGuideLanguage(language)} disabled={locked}>{language}</button>)}</div></div>}</Field></div>
      <details className="advanced-details form-full" open>
        <summary>Advanced marketplace metadata</summary>
        <div className="experience-advanced-content">
          <div className="experience-form-grid two">
            <Field label="Product currency *"><select value={form.currency} onChange={(e) => set('currency', e.target.value)} disabled={locked}><option value="INR">INR · Indian rupee</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · Pound sterling</option><option value="AED">AED · UAE dirham</option></select></Field>
            <Field label="Activity sub-type *"><select value={form.subType} onChange={(e) => set('subType', e.target.value)} disabled={locked}><option value="">Select a sub-type</option>{unsupportedLegacySubtype && <option value={form.subType}>{form.subType.replaceAll('_', ' ')} (existing)</option>}{subtypeOptions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></Field>
            <Field label="State / region *"><input value={form.stateName} onChange={(e) => set('stateName', e.target.value)} disabled={locked} placeholder="State / region" /></Field>
            <Field label="Country *"><input value={form.countryName} onChange={(e) => set('countryName', e.target.value)} disabled={locked} placeholder="Country" /></Field>
            <Field label="Meeting model *"><select value={form.meetingModel || ''} onChange={(e) => set('meetingModel', e.target.value as typeof form.meetingModel)} disabled={locked}><option value="">Select a meeting model</option>{meetingOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          </div>
        </div>
      </details>
    </div>
    {adminContext && viewOnly && <div className="experience-form-grid two form-full"><Field label="Channels"><div className="product-tags">{form.channels.length ? form.channels.map((channel) => <span className="product-tag selected" key={channel}>{({ WEBSITE_APP: 'Website & app', TRAVEL_AGENTS: 'Travel agents', API_PARTNERS: 'API partners' } as Record<string, string>)[channel] || channel.replaceAll('_', ' ')}</span>) : <span className="experience-help">No sales channels configured</span>}</div></Field></div>}
    {adminContext && !viewOnly && <div className="experience-form-grid two form-full"><Field label="Sell on"><div className="admin-choice-row"><label><input type="checkbox" checked={form.channels.includes('WEBSITE_APP')} onChange={() => toggleChannel('WEBSITE_APP')} disabled={locked} /> Website &amp; app</label><label><input type="checkbox" checked={form.channels.includes('TRAVEL_AGENTS')} onChange={() => toggleChannel('TRAVEL_AGENTS')} disabled={locked} /> Travel agents</label><label><input type="checkbox" checked={form.channels.includes('API_PARTNERS')} onChange={() => toggleChannel('API_PARTNERS')} disabled={locked} /> API partners</label></div></Field><Field label="Ranking boost"><select value={form.adminRankingBoost} onChange={(event) => set('adminRankingBoost', event.target.value as typeof form.adminRankingBoost)} disabled={locked}><option value="NONE">None</option><option value="PLUS_ONE">+1 (featured in city)</option><option value="PLUS_TWO">+2 (homepage carousel)</option></select><small className="experience-help">Applied to marketplace relevance ranking after destination and text matches.</small></Field></div>}
    <div className="experience-notice"><b>Next:</b> Describe the experience, add bookable options, then configure pricing and availability. You can save the draft at any time.</div>
  </div>;
}
