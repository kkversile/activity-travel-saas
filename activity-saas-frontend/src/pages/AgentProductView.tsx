import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Loading, money, shortDate } from '../components/Ui';
import type { AgentSearchContext } from './AgentMarketplace';
import { activityMediaUrl, minimumActivityPrice } from './AgentActivityCards';
import BookingWizard from './BookingWizard';

type ActivityDetail = {
  id: string;
  name: string;
  productCode?: string;
  type?: string;
  subType?: string;
  subCategory?: string | null;
  starRating?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  highlights?: string[];
  inclusions?: string[];
  exclusions?: string[];
  terms?: string[];
  importantInfo?: string[];
  thingsToCarry?: string[];
  safetyMeasures?: string[];
  howToRedeem?: string[];
  additionalInfo?: string[];
  faqs?: Array<{ question?: string; answer?: string; title?: string; content?: string } | string>;
  bookingQuestions?: Array<{ code: string; label: string; helpText?: string | null; required?: boolean; appliesPerTraveller?: boolean; type?: string }>;
  meetingModel?: string | null;
  meetingPoint?: string | null;
  address?: string | null;
  coordinates?: { lat: number; lon: number } | null;
  destination?: { city?: string; state?: string; country?: string };
  media?: Array<{ id: string; url: string; kind?: string; description?: string | null }>;
  variants?: Array<{
    id: string; name: string; variantCode?: string; description?: string | null;
    durationMinutes?: number | null; privateShared?: string | null;
    minPax?: number | null; maxPax?: number | null; cutOffMinutes?: number | null;
    vehicleType?: string | null; pickupIncluded?: boolean; pickupType?: string | null;
    pickupInput?: string | null; pickupTimings?: string | null;
    dropoffIncluded?: boolean; dropoffTimings?: string | null;
    mealIncluded?: boolean; mealType?: string | null; mealVariety?: string | null;
    menu?: string[]; pointsOfInterest?: string[]; inclusions?: string[]; exclusions?: string[];
    suitableFor?: string[];
    offers?: Array<{
      ratePlanId: string; sessionId: string; serviceDate: string;
      name?: string; localStartTime?: string | null; localEndTime?: string | null;
      bookingMode?: string | null;
      price?: { finalAmount?: number | string | null; currency?: string | null } | null;
      availability?: { availableCapacity?: number | null } | null;
    }>;
  }>;
};

function readable(value?: string | null) {
  return value ? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
}

function ListSection({ title, items, excluded = false }: { title: string; items?: string[]; excluded?: boolean }) {
  const values = (items || []).map((value) => value?.trim()).filter(Boolean);
  if (!values.length) return null;
  return <section className="voya-detail-panel"><h3>{title}</h3><ul className={`voya-detail-list ${excluded ? 'excluded' : ''}`}>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>;
}

