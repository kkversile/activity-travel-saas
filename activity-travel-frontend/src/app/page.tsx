"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Activity } from "@/types/activity";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4006/api/v1";
const demoTenant = process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";

type User = { id: string; email: string; displayName: string; role: string; tenantId?: string; memberships: Array<{ tenantId: string; role: string; tenant?: { name: string } }> };
type Booking = { id: string; reference: string; status: string; customerName: string; totalMinor: number; currency: string; activity: { name: string }; schedule: { startsAt: string; bookedSeats: number; capacity: number } };

async function request<T>(path: string, options: RequestInit = {}, token?: string, tenantId?: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(tenantId ? { "x-tenant-id": tenantId } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function money(minor: number, currency: string) { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minor / 100); }

export default function HomePage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState(demoTenant);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [login, setLogin] = useState({ email: "admin@demo.travel", password: "" });
  const [activityForm, setActivityForm] = useState({ name: "", slug: "", summary: "", description: "", destination: "", timezone: "Asia/Kolkata", durationMinutes: "180" });
  const [scheduleForm, setScheduleForm] = useState({ activityId: "", startsAt: "", endsAt: "", capacity: "20" });
  const [priceForm, setPriceForm] = useState({ activityId: "", name: "Standard", currency: "INR", adultMinor: "150000", childMinor: "90000", infantMinor: "0", taxPercent: "0" });
  const [bookingForm, setBookingForm] = useState({ activityId: "", scheduleId: "", customerName: "", customerEmail: "", idempotencyKey: "" });

  const selectedActivity = useMemo(() => activities.find((activity) => activity.id === bookingForm.activityId), [activities, bookingForm.activityId]);

  async function loadDashboard(activeToken = token, activeTenant = tenantId) {
    if (!activeToken || !activeTenant) return;
    setLoading(true);
    try {
      const [nextActivities, nextBookings] = await Promise.all([
        request<Activity[]>("/activities", {}, activeToken, activeTenant),
        request<Booking[]>("/bookings", {}, activeToken, activeTenant)
      ]);
      setActivities(nextActivities);
      setBookings(nextBookings);
      if (!bookingForm.activityId && nextActivities[0]) setBookingForm((current) => ({ ...current, activityId: nextActivities[0].id, scheduleId: nextActivities[0].schedules[0]?.id ?? "" }));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const savedToken = window.localStorage.getItem("activity_access_token");
    const savedUser = window.localStorage.getItem("activity_user");
    if (savedToken && savedUser) { setToken(savedToken); setUser(JSON.parse(savedUser) as User); }
  }, []);

  useEffect(() => { if (token && user) void loadDashboard(token, tenantId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load dashboard")); }, [token, user, tenantId]);

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const result = await request<{ accessToken: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(login) });
      const nextTenant = result.user.tenantId ?? result.user.memberships[0]?.tenantId ?? demoTenant;
      window.localStorage.setItem("activity_access_token", result.accessToken);
      window.localStorage.setItem("activity_user", JSON.stringify(result.user));
      setToken(result.accessToken); setUser(result.user); setTenantId(nextTenant); setNotice("Signed in successfully");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign in failed"); }
  }

  async function logout() { setToken(""); setUser(null); window.localStorage.removeItem("activity_access_token"); window.localStorage.removeItem("activity_user"); }

  async function createActivity(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await request("/activities", { method: "POST", body: JSON.stringify({ ...activityForm, durationMinutes: Number(activityForm.durationMinutes) }) }, token, tenantId); setNotice("Activity created as a draft"); await loadDashboard(); setActivityForm({ name: "", slug: "", summary: "", description: "", destination: "", timezone: "Asia/Kolkata", durationMinutes: "180" }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Activity creation failed"); }
  }

  async function createBooking(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await request("/bookings", { method: "POST", body: JSON.stringify({ ...bookingForm, passengers: [{ type: "ADULT", firstName: "Demo", lastName: "Guest" }] }) }, token, tenantId); setNotice("Booking hold created"); await loadDashboard(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Booking failed"); }
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await request(`/activities/${scheduleForm.activityId}/schedules`, { method: "POST", body: JSON.stringify({ startsAt: new Date(scheduleForm.startsAt).toISOString(), endsAt: new Date(scheduleForm.endsAt).toISOString(), capacity: Number(scheduleForm.capacity) }) }, token, tenantId); setNotice("Departure added"); await loadDashboard(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Schedule creation failed"); }
  }

  async function createPrice(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await request(`/activities/${priceForm.activityId}/prices`, { method: "POST", body: JSON.stringify({ ...priceForm, adultMinor: Number(priceForm.adultMinor), childMinor: Number(priceForm.childMinor), infantMinor: Number(priceForm.infantMinor), taxPercent: Number(priceForm.taxPercent) }) }, token, tenantId); setNotice("Price plan added"); await loadDashboard(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Pricing creation failed"); }
  }

  async function bookingAction(id: string, action: "confirm" | "cancel") { try { await request(`/bookings/${id}/${action}`, { method: "POST" }, token, tenantId); setNotice(`Booking ${action}ed`); await loadDashboard(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Booking update failed"); } }

  if (!user) return <main className="auth-shell"><div className="auth-card"><p className="eyebrow">ACTIVITY TRAVEL OPERATIONS</p><h1>Run every departure with confidence.</h1><p className="subtext">Secure catalogue, inventory and booking operations for travel partners.</p><form onSubmit={submitLogin} className="form-stack"><label>Email<input type="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} required /></label><label>Password<input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} minLength={8} required /></label>{error && <div className="notice error">{error}</div>}<button className="primary" type="submit">Sign in</button></form><p className="muted">Demo account: admin@demo.travel · password configured in the local seed.</p></div></main>;

  return <main className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><span className="brand">Activity Travel</span><span className="badge">OPS</span></div><nav className="sidebar-nav" aria-label="Primary navigation"><a className="active" href="#dashboard">⌂ <span>Dashboard</span></a><a href="#catalogue">▦ <span>Activities</span></a><a href="#schedules">◷ <span>Schedules</span></a><a href="#pricing">◇ <span>Pricing</span></a><a href="#availability">▤ <span>Availability</span></a><a href="#bookings">▣ <span>Bookings</span></a><a href="#customers">♙ <span>Customers</span></a><a href="#vouchers">◇ <span>Vouchers</span></a>{["PARTNER_ADMIN", "PLATFORM_ADMIN"].includes(user.role) ? <a href="#team">♧ <span>Team</span></a> : null}</nav><div className="sidebar-footer"><span className="tenant-dot" />{user.displayName}<button type="button" onClick={() => void logout()}>Sign out</button></div></aside><div className="workspace"><header className="topbar"><div className="mobile-brand"><span className="brand">Activity Travel</span><span className="badge">{user.role}</span></div><div className="top-actions"><span>{user.displayName}</span><button type="button" onClick={() => void logout()}>Sign out</button></div></header></div><div className="nav-index"><section id="dashboard" className="nav-index-card"><span>⌂</span><div><strong>Dashboard</strong><small>Live operations overview and workspace summary.</small></div></section><section id="catalogue" className="nav-index-card"><span>▦</span><div><strong>Activities</strong><small>Browse and create activity catalogue entries.</small></div></section><section id="schedules" className="nav-index-card"><span>◷</span><div><strong>Schedules</strong><small>Create departures and manage inventory.</small></div></section><section id="pricing" className="nav-index-card"><span>◇</span><div><strong>Pricing</strong><small>Configure adult, child, infant and tax pricing.</small></div></section><section id="availability" className="nav-index-card"><span>▤</span><div><strong>Availability</strong><small>Review remaining seats by departure.</small></div></section><section id="bookings" className="nav-index-card"><span>▣</span><div><strong>Bookings</strong><small>Create holds and manage booking status.</small></div></section><section id="customers" className="nav-index-card"><span>♙</span><div><strong>Customers</strong><small>Customer records are created from bookings.</small></div></section><section id="vouchers" className="nav-index-card"><span>◇</span><div><strong>Vouchers</strong><small>Discount vouchers are managed through the booking API.</small></div></section>{["PARTNER_ADMIN", "PLATFORM_ADMIN"].includes(user.role) ? <section id="team" className="nav-index-card"><span>♧</span><div><strong>Team</strong><small>Manage tenant users and memberships.</small></div></section> : null}</div>
    <section className="dashboard-head"><div><p className="eyebrow">OPERATIONS CONSOLE</p><h1>Good day, {user.displayName.split(" ")[0]}.</h1><p className="subtext">Manage your catalogue, protect capacity, and keep every booking moving.</p></div><label className="tenant-picker">Workspace<select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>{user.memberships.map((membership) => <option key={membership.tenantId} value={membership.tenantId}>{membership.tenant?.name ?? membership.tenantId}</option>)}</select></label></section>
    {error && <div className="notice error">{error}</div>}{notice && <div className="notice success">{notice}</div>}{loading && <div className="notice">Refreshing workspace…</div>}
    <section className="stats"><div><span>Published activities</span><strong>{activities.length}</strong></div><div><span>Open bookings</span><strong>{bookings.filter((booking) => booking.status !== "CANCELLED").length}</strong></div><div><span>Seats in catalogue</span><strong>{activities.reduce((sum, activity) => sum + (activity.schedules[0]?.capacity ?? 0), 0)}</strong></div></section>
    <div className="dashboard-grid"><section className="panel"><div className="section-heading"><div><p className="eyebrow">CATALOGUE</p><h2>Published activities</h2></div></div>{activities.length === 0 ? <div className="empty">No published activities yet. Create a draft below and publish it through the API.</div> : <div className="activity-list">{activities.map((activity) => <article className="activity-row" key={activity.id}><div><span className="destination">{activity.destination}</span><h3>{activity.name}</h3><p>{activity.summary}</p></div><div className="row-meta"><strong>{activity.pricePlans[0] ? money(activity.pricePlans[0].adultMinor, activity.pricePlans[0].currency) : "No price"}</strong><span>{activity.schedules[0] ? `${Math.max(0, activity.schedules[0].capacity - activity.schedules[0].bookedSeats)} seats left` : "No schedule"}</span></div></article>)}</div>}</section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">BOOKING DESK</p><h2>New booking hold</h2></div></div><form onSubmit={createBooking} className="form-stack"><label>Activity<select value={bookingForm.activityId} onChange={(event) => setBookingForm({ ...bookingForm, activityId: event.target.value, scheduleId: activities.find((item) => item.id === event.target.value)?.schedules[0]?.id ?? "" })} required><option value="">Select activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label><label>Departure<select value={bookingForm.scheduleId} onChange={(event) => setBookingForm({ ...bookingForm, scheduleId: event.target.value })} required><option value="">Select departure</option>{selectedActivity?.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{new Date(schedule.startsAt).toLocaleString("en-IN")} · {Math.max(0, schedule.capacity - schedule.bookedSeats)} left</option>)}</select></label><label>Customer name<input value={bookingForm.customerName} onChange={(event) => setBookingForm({ ...bookingForm, customerName: event.target.value })} required /></label><label>Customer email<input type="email" value={bookingForm.customerEmail} onChange={(event) => setBookingForm({ ...bookingForm, customerEmail: event.target.value })} required /></label><label>Idempotency key<input value={bookingForm.idempotencyKey} onChange={(event) => setBookingForm({ ...bookingForm, idempotencyKey: event.target.value })} placeholder="booking-2026-001" required /></label><button className="primary" type="submit">Create 15-minute hold</button></form></section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">INVENTORY</p><h2>Availability</h2></div></div><div className="availability-list">{activities.flatMap((activity) => activity.schedules.map((schedule) => <div className="availability" key={schedule.id}><div><strong>{activity.name}</strong><span>{new Date(schedule.startsAt).toLocaleString("en-IN")}</span></div><b>{Math.max(0, schedule.capacity - schedule.bookedSeats)} / {schedule.capacity}</b></div>))}</div></section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">BOOKINGS</p><h2>Recent reservations</h2></div></div>{bookings.length === 0 ? <div className="empty">No bookings yet.</div> : <div className="booking-list">{bookings.map((booking) => <div className="booking-row" key={booking.id}><div><strong>{booking.reference}</strong><span>{booking.customerName} · {booking.activity.name}</span></div><div><span className={`status ${booking.status.toLowerCase()}`}>{booking.status}</span><strong>{money(booking.totalMinor, booking.currency)}</strong>{booking.status === "HOLD" && <><button type="button" onClick={() => void bookingAction(booking.id, "confirm")}>Confirm</button><button type="button" onClick={() => void bookingAction(booking.id, "cancel")}>Cancel</button></>}</div></div>)}</div>}</section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">SCHEDULES</p><h2>Add departure</h2></div></div><form onSubmit={createSchedule} className="form-stack"><label>Activity<select value={scheduleForm.activityId} onChange={(event) => setScheduleForm({ ...scheduleForm, activityId: event.target.value })} required><option value="">Select activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label><label>Starts at<input type="datetime-local" value={scheduleForm.startsAt} onChange={(event) => setScheduleForm({ ...scheduleForm, startsAt: event.target.value })} required /></label><label>Ends at<input type="datetime-local" value={scheduleForm.endsAt} onChange={(event) => setScheduleForm({ ...scheduleForm, endsAt: event.target.value })} required /></label><label>Capacity<input type="number" min="1" value={scheduleForm.capacity} onChange={(event) => setScheduleForm({ ...scheduleForm, capacity: event.target.value })} required /></label><button className="primary" type="submit">Add departure</button></form></section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">PRICING</p><h2>Add price plan</h2></div></div><form onSubmit={createPrice} className="form-stack"><label>Activity<select value={priceForm.activityId} onChange={(event) => setPriceForm({ ...priceForm, activityId: event.target.value })} required><option value="">Select activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label><label>Plan name<input value={priceForm.name} onChange={(event) => setPriceForm({ ...priceForm, name: event.target.value })} required /></label><label>Adult price (minor units)<input type="number" min="0" value={priceForm.adultMinor} onChange={(event) => setPriceForm({ ...priceForm, adultMinor: event.target.value })} required /></label><label>Child price (minor units)<input type="number" min="0" value={priceForm.childMinor} onChange={(event) => setPriceForm({ ...priceForm, childMinor: event.target.value })} required /></label><label>Tax percent<input type="number" min="0" value={priceForm.taxPercent} onChange={(event) => setPriceForm({ ...priceForm, taxPercent: event.target.value })} required /></label><button className="primary" type="submit">Add price plan</button></form></section>
      <section className="panel wide"><div className="section-heading"><div><p className="eyebrow">ACTIVITY BUILDER</p><h2>Create a draft activity</h2></div></div><form onSubmit={createActivity} className="form-grid">{([['name','Name'],['slug','Slug'],['destination','Destination'],['timezone','Timezone'],['durationMinutes','Duration (minutes)'],['summary','Summary'],['description','Description']] as const).map(([key, label]) => <label key={key}>{label}{key === "description" || key === "summary" ? <textarea value={activityForm[key]} onChange={(event) => setActivityForm({ ...activityForm, [key]: event.target.value })} required /> : <input value={activityForm[key]} onChange={(event) => setActivityForm({ ...activityForm, [key]: event.target.value })} required />}</label>)}<button className="primary" type="submit">Save draft</button></form></section></div></main>;
}
