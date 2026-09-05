import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Activity, type RatePlan } from '../api';
import { Badge, ErrorBox, Field, Panel, Toggle, money, shortDate } from '../components/Ui';

type Props = { activity?: Activity | null; onDone: () => void; onSaved: (activity: Activity) => void };

const empty = {
  productName: '', type: 'ACTIVITY' as Activity['type'], subType: 'TICKET_ONLY', description: '', shortDescription: '',
  subCategory: '', starRating: 0, cityName: 'Munnar', stateName: 'Kerala', countryName: 'INDIA', address: '', lat: '', lon: '', highlightsText: '', thingsToCarryText: '', importantInfoText: '', termsText: '',
};

export default function ActivityEditor({ activity, onDone, onSaved }: Props) {
  const initial = useMemo(() => activity ? {
    productName: activity.productName, type: activity.type, subType: activity.subType, description: activity.description,
    shortDescription: activity.shortDescription || '', subCategory: activity.subCategory || '', cityName: activity.cityName,
    stateName: activity.stateName, countryName: activity.countryName, address: activity.address || '', lat: activity.lat?.toString() || '', lon: activity.lon?.toString() || '', highlightsText: (activity.highlights || []).join('\n'), starRating: Number(activity.starRating || 0), thingsToCarryText: (activity.thingsToCarry || []).join('\n'), importantInfoText: (activity.importantInfo || []).join('\n'), termsText: (activity.terms || []).join('\n'),
  } : empty, [activity]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [media, setMedia] = useState<Array<{ id: string; kind: 'IMAGE' | 'VIDEO'; url: string; description?: string; rank: number }>>([]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaKind, setMediaKind] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [mediaDescription, setMediaDescription] = useState('');
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const mediaCountRef = useRef(0);
  const [showRate, setShowRate] = useState(false);

  useEffect(() => { setForm(initial); setError(''); }, [initial]);
  useEffect(() => {
    if (activity?.id) {
      Promise.all([
        api.request<RatePlan[]>(`/activities/${activity.id}/rate-plans`),
        api.request<Activity>(`/activities/${activity.id}`),
      ]).then(([plans, full]) => { setRatePlans(plans); setMedia(full.media || []); mediaCountRef.current = (full.media || []).length; }).catch(() => { setRatePlans([]); setMedia([]); mediaCountRef.current = 0; });
    } else { setRatePlans([]); setMedia([]); mediaCountRef.current = 0; }
  }, [activity?.id]);

  async function save() {
    setSaving(true); setError('');
    try {
      const payload = {
        productName: form.productName, type: form.type, subType: form.subType, description: form.description,
        shortDescription: form.shortDescription || undefined, subCategory: form.subCategory || undefined,
        cityName: form.cityName, stateName: form.stateName, countryName: form.countryName, address: form.address || undefined,
        highlights: form.highlightsText.split(/\n|~/).map((v) => v.trim()).filter(Boolean), channels: ['B2B', 'B2C'], labels: [], starRating: form.starRating || undefined, lat: form.lat ? Number(form.lat) : undefined, lon: form.lon ? Number(form.lon) : undefined, thingsToCarry: form.thingsToCarryText.split(/\n|~/).map((v) => v.trim()).filter(Boolean), importantInfo: form.importantInfoText.split(/\n|~/).map((v) => v.trim()).filter(Boolean), terms: form.termsText.split(/\n|~/).map((v) => v.trim()).filter(Boolean),
      };
      const saved = await api.request<Activity>(activity ? `/activities/${activity.id}` : '/activities', { method: activity ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      onSaved(saved);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function addMedia() {
    if (!activity || !mediaUrl.trim()) return;
    try {
      const created = await api.request<{ id: string; kind: 'IMAGE' | 'VIDEO'; url: string; description?: string; rank: number }>(`/activities/${activity.id}/media`, { method: 'POST', body: JSON.stringify({ kind: mediaKind, url: mediaUrl.trim(), description: mediaDescription.trim() || undefined, rank: mediaCountRef.current + 1 }) });
      mediaCountRef.current += 1; setMedia((current) => [...current, created]); setMediaUrl(''); setMediaDescription('');
    } catch (e) { setError((e as Error).message); }
  }

  async function uploadMedia(file: File) {
    if (!activity) return;
    if (file.size > 8 * 1024 * 1024) { setError('Media file must be 8MB or smaller.'); return; }
    setError('');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read media file')); reader.readAsDataURL(file);
    });
    try {
      const created = await api.request<{ id: string; kind: 'IMAGE' | 'VIDEO'; url: string; description?: string; rank: number }>(`/activities/${activity.id}/media/upload`, { method: 'POST', body: JSON.stringify({ kind: 'IMAGE', fileName: file.name, dataUrl, description: mediaDescription.trim() || undefined, rank: mediaCountRef.current + 1 }) });
      mediaCountRef.current += 1; setMedia((current) => [...current, created]); setMediaDescription('');
    } catch (e) { setError((e as Error).message); }
  }

  async function uploadGallery(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) await uploadMedia(file);
  }

  async function removeMedia(mediaId: string) {
    if (!activity) return;
    try { await api.request(`/activities/${activity.id}/media/${mediaId}`, { method: 'DELETE' }); setMedia(media.filter((m) => m.id !== mediaId)); }
    catch (e) { setError((e as Error).message); }
  }

  async function submit() {
    if (!activity) return;
    try { const saved = await api.request<Activity>(`/activities/${activity.id}/submit`, { method: 'POST' }); onSaved(saved); }
    catch (e) { setError((e as Error).message); }
  }

  async function publish() {
    if (!activity) return;
    try { const saved = await api.request<Activity>(`/activities/${activity.id}/publish`, { method: 'POST' }); onSaved(saved); }
    catch (e) { setError((e as Error).message); }
  }

  return <div className="editor-shell">
    <div className="editor-top"><div><button className="link-button" onClick={onDone}>← Back to listings</button><h2>{activity ? 'Edit Activity' : 'New Activity'}</h2></div>{activity && <Badge value={activity.status} />}</div>
    {error && <ErrorBox error={error} />}
    <div className="editor-layout"><aside className="editor-sections"><a href="#b-basic"><i>1</i>Basic Info</a><a href="#b-location"><i>2</i>Category & Location</a><a href="#b-media"><i>3</i>Media</a><a href="#b-logistics"><i>4</i>Logistics & Inclusions</a><a href="#b-rateplan"><i>5</i>Rate Plan & Travellers</a><a href="#b-policy"><i>6</i>Policies & Cancellation</a><a href="#b-avail"><i>7</i>Availability & Promo</a></aside><div className="editor-body">

    <Panel id="b-basic" title="1 · Basic Info">
      <div className="form-grid two">
        <Field label="Product Name"><input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} /></Field>
        <Field label="Status"><input value={activity?.status || 'DRAFT'} disabled /></Field>
        <Field label="Activity Type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Activity['type'] })}><option>ACTIVITY</option><option>MEALS</option><option>TRANSFER</option><option>PACKAGE_ADDON</option><option>OTHERS</option></select></Field>
        <Field label="Activity Sub-Type"><input value={form.subType} onChange={(e) => setForm({ ...form, subType: e.target.value })} /></Field>
        <Field label="Sub-Category"><input value={form.subCategory} onChange={(e) => setForm({ ...form, subCategory: e.target.value })} /></Field>
        <Field label="Star Rating"><input type="number" min={0} max={5} step={0.1} value={form.starRating} onChange={(e) => setForm({ ...form, starRating: Number(e.target.value) })} /></Field>
        <Field label="Short Description (Mobile)"><input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} /></Field>
      </div>
      <Field label="Full Description"><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Activity Highlights" hint="One per line; Excel ~ separated values are normalized here."><textarea rows={3} value={form.highlightsText} onChange={(e) => setForm({ ...form, highlightsText: e.target.value })} /></Field>
    </Panel>

    <Panel id="b-location" title="2 · Category & Location" className="mt16">
      <div className="form-grid three">
        <Field label="City"><input value={form.cityName} onChange={(e) => setForm({ ...form, cityName: e.target.value })} /></Field>
        <Field label="State"><input value={form.stateName} onChange={(e) => setForm({ ...form, stateName: e.target.value })} /></Field>
        <Field label="Country"><input value={form.countryName} onChange={(e) => setForm({ ...form, countryName: e.target.value })} /></Field>
      </div>
      <div className="form-grid three"><Field label="Address / Meeting Point"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field><Field label="Latitude"><input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></Field><Field label="Longitude"><input type="number" step="any" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} /></Field></div>
    </Panel>

    <Panel id="b-media" title="3 · Media" className="mt16">
      {!activity ? <p className="muted">Save the activity first, then add image/video URLs from the product master.</p> : <>
        <div className={`prototype-upload-card ${media.filter((m) => m.kind === 'IMAGE').length ? 'done' : ''}`}>
          <div className="upload-left"><span className="doc-icon">{media.filter((m) => m.kind === 'IMAGE').length ? '✓' : '+'}</span><div><b>Cover Image</b><small>1600×900 recommended · Rank 1</small></div></div>
          <label className="btn small">{media.filter((m) => m.kind === 'IMAGE').length ? 'Replace' : 'Upload'}<input ref={mediaInputRef} type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadMedia(file); e.currentTarget.value = ''; }} /></label>
        </div>
        <div className={`prototype-upload-card ${media.filter((m) => m.kind === 'IMAGE').length > 1 ? 'done' : ''}`}>
          <div className="upload-left"><span className="doc-icon">{media.filter((m) => m.kind === 'IMAGE').length > 1 ? '✓' : '+'}</span><div><b>Gallery — {Math.max(0, media.filter((m) => m.kind === 'IMAGE').length - 1)} images uploaded</b><small>Each image needs a short description for SEO</small></div></div>
          <label className="btn small">Manage<input type="file" accept="image/*" multiple hidden onChange={(e) => { void uploadGallery(e.target.files); e.currentTarget.value = ''; }} /></label>
        </div>
        <div className="prototype-upload-card">
          <div className="upload-left"><span className="doc-icon">+</span><div><b>Video Link</b><small>Optional — YouTube / Vimeo / hosted MP4 URL</small></div></div>
          <button className="btn accent small" onClick={() => { setMediaKind('VIDEO'); document.getElementById('media-url-entry')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Add Link</button>
        </div>
        <div id="media-url-entry" className="form-grid three media-entry"><Field label="Media Type"><select value={mediaKind} onChange={(e) => setMediaKind(e.target.value as 'IMAGE' | 'VIDEO')}><option>IMAGE</option><option>VIDEO</option></select></Field><Field label="Media URL"><input placeholder="https://..." value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} /></Field><Field label="SEO description"><input placeholder="Short description" value={mediaDescription} onChange={(e) => setMediaDescription(e.target.value)} /></Field><div className="media-add"><button className="btn accent" onClick={addMedia}>Add Media URL</button></div></div>
        <div className="media-preview-grid">{media.map((m) => <div className="media-preview-card" key={m.id}>{m.kind === 'IMAGE' ? <img src={m.url} alt={m.description || 'Activity media preview'} /> : <video src={m.url} controls preload="metadata" /> }<div className="media-preview-footer"><div><b>{m.rank === 1 ? 'Cover image' : `Gallery image ${m.rank - 1}`}</b><small className="truncate">{m.description || m.url}</small></div><button className="btn small" onClick={() => removeMedia(m.id)}>Remove</button></div></div>)}{media.length === 0 && <div className="muted">No media uploaded yet.</div>}</div>
      </>}
    </Panel>

    <Panel id="b-logistics" title="4 · Logistics & Inclusions" className="mt16">
      <p className="muted">Operational logistics are configured per rate plan because pickup, vehicle, duration and meal rules can differ by commercial plan.</p><div className="form-grid two"><Field label="Things to Carry" hint="One per line"><textarea rows={3} value={form.thingsToCarryText} onChange={(e) => setForm({ ...form, thingsToCarryText: e.target.value })} /></Field><Field label="Important Information" hint="One per line"><textarea rows={3} value={form.importantInfoText} onChange={(e) => setForm({ ...form, importantInfoText: e.target.value })} /></Field></div>
    </Panel>

    <Panel id="b-rateplan" title="5 · Rate Plan & Travellers" className="mt16" action={activity && <button className="btn small" onClick={() => setShowRate(!showRate)}>+ Add Rate Plan</button>}>
      {!activity && <p className="muted">Save the activity first, then add rate plans.</p>}
      {activity && ratePlans.length === 0 && !showRate && <p className="muted">No rate plans yet.</p>}
      {ratePlans.map((rp) => <div className="rate-card" key={rp.id}><div className="rate-head"><div><b>{rp.name} — {rp.ratePlanCode}</b><small>{shortDate(rp.validFrom)} → {shortDate(rp.validTo)}</small></div><Badge value={rp.status} /></div><div className="rate-meta"><span>{rp.currency} · {rp.unitType}</span><strong>{money(rp.basePrice)}</strong><span>{rp.minPax}–{rp.maxPax} pax</span><span>{rp.cutOffMinutes} min cutoff</span></div><div className="traveller-chips">{rp.travellerRules?.map((t) => <span key={t.type}>{t.displayName || t.type}: {t.minAge ?? 0}–{t.maxAge ?? 99} · {t.price ? money(t.price) : 'base rate'}</span>)}</div></div>)}
      {activity && showRate && <RatePlanForm activityId={activity.id} onCreated={(rp) => { setRatePlans([rp, ...ratePlans]); setShowRate(false); }} />}
    </Panel>

    <Panel id="b-policy" title="6 · Policies & Cancellation" className="mt16"><Field label="Terms & Conditions" hint="One per line"><textarea rows={3} value={form.termsText} onChange={(e) => setForm({ ...form, termsText: e.target.value })} /></Field><p className="muted">Cancellation slabs are stored per rate plan and validated as structured rules.</p></Panel>
    <Panel id="b-avail" title="7 · Availability & Promotions" className="mt16"><p className="muted">After a rate plan is active, manage date/slot capacity and promotions from the Availability screen.</p></Panel>

    <Panel id="b-policy-rules" title="Cancellation Rules" className="mt16"><CancellationEditor ratePlans={ratePlans} onUpdated={(next) => setRatePlans((prev) => prev.map((rp) => rp.id === next.id ? next : rp))} /></Panel>
    <div className="actions sticky-actions"><button className="btn" onClick={onDone}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Draft'}</button>{activity && ['DRAFT','INACTIVE'].includes(activity.status) && <button className="btn accent" onClick={submit}>Submit for Review</button>}{activity && activity.status !== 'LIVE' && <button className="btn accent" onClick={publish}>Publish Listing</button>}</div>
  </div></div></div>;
}

