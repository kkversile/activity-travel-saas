import { useEffect, useState } from 'react';
import { api, type Booking } from '../api';
import { Badge, ErrorBox, Loading, money, Panel, shortDate } from '../components/Ui';

type Summary = {
  bookingsToday: number;
  revenueMtd: number;
  pendingBookings: number;
  cancellationRate: number;
  listings: number;
  liveListings: number;
  responseTimeMinutes: number;
  readinessScore: number;
  recentBookings: Booking[];
};

export default function Dashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.request<Summary>('/dashboard/summary').then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  return <>
    <div className="kpi-row">
      <div className="kpi-card"><span>Bookings Today</span><strong>{data.bookingsToday}</strong><small>{data.pendingBookings} need action</small></div>
      <div className="kpi-card"><span>Revenue (MTD)</span><strong>{money(data.revenueMtd)}</strong><small>Confirmed + completed</small></div>
      <div className="kpi-card"><span>Avg Response Time</span><strong>{data.responseTimeMinutes} min</strong><small className="good">Within 15 min SLA</small></div>
      <div className="kpi-card"><span>Cancellation Rate</span><strong>{data.cancellationRate}%</strong><small>Monthly booking ratio</small></div>
    </div>

    <div className="grid-2">
      <Panel title="Recent Bookings">
        <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Activity</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {data.recentBookings.map((b) => <tr key={b.id}><td className="mono">{b.bookingCode}</td><td>{b.activity.productName}</td><td>{shortDate(b.serviceDate)}</td><td>{money(b.amount)}</td><td><Badge value={b.status} /></td></tr>)}
        </tbody></table></div>
      </Panel>
      <Panel title="Vendor Readiness">
        <div className="ring-wrap">
          <div className="score-ring"><strong>{data.readinessScore}</strong><span>Score</span></div>
          <div className="readiness-list">
            <div><span>Profile & docs</span><b className="good">Complete</b></div>
            <div><span>Response SLA</span><b className="good">96%</b></div>
            <div><span>Live listings</span><b>{data.liveListings}/{data.listings}</b></div>
            <div><span>Payout details</span><b className="good">Verified</b></div>
          </div>
        </div>
      </Panel>
    </div>

    <Panel title="Action Items">
      <div className="task-list">
        {data.pendingBookings > 0 && <div className="task urgent"><b>{data.pendingBookings} booking requests awaiting confirmation</b><span>Review before the vendor response SLA expires.</span></div>}
        <div className="task medium"><b>3 listings flagged for content quality</b><span>Use the Listings editor to improve media and descriptions.</span></div>
        <div className="task medium"><b>GSTIN document review due</b><span>Keep onboarding documents current to avoid payout holds.</span></div>
      </div>
    </Panel>
  </>;
}
