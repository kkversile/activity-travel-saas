import { useEffect, useState } from 'react';
import { api } from '../api';

type Summary = { vendors:number; pendingVendors:number; activities:number; reviewActivities:number; bookings:number; pendingBookings:number };
export default function AdminDashboard({ onNavigate }:{onNavigate:(page:'vendors'|'review')=>void}) {
  const [data,setData]=useState<Summary|null>(null); const [error,setError]=useState('');
  useEffect(()=>{api.request<Summary>('/admin/dashboard').then(setData).catch(e=>setError((e as Error).message));},[]);
  if(error) return <div className="alert error">{error}</div>; if(!data) return <div className="loading">Loading admin dashboard…</div>;
  return <><div className="admin-hero"><div><h2>Platform overview</h2><p className="muted">Monitor vendors, catalogue publishing and reservation operations.</p></div><button className="btn primary" onClick={()=>onNavigate('review')}>Open review queue</button></div>
    <div className="kpi-row"><div className="kpi-card"><span>Total vendors</span><strong>{data.vendors}</strong><small>All vendor tenants</small></div><div className="kpi-card"><span>Pending onboarding</span><strong className="warn">{data.pendingVendors}</strong><small>Verification reviews</small></div><div className="kpi-card"><span>Activities</span><strong>{data.activities}</strong><small>{data.reviewActivities} awaiting review</small></div><div className="kpi-card"><span>Bookings</span><strong>{data.bookings}</strong><small>{data.pendingBookings} pending action</small></div></div>
    <div className="grid-2"><div className="panel"><div className="panel-head"><h3>Admin workflow</h3></div><div className="panel-body task-list"><button className="task" onClick={()=>onNavigate('vendors')}><b>Review vendor onboarding</b><span>Verify business details and documents.</span></button><button className="task" onClick={()=>onNavigate('review')}><b>Publish catalogue submissions</b><span>Approve or reject vendor activities.</span></button></div></div><div className="panel"><div className="panel-head"><h3>Access model</h3></div><div className="panel-body muted">Admins see platform-wide tenants and activities. Vendors remain restricted to their own tenant and manage their listings, availability and bookings.</div></div></div></>;
}
