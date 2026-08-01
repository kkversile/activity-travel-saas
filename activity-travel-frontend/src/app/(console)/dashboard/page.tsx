"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";
import { getDashboardSummary, DashboardSummary } from "@/services/dashboardService";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { setError(""); void getDashboardSummary().then(setSummary).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load dashboard summary")); }, []);
  useEffect(() => { load(); }, [load]);
  return <div><div className="page-heading"><div><p className="eyebrow">OPERATIONS CONSOLE</p><h2>Dashboard</h2><p className="subtext">A focused overview of your travel operation.</p></div></div>{error ? <ErrorPanel message={error} onRetry={load} /> : !summary ? <LoadingTable /> : <><section className="stats"><div><span>Published activities</span><strong>{summary.publishedActivities}</strong></div><div><span>Open bookings</span><strong>{summary.openBookings}</strong></div><div><span>Seats available</span><strong>{summary.seatsAvailable}</strong></div><div><span>Upcoming schedules</span><strong>{summary.upcomingSchedules}</strong></div><div><span>Confirmed revenue</span><strong>{(summary.confirmedRevenueMinor / 100).toFixed(2)}</strong></div></section><p className="subtext">Updated {new Date(summary.generatedAt).toLocaleString()}</p></>}<section className="panel-grid"><Link className="panel nav-panel" href="/activities"><strong>Activities</strong><span>Manage your catalogue, variants and publishing status.</span></Link><Link className="panel nav-panel" href="/schedules"><strong>Schedules</strong><span>Plan departures and protect capacity.</span></Link><Link className="panel nav-panel" href="/bookings"><strong>Bookings</strong><span>Review booking workflow and customer records.</span></Link></section></div>;
}
