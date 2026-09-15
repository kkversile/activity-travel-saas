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
  responseTimeMinutes: number | null;
  readinessScore: number;
  vendorActionRequiredBookings: number;
  manualReviewPendingBookings: number;
  legacyPendingBookings: number;
  qualityIssueCount: number;
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
      <div className="kpi-card"><span>Bookings Today</span><strong>{data.bookingsToday}</strong><small>{data.vendorActionRequiredBookings} need your action</small></div>
      <div className="kpi-card"><span>Revenue (MTD)</span><strong>{money(data.revenueMtd)}</strong><small>Confirmed + completed</small></div>
      <div className="kpi-card"><span>Avg Response Time</span><strong>{data.responseTimeMinutes === null ? 'Not available' : `${data.responseTimeMinutes} min`}</strong><small>Measured from vendor responses</small></div>
      <div className="kpi-card"><span>Cancellation Rate</span><strong>{data.cancellationRate}%</strong><small>Monthly booking ratio</small></div>
    </div>

    <div className="grid-2">
      <Panel title="Recent Bookings">
        <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Product</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {data.recentBookings.map((b) => <tr key={b.id}><td className="mono">{b.bookingCode}</td><td>{b.product.currentRevision?.productName || b.product.productCode}</td><td>{shortDate(b.serviceDate)}</td><td>{money(b.amount)}</td><td><Badge value={b.status} /></td></tr>)}
        </tbody></table></div>
      </Panel>
      <Panel title="Vendor Readiness">
        <div className="ring-wrap">
          <div className="score-ring"><strong>{data.readinessScore}</strong><span>Score</span></div>
          <div className="readiness-list">
            <div><span>Profile & docs</span><b className="good">Complete</b></div>
            <div><span>Response SLA</span><b className="good">96%</b></div>
            <div><span>Live products</span><b>{data.liveListings}/{data.listings}</b></div>
            <div><span>Payout details</span><b className="good">Verified</b></div>
          </div>
        </div>
      </Panel>
    </div>

    <Panel title="Action Items">
      <div className="task-list">
        {data.vendorActionRequiredBookings > 0 && <div className="task urgent"><b>{data.vendorActionRequiredBookings} booking requests awaiting your confirmation</b><span>Review before the vendor response SLA expires.</span></div>}
        {data.manualReviewPendingBookings > 0 && <div className="task medium"><b>{data.manualReviewPendingBookings} booking requests are with platform manual review</b><span>No vendor action is required while the platform reviews them.</span></div>}
        {data.legacyPendingBookings > 0 && <div className="task medium"><b>{data.legacyPendingBookings} legacy booking records remain pending</b><span>Legacy records are shown separately from canonical vendor actions.</span></div>}
        {data.qualityIssueCount > 0 && <div className="task medium"><b>{data.qualityIssueCount} open quality issues</b><span>Open Performance to review the evidence and configured thresholds.</span></div>}
      </div>
    </Panel>
  </>;
}