function CancellationEditor({ ratePlans, onUpdated }: { ratePlans: RatePlan[]; onUpdated: (rp: RatePlan) => void }) {
  const [selected, setSelected] = useState(ratePlans[0]?.id || '');
  const plan = ratePlans.find((rp) => rp.id === selected) || ratePlans[0];
  const rules = plan?.cancellationRules || [];
  if (!plan) return <p className="muted">Save the activity and add a rate plan first. Cancellation rules are managed here separately from traveller pricing.</p>;
  async function updateRule(index: number, field: 'minDaysBefore' | 'maxDaysBefore' | 'chargeValue', value: number) {
    const nextRules = rules.map((r, i) => i === index ? { ...r, [field]: value } : r);
    const updated = await api.request<RatePlan>(`/rate-plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ cancellationRules: nextRules }) });
    onUpdated(updated);
  }
  return <><Field label="Rate plan"><select value={plan.id} onChange={(e) => setSelected(e.target.value)}>{ratePlans.map((rp) => <option key={rp.id} value={rp.id}>{rp.name}</option>)}</select></Field><p className="muted">Cancellation rules are stored against the selected rate plan and do not control slot inventory.</p>{rules.map((r, i) => <div className="form-grid four" key={r.id || i}><Field label="Minimum days before"><input type="number" min={0} value={r.minDaysBefore} onChange={(e) => void updateRule(i, 'minDaysBefore', Number(e.target.value))} /></Field><Field label="Maximum days before"><input type="number" min={0} value={r.maxDaysBefore ?? ''} onChange={(e) => void updateRule(i, 'maxDaysBefore', Number(e.target.value))} /></Field><Field label="Charge %"><input type="number" min={0} max={100} value={r.chargeValue} onChange={(e) => void updateRule(i, 'chargeValue', Number(e.target.value))} /></Field><div className="muted">{i === 0 ? 'Early cancellation' : i === rules.length - 1 ? 'Same day' : 'Late cancellation'}</div></div>)}</>;
}

function RatePlanForm({ activityId, onCreated }: { activityId: string; onCreated: (rp: RatePlan) => void }) {
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    ratePlanCode: `RP-${Date.now().toString().slice(-6)}`, name: 'Standard Rate Plan', currency: 'INR', basePrice: 1499, childPrice: 999, seniorPrice: 1199,
    unitType: 'per_person', minPax: 1, maxPax: 15,
    validFrom: new Date().toISOString().slice(0,10), validTo: new Date(Date.now() + 365*86400000).toISOString().slice(0,10), durationMinutes: 240,
    inclusionsText: 'Guide / service as described', exclusionsText: 'Personal expenses',
    pickupIncluded: true, pickupTimings: '06:00 AM', dropoffIncluded: true, dropoffTimings: '10:30 AM', vehicleType: 'SUV (Innova/Xylo)',
    privateShared: 'Shared', ticketOnly: true, offlineVoucher: true, instantConfirmation: true, autoRedeem: false,
    pickupType: 'MEET_AT_PICKUP', pickupInput: 'Meeting point', cutOffMinutes: 120, adultRequired: true,
    cancelSixPlus: 0, cancelOneToFive: 50, cancelSameDay: 100, timeOfDay: 'Anytime', validDaysText: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY', blackoutDatesText: '',
  });

  async function create() {
    setError('');
    if (!form.ratePlanCode.trim() || !form.name.trim()) return setError('Rate plan ID and name are required.');
    if (form.validTo < form.validFrom) return setError('Valid To must be on or after Valid From.');
    if (form.maxPax < form.minPax) return setError('Max Pax cannot be lower than Min Pax.');
    try {
      const payload = {
        ratePlanCode: form.ratePlanCode.trim(), name: form.name.trim(), basePrice: form.basePrice, currency: form.currency.trim().toUpperCase(), unitType: form.unitType,
        minPax: form.minPax, maxPax: form.maxPax, validFrom: form.validFrom, validTo: form.validTo,
        durationMinutes: form.durationMinutes, timeOfDay: form.timeOfDay, pickupIncluded: form.pickupIncluded, pickupTimings: form.pickupTimings,
        dropoffIncluded: form.dropoffIncluded, dropoffTimings: form.dropoffTimings, vehicleType: form.vehicleType,
        privateShared: form.privateShared, ticketOnly: form.ticketOnly, offlineVoucher: form.offlineVoucher,
        instantConfirmation: form.instantConfirmation, autoRedeem: form.autoRedeem, pickupType: form.pickupType,
        pickupInput: form.pickupInput, cutOffMinutes: form.cutOffMinutes, adultRequired: form.adultRequired, validDays: form.validDaysText.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean), blackoutDates: form.blackoutDatesText.split(',').map((v) => v.trim()).filter(Boolean),
        status: 'ACTIVE',
        inclusions: form.inclusionsText.split(/\n|~/).map((v) => v.trim()).filter(Boolean),
        exclusions: form.exclusionsText.split(/\n|~/).map((v) => v.trim()).filter(Boolean),
        minAdultRequired: form.adultRequired ? 1 : 0,
        travellerRules: [
          { type: 'ADULT', displayName: 'Adult', minAge: 12, maxAge: 99, minCount: form.adultRequired ? 1 : 0, maxCount: form.maxPax, price: form.basePrice },
          { type: 'CHILD', displayName: 'Child', minAge: 5, maxAge: 11, minCount: 0, maxCount: form.maxPax, price: form.childPrice },
          { type: 'SENIOR', displayName: 'Senior', minAge: 60, maxAge: 120, minCount: 0, maxCount: form.maxPax, price: form.seniorPrice },
        ],
        cancellationRules: [
          { minDaysBefore: 6, chargeValue: form.cancelSixPlus, chargeType: 'PERCENTAGE' },
          { minDaysBefore: 1, maxDaysBefore: 5, chargeValue: form.cancelOneToFive, chargeType: 'PERCENTAGE' },
          { minDaysBefore: 0, maxDaysBefore: 0, chargeValue: form.cancelSameDay, chargeType: 'PERCENTAGE' },
        ],
      };
      const created = await api.request<RatePlan>(`/activities/${activityId}/rate-plans`, { method: 'POST', body: JSON.stringify(payload) });
      onCreated(created);
    } catch (e) { setError((e as Error).message); }
  }

  return <div className="rate-form">{error && <ErrorBox error={error} />}
    <div className="form-grid four">
      <Field label="Rateplan ID"><input value={form.ratePlanCode} onChange={(e) => setForm({ ...form, ratePlanCode: e.target.value })} /></Field>
      <Field label="Rateplan name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Currency"><input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field>
      <Field label="Unit Type"><select value={form.unitType} onChange={(e) => setForm({ ...form, unitType: e.target.value })}><option value="per_person">per_person</option><option value="per_unit">per_unit</option></select></Field>
      <Field label="Adult / Base Price"><input type="number" min={0} value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })} /></Field>
      <Field label="Child Price"><input type="number" min={0} value={form.childPrice} onChange={(e) => setForm({ ...form, childPrice: Number(e.target.value) })} /></Field>
      <Field label="Senior Price"><input type="number" min={0} value={form.seniorPrice} onChange={(e) => setForm({ ...form, seniorPrice: Number(e.target.value) })} /></Field>
      <Field label="Valid From"><input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field>
      <Field label="Valid To"><input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></Field>
      <Field label="Duration (minutes)"><input type="number" min={0} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></Field>
      <Field label="Min Pax"><input type="number" min={1} value={form.minPax} onChange={(e) => setForm({ ...form, minPax: Number(e.target.value) })} /></Field>
      <Field label="Max Pax"><input type="number" min={1} value={form.maxPax} onChange={(e) => setForm({ ...form, maxPax: Number(e.target.value) })} /></Field>
      <Field label="Booking Cut-off (minutes)"><input type="number" min={0} value={form.cutOffMinutes} onChange={(e) => setForm({ ...form, cutOffMinutes: Number(e.target.value) })} /></Field>
      <Field label="Time of Day"><input value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} /></Field>
      <Field label="Private / Shared"><select value={form.privateShared} onChange={(e) => setForm({ ...form, privateShared: e.target.value })}><option>Shared</option><option>Private</option></select></Field>
      <Field label="Vehicle Type"><input value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} /></Field>
      <Field label="Pickup Timings"><input value={form.pickupTimings} onChange={(e) => setForm({ ...form, pickupTimings: e.target.value })} /></Field>
      <Field label="Drop-off Timings"><input value={form.dropoffTimings} onChange={(e) => setForm({ ...form, dropoffTimings: e.target.value })} /></Field>
      <Field label="Pickup Type"><input value={form.pickupType} onChange={(e) => setForm({ ...form, pickupType: e.target.value })} /></Field>
      <Field label="Pickup Details"><input value={form.pickupInput} onChange={(e) => setForm({ ...form, pickupInput: e.target.value })} /></Field>
    </div>
    <div className="form-grid two">
      <Field label="Inclusions" hint="One per line"><textarea rows={3} value={form.inclusionsText} onChange={(e) => setForm({ ...form, inclusionsText: e.target.value })} /></Field>
      <Field label="Exclusions" hint="One per line"><textarea rows={3} value={form.exclusionsText} onChange={(e) => setForm({ ...form, exclusionsText: e.target.value })} /></Field>
    </div>
    <div className="form-grid two"><Field label="Valid Days of Week" hint="Comma-separated day names"><input value={form.validDaysText} onChange={(e) => setForm({ ...form, validDaysText: e.target.value })} /></Field><Field label="Blackout Dates" hint="Comma-separated ISO dates"><input placeholder="2026-10-02" value={form.blackoutDatesText} onChange={(e) => setForm({ ...form, blackoutDatesText: e.target.value })} /></Field></div>
    <div className="form-grid two">
      <Toggle checked={form.instantConfirmation} onChange={(v) => setForm({ ...form, instantConfirmation: v })} label="Instant Confirmation" />
      <Toggle checked={form.offlineVoucher} onChange={(v) => setForm({ ...form, offlineVoucher: v })} label="Offline Voucher Accepted" />
      <Toggle checked={form.pickupIncluded} onChange={(v) => setForm({ ...form, pickupIncluded: v })} label="Pickup Included" />
      <Toggle checked={form.dropoffIncluded} onChange={(v) => setForm({ ...form, dropoffIncluded: v })} label="Drop-off Included" />
      <Toggle checked={form.adultRequired} onChange={(v) => setForm({ ...form, adultRequired: v })} label="Adult Required" />
      <Toggle checked={form.ticketOnly} onChange={(v) => setForm({ ...form, ticketOnly: v })} label="Ticket Only" />
      <Toggle checked={form.autoRedeem} onChange={(v) => setForm({ ...form, autoRedeem: v })} label="Auto-Redeem Voucher" />
    </div>
    <div className="actions"><button className="btn accent" onClick={create}>Create Rate Plan</button></div>
  </div>;
}
