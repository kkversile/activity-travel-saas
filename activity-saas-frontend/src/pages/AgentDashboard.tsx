import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type AgentBooking, type User } from '../api';
import { shortDate } from '../components/Ui';
import { createAgentSearchState, type AgentSearchState } from './AgentMarketplace';

type Props = {
  user: User;
  canBook: boolean;
  onExplore: (search: AgentSearchState) => void;
  onViewBookings: () => void;
};

const inactiveStatuses = new Set(['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED']);
const actionStatuses = new Set(['PENDING', 'PENDING_VENDOR_CONFIRMATION', 'PENDING_MANUAL_REVIEW']);

function todayLocal(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstName(user: User): string {
  const name = user.fullName?.trim();
  return name ? name.split(/\s+/)[0] : 'Partner';
}

export function summarizeAgentBookings(bookings: AgentBooking[], today: string) {
  return {
    total: bookings.length,
    upcoming: bookings.filter((booking) =>
      booking.serviceDate.slice(0, 10) >= today && !inactiveStatuses.has(booking.status)
    ).length,
    confirmed: bookings.filter((booking) => booking.status === 'CONFIRMED').length,
    awaiting: bookings.filter((booking) => actionStatuses.has(booking.status)).length,
  };
}

export default function AgentDashboard({ user, canBook, onExplore, onViewBookings }: Props) {
  const [bookings, setBookings] = useState<AgentBooking[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [destination, setDestination] = useState('');
  const [serviceDate, setServiceDate] = useState(todayLocal());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.request<AgentBooking[]>('/agent/bookings')
      .then((data) => { if (active) setBookings(data); })
      .catch((reason: unknown) => {
        if (active) {
          setBookings(null);
          setError(reason instanceof Error ? reason.message : 'Unable to load your bookings.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const today = todayLocal();
  const summary = useMemo(
    () => bookings ? summarizeAgentBookings(bookings, today) : null,
    [bookings, today]
  );
  const upcoming = useMemo(
    () => (bookings ?? [])
      .filter((booking) =>
        booking.serviceDate.slice(0, 10) >= today && !inactiveStatuses.has(booking.status)
      )
      .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
      .slice(0, 4),
    [bookings, today]
  );

  function explore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serviceDate || serviceDate < today) {
      setSearchError('Choose today or a future service date.');
      return;
    }
    if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
      setSearchError('Enter at least one adult and a valid number of children.');
      return;
    }
    setSearchError('');
    const state = createAgentSearchState();
    state.destination = destination.trim();
    state.serviceDate = serviceDate;
    state.travellers = [
      { travellerType: 'ADULT', quantity: adults },
      ...(children > 0 ? [{ travellerType: 'CHILD', quantity: children }] : []),
    ];
    onExplore(state);
  }

  return (
    <div className="voya-agent-dashboard">
      <section className="voya-agent-welcome">
        <div className="voya-agent-welcome-copy">
          <span className="voya-agent-eyebrow"><span className="voya-agent-dot" /> YOUR TRAVEL WORKSPACE</span>
          <h2>Good to see you, <em>{firstName(user)}.</em></h2>
          <p>Find memorable experiences, plan the next journey, and keep your bookings on track—all from one place.</p>
          <div className="voya-agent-welcome-actions">
            <button type="button" className="voya-agent-light-button" onClick={() => document.getElementById('voya-agent-discovery')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Explore experiences <span aria-hidden="true">↗</span></button>
            <button type="button" className="voya-agent-ghost-button" onClick={onViewBookings}>My bookings <span aria-hidden="true">→</span></button>
          </div>
        </div>
        <div className="voya-agent-hero-art" aria-hidden="true">
          <div className="voya-agent-art-sun" />
          <div className="voya-agent-art-mountain far" />
          <div className="voya-agent-art-mountain near" />
          <div className="voya-agent-art-line" />
          <div className="voya-agent-art-bubble bubble-one">✦</div>
          <div className="voya-agent-art-bubble bubble-two">↗</div>
        </div>
      </section>

      <section className="voya-agent-section">
        <div className="voya-agent-section-heading">
          <div><span className="voya-agent-overline">AT A GLANCE</span><h3>Your booking overview</h3></div>
          <button type="button" className="voya-agent-small-action" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh booking overview">↻ Refresh</button>
        </div>
        {error && <div className="voya-agent-error" role="alert">{error} <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></div>}
        <div className="voya-agent-metrics" aria-label="Live booking summary">
          {[
            { title: 'Total bookings', number: summary?.total, symbol: '▧', tone: 'sand', note: 'Across your account' },
            { title: 'Upcoming services', number: summary?.upcoming, symbol: '◷', tone: 'blue', note: 'Today and onwards' },
            { title: 'Confirmed', number: summary?.confirmed, symbol: '✓', tone: 'mint', note: 'Confirmed bookings' },
            { title: 'Awaiting action', number: summary?.awaiting, symbol: '◎', tone: 'peach', note: 'Pending responses' },
          ].map((metric) => (
            <article className="voya-agent-metric" key={metric.title}>
              <div className="voya-agent-metric-top"><span className={`voya-agent-metric-icon ${metric.tone}`}>{metric.symbol}</span><span className="voya-agent-metric-trend" aria-hidden="true">↗</span></div>
              <strong aria-label={metric.title}>{loading ? '…' : metric.number ?? '—'}</strong>
              <b>{metric.title}</b>
              <small>{metric.note}</small>
            </article>
          ))}
        </div>
      </section>

      <div className="voya-agent-two-columns">
        <section id="voya-agent-discovery" className="voya-agent-discover">
          <div className="voya-agent-section-heading">
            <div><span className="voya-agent-overline">DISCOVER YOUR NEXT EXPERIENCE</span><h3>Where to next?</h3></div>
            <span className="voya-agent-step-label">01 / EXPLORE</span>
          </div>
          <p className="voya-agent-discover-subtitle">Search currently eligible experiences for your travellers and service date.</p>
          <form className="voya-agent-search-form" onSubmit={explore}>
            <label className="voya-agent-input-field voya-agent-destination">
              <span>Destination</span>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City or state (optional)" />
            </label>
            <label className="voya-agent-input-field">
              <span>Service date</span>
              <input type="date" min={today} value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required />
            </label>
            <label className="voya-agent-input-field">
              <span>Adults</span>
              <input type="number" min="1" max="99" step="1" value={adults} onChange={(e) => setAdults(Number(e.target.value))} required />
            </label>
            <label className="voya-agent-input-field">
              <span>Children</span>
              <input type="number" min="0" max="99" step="1" value={children} onChange={(e) => setChildren(Number(e.target.value))} required />
            </label>
            {searchError && <div className="voya-agent-search-error" role="alert">{searchError}</div>}
            <button type="submit" className="voya-agent-search-submit">Find experiences <span aria-hidden="true">→</span></button>
          </form>
          <div className="voya-agent-destination-hints">
            <span>Try a destination</span>
            {['Munnar', 'Kochi', 'Goa'].map((city) => <button type="button" key={city} onClick={() => setDestination(city)}>{city} <span aria-hidden="true">↗</span></button>)}
          </div>
        </section>

        <section className="voya-agent-next-steps">
          <div className="voya-agent-section-heading">
            <div><span className="voya-agent-overline">STAY ON TRACK</span><h3>Quick access</h3></div>
          </div>
          <button type="button" className="voya-agent-task" onClick={() => onExplore(createAgentSearchState())}>
            <span className="voya-agent-task-icon">✧</span>
            <span><b>Browse the Marketplace</b><small>Check availability and view eligible offers</small></span>
            <span className="voya-agent-task-arrow">↗</span>
          </button>
          <button type="button" className="voya-agent-task" onClick={onViewBookings}>
            <span className="voya-agent-task-icon second">▤</span>
            <span><b>Manage my bookings</b><small>Review service dates, status and vouchers</small></span>
            <span className="voya-agent-task-arrow">↗</span>
          </button>
          <div className="voya-agent-access-note"><span aria-hidden="true">◆</span> {canBook ? 'Your account can book eligible experiences.' : 'Your account has viewing access. Booking actions depend on your role.'}</div>
        </section>
      </div>

      <section className="voya-agent-upcoming">
        <div className="voya-agent-section-heading">
          <div><span className="voya-agent-overline">AHEAD OF YOU</span><h3>Upcoming services</h3></div>
          <button type="button" className="voya-agent-small-action" onClick={onViewBookings}>View all bookings →</button>
        </div>
        {loading ? (
          <p className="voya-agent-empty">Loading your upcoming services…</p>
        ) : bookings === null ? (
          <p className="voya-agent-empty">Booking details are currently unavailable.</p>
        ) : upcoming.length === 0 ? (
          <div className="voya-agent-empty"><span aria-hidden="true">✦</span><b>No upcoming services yet</b><p>Find experiences in the Marketplace to get started.</p><button type="button" onClick={() => onExplore(createAgentSearchState())}>Explore Marketplace →</button></div>
        ) : (
          <div className="voya-agent-booking-list">
            {upcoming.map((booking) => (
              <div className="voya-agent-booking-row" key={booking.id}>
                <span className="voya-agent-booking-glyph" aria-hidden="true">✧</span>
                <div className="voya-agent-booking-main"><b>{booking.snapshot?.productSnapshot?.productName || 'Experience booking'}</b><small>{booking.bookingCode} · {shortDate(booking.serviceDate)}</small></div>
                <span className={`voya-agent-booking-status ${booking.status === 'CONFIRMED' ? 'confirmed' : 'pending'}`}>{booking.status.replaceAll('_', ' ').toLowerCase()}</span>
                <button type="button" onClick={onViewBookings} aria-label={`Manage booking ${booking.bookingCode}`}>View →</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
