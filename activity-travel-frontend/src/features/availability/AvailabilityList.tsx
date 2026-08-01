"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adjustScheduleCapacity, listAvailability, type ScheduleRecord } from "@/services/inventoryService";
import { listActivities } from "@/services/activityService";
import { listCatalog, type CatalogRecord } from "@/services/catalogService";
import type { Activity } from "@/types/activity";
import type { PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

const initialMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
type AvailabilityState = "" | "AVAILABLE" | "FULL" | "INACTIVE";

export function AvailabilityList() {
  const [rows, setRows] = useState<ScheduleRecord[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [destinations, setDestinations] = useState<CatalogRecord[]>([]);
  const [search, setSearch] = useState("");
  const [activityId, setActivityId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [state, setState] = useState<AvailabilityState>("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(initialMeta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [capacity, setCapacity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("search") ?? "");
    setActivityId(params.get("activityId") ?? "");
    setDestinationId(params.get("destinationId") ?? "");
    setFrom(params.get("from") ?? "");
    setTo(params.get("to") ?? "");
    setState((params.get("availabilityStatus") ?? "") as AvailabilityState);
    setView(params.get("view") === "calendar" ? "calendar" : "list");
    setPage(Math.max(1, Number(params.get("page") ?? "1")));
    const size = Number(params.get("pageSize") ?? "25");
    if ([10, 25, 50, 100].includes(size)) setMeta((current) => ({ ...current, pageSize: size }));
    void Promise.all([
      listActivities({ page: 1, pageSize: 100, sortBy: "createdAt", sortOrder: "desc" }),
      listCatalog("destinations", "page=1&pageSize=100&sortBy=name&sortOrder=asc")
    ]).then(([activityResult, destinationResult]) => {
      setActivities(activityResult.data);
      setDestinations(destinationResult.data);
    }).catch(() => undefined);
  }, []);

  const syncUrl = useCallback((next: Partial<{ page: number; pageSize: number; search: string; activityId: string; destinationId: string; from: string; to: string; availabilityStatus: AvailabilityState; view: "list" | "calendar" }> = {}) => {
    const value = { page, pageSize: meta.pageSize, search, activityId, destinationId, from, to, availabilityStatus: state, view, ...next };
    const params = new URLSearchParams({ page: String(value.page), pageSize: String(value.pageSize), view: value.view });
    for (const [key, item] of Object.entries({ search: value.search, activityId: value.activityId, destinationId: value.destinationId, from: value.from, to: value.to, availabilityStatus: value.availabilityStatus })) if (item) params.set(key, String(item));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [activityId, destinationId, from, meta.pageSize, page, search, state, to, view]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(meta.pageSize), ...(search ? { search } : {}), ...(activityId ? { activityId } : {}), ...(destinationId ? { destinationId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(state ? { availabilityStatus: state } : {}) });
      const result = await listAvailability(params.toString());
      setRows(result.data); setMeta(result.meta);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Unable to load availability");
    } finally { setLoading(false); }
  }, [activityId, destinationId, from, meta.pageSize, page, search, state, to]);

  useEffect(() => { void load(); }, [load]);

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, ScheduleRecord[]>();
    for (const row of rows) {
      const key = new Date(row.startsAt).toISOString().slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [rows]);

  async function saveAdjustment() {
    if (!editing) return;
    setSaving(true); setNotice(""); setError("");
    try {
      await adjustScheduleCapacity(editing, { capacity: Number(capacity), reason });
      setNotice("Capacity adjustment saved and audited"); setEditing(null); setReason(""); await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Unable to adjust capacity");
    } finally { setSaving(false); }
  }

  const adjustAction = (row: ScheduleRecord) => editing === row.id ? <div className="inline-form"><input aria-label={`Capacity for ${row.activity.name}`} type="number" min={row.bookedSeats} value={capacity} onChange={(event) => setCapacity(event.target.value)} /><input aria-label="Adjustment reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} /><button className="primary" type="button" disabled={saving || !reason.trim()} onClick={() => void saveAdjustment()}>Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div> : <button type="button" onClick={() => { setEditing(row.id); setCapacity(String(row.capacity)); }}>Adjust capacity</button>;

  function clearFilters() {
    setSearch(""); setActivityId(""); setDestinationId(""); setFrom(""); setTo(""); setState(""); setPage(1);
    syncUrl({ search: "", activityId: "", destinationId: "", from: "", to: "", availabilityStatus: "", page: 1 });
  }

  return <div><div className="page-heading"><div><p className="eyebrow">INVENTORY</p><h2>Availability</h2><p className="subtext">Calendar and list views of capacity, holds, confirmed seats and remaining inventory.</p></div></div>{notice && <div className="notice success" role="status">{notice}</div>}<section className="panel"><div className="toolbar"><input aria-label="Search availability" placeholder="Search activity or destination..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); syncUrl({ search: event.target.value, page: 1 }); }} /><select aria-label="Filter availability by activity" value={activityId} onChange={(event) => { setActivityId(event.target.value); setPage(1); syncUrl({ activityId: event.target.value, page: 1 }); }}><option value="">All activities</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select><select aria-label="Filter availability by destination" value={destinationId} onChange={(event) => { setDestinationId(event.target.value); setPage(1); syncUrl({ destinationId: event.target.value, page: 1 }); }}><option value="">All destinations</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.city ?? destination.name}</option>)}</select><select aria-label="Filter availability state" value={state} onChange={(event) => { const value = event.target.value as AvailabilityState; setState(value); setPage(1); syncUrl({ availabilityStatus: value, page: 1 }); }}><option value="">All availability</option><option value="AVAILABLE">Available</option><option value="FULL">Full</option><option value="INACTIVE">Inactive</option></select><label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); syncUrl({ from: event.target.value, page: 1 }); }} /></label><label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); syncUrl({ to: event.target.value, page: 1 }); }} /></label><select aria-label="Availability view" value={view} onChange={(event) => { const value = event.target.value as "list" | "calendar"; setView(value); syncUrl({ view: value }); }}><option value="list">List view</option><option value="calendar">Calendar view</option></select><button type="button" onClick={clearFilters}>Clear filters</button></div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="No availability found" /> : view === "calendar" ? <div className="calendar-grid" aria-label="Availability calendar">{calendarGroups.map(([date, dateRows]) => <article className="panel calendar-day" key={date}><h3>{new Date(`${date}T00:00:00Z`).toLocaleDateString()}</h3>{dateRows.map((row) => <div className="calendar-entry" key={row.id}><strong>{new Date(row.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {row.activity.name}</strong><span>{row.availableSeats ?? Math.max(0, row.capacity - row.bookedSeats)} remaining / {row.capacity} capacity</span><span className={`status ${row.isBookable && row.capacity > row.bookedSeats ? "confirmed" : "cancelled"}`}>{!row.isBookable ? "INACTIVE" : row.capacity <= row.bookedSeats ? "FULL" : "AVAILABLE"}</span></div>)}</article>)}</div> : <DataTable rows={rows} columns={[{ key: "activity", label: "Activity", render: (row) => row.activity.name }, { key: "departure", label: "Departure", render: (row) => new Date(row.startsAt).toLocaleString() }, { key: "capacity", label: "Capacity", render: (row) => row.capacity }, { key: "held", label: "Held", render: (row) => row.heldSeats ?? 0 }, { key: "confirmed", label: "Confirmed", render: (row) => row.confirmedSeats ?? Math.max(0, row.bookedSeats - (row.heldSeats ?? 0)) }, { key: "available", label: "Remaining", render: (row) => row.availableSeats ?? Math.max(0, row.capacity - row.bookedSeats) }]} actions={adjustAction} />}{view === "list" && !loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl({ page: nextPage }); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl({ page: 1, pageSize: size }); }} />}</section></div>;
}