function DetailValue({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return <div className="voya-detail-attribute"><small>{label}</small><b>{value}</b></div>;
}

export default function AgentProductView({
  productId, context, onBack, canBook,
}: {
  productId: string;
  context: AgentSearchContext;
  onBack: () => void;
  canBook: boolean;
}) {
  const [product, setProduct] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    let active = true;
    setProduct(null);
    setSelected(null);
    setError('');
    api.request<ActivityDetail>(`/marketplace/products/${productId}/view`, {
      method: 'POST',
      body: JSON.stringify(context),
    })
      .then((data) => { if (active) setProduct(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [productId, context]);

  if (error) return <><button className="voya-detail-back" type="button" onClick={onBack}>← Back to activities</button><ErrorBox error={error} /></>;
  if (!product) return <Loading text="Loading published activity details…" />;
  if (selected) return <BookingWizard product={product} offer={selected} context={context} onDone={() => setSelected(null)} />;

  const destination = [product.destination?.city, product.destination?.state, product.destination?.country].filter(Boolean).join(', ');
  const images = (product.media || []).filter((media) => media.kind === 'IMAGE' && activityMediaUrl(media.url));
  const videos = (product.media || []).filter((media) => media.kind === 'VIDEO' && activityMediaUrl(media.url));
  const variants = product.variants || [];
  const price = minimumActivityPrice({ id: product.id, name: product.name, variants: variants.map((variant) => ({ ...variant, offers: variant.offers || [] })) });
  const rating = Number(product.starRating);
  const faqs = (product.faqs || []).map((item) => typeof item === 'string' ? { question: item, answer: '' } : { question: item.question || item.title || '', answer: item.answer || item.content || '' }).filter((item) => item.question);
  const questions = product.bookingQuestions || [];
  const media = images.slice(0, 3);

  return <div className="voya-detail-page">
    <button type="button" className="voya-detail-back" onClick={onBack}>← Back to activities</button>
    <span className="voya-detail-overline">{[product.type, product.subCategory || product.subType].filter(Boolean).map(readable).join(' · ') || 'VOYA EXPERIENCE'}</span>
    <h1 className="voya-detail-title">{product.name}</h1>
    <div className="voya-detail-subline">
      {destination && <span>⌖ {destination}</span>}
      <span>◷ {shortDate(context.serviceDate)}</span>
      {Number.isFinite(rating) && rating > 0 && <span className="voya-detail-rating">★ {rating.toFixed(1)}</span>}
      <span>{context.travellers.map((t) => `${t.quantity} ${readable(t.travellerType)}`).join(', ')}</span>
    </div>
    <div className={`voya-detail-gallery ${media.length === 1 ? "single" : media.length === 2 ? "double" : ""}`} aria-label="Activity gallery">
      {media.length ? media.map((item, index) => <div className="voya-detail-gallery-picture" key={item.id}>
        <img src={activityMediaUrl(item.url)!} alt={item.description || `${product.name} photo ${index + 1}`} />
        {index === 0 && <span className="voya-detail-image-label">EXPERIENCE GALLERY</span>}
      </div>) : <div className="voya-detail-gallery-picture placeholder" aria-label="No activity photos supplied">✧</div>}
    </div>
    {(images.length > 3 || videos.length > 0) && <div className="voya-detail-media-extras">
      {images.slice(3).map((item) => <a href={activityMediaUrl(item.url)!} target="_blank" rel="noopener noreferrer" key={item.id} aria-label={`Open ${item.description || 'activity photo'}`}><img src={activityMediaUrl(item.url)!} alt={item.description || product.name} loading="lazy" /></a>)}
      {videos.map((item) => <a className="voya-detail-video-link" href={activityMediaUrl(item.url)!} target="_blank" rel="noopener noreferrer" key={item.id}>▶ {item.description || 'Watch activity video'}</a>)}
    </div>}

    <div className="voya-detail-layout">
      <div className="voya-detail-stack">
        <section className="voya-detail-panel">
          <h3>About this experience</h3>
          <p className="voya-detail-description">{product.description || product.shortDescription || 'No description has been provided.'}</p>
          {Boolean(product.highlights?.length) && <><h4>Experience highlights</h4><div className="voya-detail-highlight-grid">{product.highlights!.map((value, index) => <span key={index}>✦ {value}</span>)}</div></>}
        </section>

        {(product.meetingPoint || product.address || product.meetingModel || product.coordinates) && <section className="voya-detail-panel">
          <h3>Meeting point & location</h3>
          <div className="voya-detail-attributes">
            <DetailValue label="Meeting model" value={readable(product.meetingModel)} />
            <DetailValue label="Meeting point" value={product.meetingPoint} />
            <DetailValue label="Address" value={product.address} />
            <DetailValue label="Destination" value={destination} />
            {product.coordinates && <DetailValue label="Coordinates" value={`${product.coordinates.lat}, ${product.coordinates.lon}`} />}
          </div>
        </section>}

        <ListSection title="What's included" items={product.inclusions} />
        <ListSection title="What's not included" items={product.exclusions} excluded />
        <ListSection title="Important information" items={product.importantInfo} />
        <ListSection title="Things to carry" items={product.thingsToCarry} />
        <ListSection title="Safety measures" items={product.safetyMeasures} />
        <ListSection title="How to redeem" items={product.howToRedeem} />

        <section className="voya-detail-panel">
          <h3>Available experience options</h3>
          {variants.map((variant) => <article key={variant.id} className="voya-detail-offer">
            <div className="voya-detail-offer-heading"><h4>{variant.name}</h4><small>{variant.variantCode || ''}</small></div>
            {variant.description && <p className="voya-detail-description">{variant.description}</p>}
            <div className="voya-detail-offer-meta">
              {variant.durationMinutes != null && <span>◷ {variant.durationMinutes} minutes</span>}
              {variant.privateShared && <span>{readable(variant.privateShared)}</span>}
              {variant.minPax != null && <span>Min {variant.minPax} traveller(s)</span>}
              {variant.maxPax != null && <span>Max {variant.maxPax} traveller(s)</span>}
              {variant.vehicleType && <span>Vehicle: {variant.vehicleType}</span>}
              {variant.cutOffMinutes != null && <span>Booking cutoff: {variant.cutOffMinutes} min</span>}
            </div>
            {(variant.pickupIncluded || variant.dropoffIncluded || variant.mealIncluded) && <div className="voya-detail-attributes">
              {variant.pickupIncluded && <DetailValue label="Pickup" value={[variant.pickupType, variant.pickupInput, variant.pickupTimings].filter(Boolean).join(' · ') || 'Included'} />}
              {variant.dropoffIncluded && <DetailValue label="Drop-off" value={variant.dropoffTimings || 'Included'} />}
              {variant.mealIncluded && <DetailValue label="Meal" value={[variant.mealType, variant.mealVariety].filter(Boolean).join(' · ') || 'Included'} />}
            </div>}
            {Boolean(variant.pointsOfInterest?.length) && <><h4>Points of interest</h4><div className="voya-detail-highlight-grid">{variant.pointsOfInterest!.map((item, i) => <span key={i}>{item}</span>)}</div></>}
            {Boolean(variant.suitableFor?.length) && <><h4>Suitable for</h4><div className="voya-detail-highlight-grid">{variant.suitableFor!.map((item, i) => <span key={i}>{item}</span>)}</div></>}
            {Boolean(variant.menu?.length) && <><h4>Menu</h4><ul className="voya-detail-list">{variant.menu!.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
            {Boolean(variant.inclusions?.length) && <><h4>Option inclusions</h4><ul className="voya-detail-list">{variant.inclusions!.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
            {Boolean(variant.exclusions?.length) && <><h4>Option exclusions</h4><ul className="voya-detail-list excluded">{variant.exclusions!.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
            <h4>Available prices & sessions</h4>
            {(variant.offers || []).map((offer) => <div className="voya-detail-offer-price" key={`${offer.ratePlanId}-${offer.sessionId}`}>
              <div>
                <small>{shortDate(offer.serviceDate)}{offer.localStartTime ? ` · ${offer.localStartTime}` : ''}{offer.localEndTime ? `–${offer.localEndTime}` : ''} · {readable(offer.bookingMode)}</small>
                <strong>{offer.price?.finalAmount != null ? money(offer.price.finalAmount, offer.price.currency || 'INR') : 'Price on request'}</strong>
              </div>
              {canBook
                ? <button type="button" onClick={() => setSelected(offer)}>Book this option →</button>
                : <small className="voya-detail-booking-note">Booking is unavailable for your account role.</small>}
            </div>)}
          </article>)}
        </section>

        <ListSection title="Terms & conditions" items={product.terms} />
        <ListSection title="Additional information" items={product.additionalInfo} />
        {Boolean(faqs.length) && <section className="voya-detail-panel"><h3>Frequently asked questions</h3>{faqs.map((item, i) => <details className="voya-detail-faq" key={i}><summary>{item.question}</summary>{item.answer && <p>{item.answer}</p>}</details>)}</section>}
        {Boolean(questions.length) && <section className="voya-detail-panel"><h3>Information requested at booking</h3><div className="voya-detail-questions">{questions.map((item, i) => <div key={i}><b>{item.label}{item.required ? ' *' : ''}</b><small>{[item.helpText, item.appliesPerTraveller ? 'Requested for each traveller' : null, readable(item.type)].filter(Boolean).join(' · ')}</small></div>)}</div></section>}
      </div>

      <aside className="voya-detail-side" aria-label="Activity booking summary">
        <div className="voya-detail-booking-panel">
          <span>AVAILABLE FOR YOUR SEARCH</span>
          <h3>Plan this experience</h3>
          <p>{shortDate(context.serviceDate)} · {context.travellers.map((item) => `${item.quantity} ${readable(item.travellerType)}`).join(', ')}</p>
          {price ? <><div className="voya-detail-price">{money(price.amount, price.currency)}</div><small>Lowest eligible offer for the selected travellers</small></> : <p>See each option below for its live price and session.</p>}
          <p>Review all activity information and choose an available offer to continue to the existing booking checkout.</p>
          <button type="button" onClick={() => document.querySelector('.voya-detail-offer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>See available options ↓</button>
        </div>
      </aside>
    </div>
  </div>;
}
