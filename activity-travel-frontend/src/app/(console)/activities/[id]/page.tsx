"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import { getActivity } from "@/services/activityService";
import type { Activity } from "@/types/activity";

const money = (minor: number, currency: string) => currency + " " + (minor / 100).toFixed(2);

export default function ActivityDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void getActivity(id).then(setActivity).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load activity")); }, [id]);
  if (error) return <div className="notice error">{error}</div>;
  if (!activity) return <div className="page-loading">Loading activity...</div>;
  async function setStatus(status: "PUBLISHED" | "ARCHIVED") {
    try { await apiRequest<Activity>("/activities/" + id + "/status", { method: "PATCH", body: JSON.stringify({ status }) }); setActivity(await getActivity(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to change status"); }
  }
  return <div>
    <div className="page-heading"><div><p className="eyebrow">CATALOGUE / ACTIVITIES</p><h2>{activity.name}</h2><p className="subtext">{activity.summary}</p></div><div className="button-row"><Link className="primary button-link" href={"/activities/" + activity.id + "/edit"}>Edit activity</Link>{activity.status !== "PUBLISHED" && <button className="primary" onClick={() => void setStatus("PUBLISHED")}>Publish</button>}{activity.status !== "ARCHIVED" && <button className="danger" onClick={() => void setStatus("ARCHIVED")}>Archive</button>}</div></div>
    {error && <div className="notice error">{error}</div>}
    <section className="panel detail-grid"><div><span>Status</span><strong>{activity.status}</strong></div><div><span>Destination</span><strong>{activity.destination}</strong></div><div><span>Duration</span><strong>{activity.durationMinutes} minutes</strong></div><div><span>Timezone</span><strong>{activity.timezone}</strong></div><div><span>Variants</span><strong>{activity.variants?.length ?? 0}</strong></div><div><span>Schedules</span><strong>{activity.schedules?.length ?? 0}</strong></div></section>
    <section className="panel"><h3>Variants</h3>{activity.variants?.length ? activity.variants.map((variant) => <div className="activity-row" key={variant.id}><strong>{variant.name}</strong><span>{variant.isActive ? "ACTIVE" : "INACTIVE"}</span></div>) : <p>No variants configured.</p>}</section>
    <section className="panel"><h3>Availability and schedules</h3>{activity.schedules?.length ? activity.schedules.slice(0, 50).map((schedule) => <div className="activity-row" key={schedule.id}><strong>{new Date(schedule.startsAt).toLocaleString()}</strong><span>{Math.max(0, schedule.capacity - schedule.bookedSeats)} of {schedule.capacity} available</span></div>) : <p>No schedules configured.</p>}</section>
    <section className="panel"><h3>Pricing</h3>{activity.pricePlans?.length ? activity.pricePlans.map((plan) => <div className="activity-row" key={plan.id}><strong>{plan.name}</strong><span>{money(plan.adultMinor, plan.currency)} adult</span></div>) : <p>No price plans configured.</p>}</section>
    <section className="panel"><h3>Bookings</h3>{activity.bookings?.length ? activity.bookings.map((booking) => <div className="activity-row" key={booking.id}><Link href={"/bookings/" + booking.id}><strong>{booking.reference}</strong></Link><span>{booking.status} · {booking.customerName} · {money(booking.totalMinor, booking.currency)}</span></div>) : <p>No bookings for this activity.</p>}</section>
    <section className="panel"><h3>Audit history</h3>{activity.auditHistory?.length ? activity.auditHistory.map((entry) => <div className="activity-row" key={entry.id}><strong>{entry.action}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span></div>) : <p>No audit events recorded.</p>}</section>
  </div>;
}
