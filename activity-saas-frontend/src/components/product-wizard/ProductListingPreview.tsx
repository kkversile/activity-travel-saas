import { useState } from 'react';
import { API_BASE } from '../../api';
import type { RevisionForm, WizardSnapshot } from './types';
import { splitList } from './types';

export default function ProductListingPreview({ form, snapshot }: { form: RevisionForm; snapshot: WizardSnapshot }) {
  const cover = [...(snapshot.revision?.media || [])].filter(m => m.kind === 'IMAGE').sort((a,b) => a.rank - b.rank)[0];
  const source = cover?.externalUrl || (cover?.fileAssetId ? `${API_BASE}/files/public/${encodeURIComponent(cover.fileAssetId)}/content` : '');
  const [failedSource, setFailedSource] = useState('');
  const highlights = splitList(form.highlights).slice(0,3);
  const previewState = snapshot.revision?.status === 'UNDER_REVIEW' ? 'In QC · read-only' : snapshot.revision?.status === 'PUBLISHED' ? 'Published revision' : snapshot.revision?.status === 'REJECTED' ? 'Rejected revision' : 'Working draft';
  const options = snapshot.variants.filter(v => v.status !== 'ARCHIVED' && v.status !== 'INACTIVE');
  const duration = form.durationUnit === 'FLEXIBLE' ? 'Flexible duration' : form.durationValue && form.durationUnit ? `${form.durationValue} ${form.durationUnit === 'HOURS' ? Number(form.durationValue) === 1 ? 'hour' : 'hours' : Number(form.durationValue) === 1 ? 'day' : 'days'}` : '';
  return <aside id="experience-listing-preview" className="experience-listing-preview" aria-label="Your experience preview">
    <div className="listing-preview-heading"><h3>Your experience preview</h3><span>{previewState}</span></div>
    <div className="listing-preview-cover">{source && source !== failedSource ? <img src={source} alt={cover?.description || 'Saved experience cover'} onError={() => setFailedSource(source)} /> : <div><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 10h36v28H6zM6 32l10-10 8 7 7-9 11 12M32 17h.01" /></svg><span>{source ? 'Cover preview unavailable' : 'Your cover photo goes here'}</span><small>{source ? 'Your saved photo is retained.' : 'Add a photo in Photos to bring this to life.'}</small></div>}</div>
    <div className="listing-preview-copy"><p className="listing-preview-location">{[form.cityName,form.stateName].filter(Boolean).join(', ') || 'Choose your destination'}</p><h4>{form.productName.trim() || 'Your experience title'}</h4><p>{form.shortDescription.trim() || 'Add a short description to help guests imagine their day.'}</p>{duration && <span className="listing-preview-duration">{duration}</span>}{highlights.length > 0 && <ul>{highlights.map(text => <li key={text}>{text}</li>)}</ul>}
    <div className="listing-preview-options"><b>{options.length ? `${options.length} bookable ${options.length === 1 ? 'option' : 'options'}` : 'Next, add a bookable option'}</b><span>{options.length ? options.map(v => v.name).join(' · ') : 'Shared or private, with the right ticket types for your guests.'}</span></div>
    <p className="listing-preview-disclaimer">Content preview only. Rates, availability and review status are managed in their own sections. This does not publish your listing.</p></div>
  </aside>;
}
