import { API_BASE } from '../api';
import { money } from '../components/Ui';
import type { AgentSearchContext } from './AgentMarketplace';
import './agent-activities.css';

export type ActivityOffer = {
  sessionId: string;
  serviceDate: string;
  localStartTime?: string | null;
  bookingMode?: string | null;
  price?: { finalAmount?: number | string | null; currency?: string | null } | null;
};

export type ActivityVariant = {
  id: string;
  name: string;
  durationMinutes?: number | null;
  privateShared?: string | null;
  pickupIncluded?: boolean;
  offers: ActivityOffer[];
};

export type ActivityResult = {
  id: string;
  name: string;
  type?: string | null;
  subType?: string | null;
  subCategory?: string | null;
  shortDescription?: string | null;
  destination?: { city?: string | null; state?: string | null; country?: string | null } | null;
  starRating?: string | null;
  coverMedia?: { url: string; description?: string | null; kind?: string } | null;
  variants: ActivityVariant[];
};

export function activityMediaUrl(value?: string | null): string | null {
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return null;
  if (value.startsWith('/api/')) return API_BASE + value.slice(4);
  if (value.startsWith('/files/')) return API_BASE + value;
  return null;
}

export function minimumActivityPrice(product: ActivityResult): { amount: number; currency: string } | null {
  const offers = product.variants.flatMap((variant) => variant.offers);
  const prices = offers
    .filter((offer) => offer.price?.finalAmount !== null && offer.price?.finalAmount !== undefined && String(offer.price.finalAmount).trim() !== '')
    .map((offer) => ({ amount: Number(offer.price!.finalAmount), currency: String(offer.price?.currency || '').toUpperCase() }))
    .filter((price) => price.currency && Number.isFinite(price.amount) && price.amount >= 0);
  const currencies = new Set(prices.map((price) => price.currency));
  if (!prices.length || currencies.size !== 1) return null;
  return prices.reduce((minimum, next) => next.amount < minimum.amount ? next : minimum);
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} hr ${minutes % 60} min` : `${hours} hr`;
}

export default function AgentActivityCards({
  products, context, onView,
}: {
  products: ActivityResult[];
  context: AgentSearchContext;
  onView: (id: string, context: AgentSearchContext) => void;
}) {
  if (!products.length) return (
    <div className="voya-activity-no-results">
      <span aria-hidden="true">✧</span>
      <b>No eligible activities for this search</b>
      <p>Try another date, destination, or traveller mix to see currently available experiences.</p>
    </div>
  );

  return (
    <div className="voya-activity-grid">
      {products.map((product) => {
        const cover = product.coverMedia?.kind === 'VIDEO' ? null : activityMediaUrl(product.coverMedia?.url);
        const offers = product.variants.flatMap((variant) => variant.offers);
        const price = minimumActivityPrice(product);
        const duration = product.variants.map((variant) => variant.durationMinutes).find((value): value is number => typeof value === 'number' && value > 0);
        const destination = [product.destination?.city, product.destination?.state].filter(Boolean).join(', ');
        const rating = Number(product.starRating);
        return (
          <button type="button" key={product.id} className="voya-activity-card" onClick={() => onView(product.id, context)} aria-label={`View complete details for ${product.name}`}>
            <div className="voya-activity-card-media">
              {cover ? <img src={cover} alt={product.coverMedia?.description || product.name} loading="lazy" /> : <div className="voya-activity-no-image" aria-hidden="true"><span>✧</span><small>VOYA EXPERIENCES</small></div>}
              <span className="voya-activity-image-tag">{product.variants.length > 1 ? `${product.variants.length} options` : (product.type || 'EXPERIENCE').replaceAll('_', ' ')}</span>
              {Number.isFinite(rating) && rating > 0 && <span className="voya-activity-rating">★ {rating.toFixed(1)}</span>}
            </div>
            <div className="voya-activity-card-content">
              <span className="voya-activity-card-location"><span aria-hidden="true">⌖</span> {destination || 'Destination details available inside'}</span>
              <h3>{product.name}</h3>
              {(product.subCategory || product.subType) && <span className="voya-activity-card-category">{(product.subCategory || product.subType || '').replaceAll('_', ' ')}</span>}
              <p>{product.shortDescription?.trim() || 'Explore this experience and its available options.'}</p>
              <div className="voya-activity-card-chips">
                {duration != null && <span>◷ {durationLabel(duration)}</span>}
                {product.variants.some((variant) => variant.pickupIncluded) && <span>Pickup available</span>}
                {product.variants.some((variant) => variant.privateShared === 'PRIVATE') && <span>Private option</span>}
              </div>
              <div className="voya-activity-card-footer">
                <div>{price ? <><small>From · for selected travellers</small><b>{money(price.amount, price.currency)}</b></> : <><small>Available offers</small><b>{offers.length} {offers.length === 1 ? 'offer' : 'offers'}</b></>}</div>
                <span className="voya-activity-view">View details <span aria-hidden="true">↗</span></span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
