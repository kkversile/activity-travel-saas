"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import { listActivities } from "@/services/activityService";
import { listVariants, type VariantRecord } from "@/services/variantService";
import { bulkUpdateScheduleStatus, listSchedules, type ScheduleRecord } from "@/services/inventoryService";
import type { Activity } from "@/types/activity";
import type { PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

const initialMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

export function ScheduleList() {
  const [rows, setRows] = useState<ScheduleRecord[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [variants, setVariants] = useState<VariantRecord[]>([]);
  const [search, setSearch] = useState("");
  const [activityId, setActivityId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [bookable, setBookable] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState("startsAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const latestRequest = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("search") ?? ""); setActivityId(params.get("activityId") ?? ""); setVariantId(params.get("variantId") ?? ""); setBookable(params.get("bookable") ?? ""); setFrom(params.get("from") ?? ""); setTo(params.get("to") ?? ""); setSortBy(params.get("sortBy") ?? "startsAt"); setSortOrder(params.get("sortOrder") === "desc" ? "desc" : "asc"); setPage(Math.max(1, Number(params.get("page") ?? "1")));
    const size = Number(params.get("pageSize") ?? "25"); if ([10, 25, 50, 100].includes(size)) setMeta((current) => ({ ...current, pageSize: size }));
    void Promise.all([listActivities({ page: 1, pageSize: 100, sortBy: "createdAt", sortOrder: "desc" }), listVariants("page=1&pageSize=100")]).then(([activityResult, variantResult]) => { setActivities(activityResult.data); setVariants(variantResult.data); }).catch(() => undefined);
  }, []);

  const syncUrl = useCallback((next: Partial<{ page: number; pageSize: number; search: string; activityId: string; variantId: string; bookable: string; from: string; to: string; sortBy: string; sortOrder: "asc" | "desc" }>) => {
    const value = { page, pageSize: meta.pageSize, search, activityId, variantId, bookable, from, to, sortBy, sortOrder, ...next };
    const params = new URLSearchParams({ page: String(value.page), pageSize: String(value.pageSize), sortBy: value.sortBy, sortOrder: value.sortOrder });
    for (const [key, item] of Object.entries({ search: value.search, activityId: value.activityId, variantId: value.variantId, bookable: value.bookable, from: value.from, to: value.to })) if (item) params.set(key, item);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [activityId, bookable, from, meta.pageSize, page, search, sortBy, sortOrder, to, variantId]);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(meta.pageSize), sortBy, sortOrder });
      for (const [key, item] of Object.entries({ search, activityId, variantId, bookable, from, to })) if (item) params.set(key, item);
      const result = await listSchedules(params.toString()); if (requestId !== latestRequest.current) return; setRows(result.data); setMeta(result.meta);
    } catch (reason) { if (requestId === latestRequest.current) setError(reason instanceof Error ? reason.message : "Unable to load schedules"); }
    finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [activityId, bookable, from, meta.pageSize, page, search, sortBy, sortOrder, to, variantId]);

  useEffect(() => { void load(); }, [load]);
  const update = (key: "search" | "activityId" | "variantId" | "bookable" | "from" | "to", value: string) => { setPage(1); if (key === "search") setSearch(value); if (key === "activityId") { setActivityId(value); setVariantId(""); } if (key === "variantId") setVariantId(value); if (key === "bookable") setBookable(value); if (key === "from") setFrom(value); if (key === "to") setTo(value); syncUrl({ page: 1, [key]: value, ...(key === "activityId" ? { variantId: "" } : {}) }); };
  const clear = () => { setSearch(""); setActivityId(""); setVariantId(""); setBookable(""); setFrom(""); setTo(""); setSortBy("startsAt"); setSortOrder("asc"); setPage(1); syncUrl({ page: 1, search: "", activityId: "", variantId: "", bookable: "", from: "", to: "", sortBy: "startsAt", sortOrder: "asc" }); };
  const visibleVariants = activityId ? variants.filter((variant) => variant.activity.id === activityId) : variants;
  const remove = async (id: string) => { if (!window.confirm("Archive this schedule?")) return; try { await apiRequest(`/schedules/${id}`, { method: "DELETE" }); setMessage("Schedule archived"); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive schedule"); } };
  const bulkStatus = async (isBookable: boolean) => { if (!selectedIds.length || !window.confirm(`${isBookable ? "Activate" : "Deactivate"} ${selectedIds.length} selected schedules?`)) return; try { const result = await bulkUpdateScheduleStatus(selectedIds, isBookable); setSelectedIds([]); setMessage(`${result.updated} schedule(s) ${isBookable ? "activated" : "deactivated"}`); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update schedules"); } };

  return <div><div className="page-heading"><div><p className="eyebrow">INVENTORY</p><h2>Schedules</h2><p className="subtext">Manage departures, cut-offs and bookable capacity.</p></div><Link className="primary button-link" href="/schedules/new">Create schedule</Link></div>{message && <p className="notice success" role="status">{message}</p>}<section className="panel"><div className="toolbar"><input aria-label="Search schedules" placeholder="Search schedules…" value={search} onChange={(event) => update("search", event.target.value)} /><select aria-label="Filter schedules activity" value={activityId} onChange={(event) => update("activityId", event.target.value)}><option value="">All activities</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select><select aria-label="Filter schedules variant" value={variantId} onChange={(event) => update("variantId", event.target.value)}><option value="">All variants</option>{visibleVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select><select aria-label="Filter schedules bookable" value={bookable} onChange={(event) => update("bookable", event.target.value)}><option value="">All statuses</option><option value="true">Bookable</option><option value="false">Inactive</option></select><label>From<input aria-label="Schedules from date" type="date" value={from} onChange={(event) => update("from", event.target.value)} /></label><label>To<input aria-label="Schedules to date" type="date" value={to} onChange={(event) => update("to", event.target.value)} /></label><select aria-label="Sort schedules" value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); syncUrl({ page: 1, sortBy: event.target.value }); }}><option value="startsAt">Departure</option><option value="capacity">Capacity</option><option value="bookedSeats">Booked seats</option></select><select aria-label="Sort direction schedules" value={sortOrder} onChange={(event) => { const value = event.target.value as "asc" | "desc"; setSortOrder(value); setPage(1); syncUrl({ page: 1, sortOrder: value }); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select><button type="button" onClick={clear}>Clear filters</button>{selectedIds.length > 0 && <><button type="button" onClick={() => void bulkStatus(true)}>Activate selected</button><button type="button" onClick={() => void bulkStatus(false)}>Deactivate selected</button></>}</div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="No schedules found" /> : <DataTable rows={rows} selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds} columns={[{ key: "activity", label: "Activity", render: (row) => <>{row.activity.name}{row.variant && <small>{row.variant.name}</small>}</> }, { key: "departure", label: "Departure", render: (row) => <>{new Date(row.startsAt).toLocaleString()}<small>{row.timezone ?? "UTC"}</small></> }, { key: "capacity", label: "Capacity", render: (row) => row.capacity }, { key: "booked", label: "Booked", render: (row) => row.bookedSeats }, { key: "held", label: "Held", render: (row) => row.heldSeats ?? 0 }, { key: "available", label: "Available", render: (row) => row.availableSeats ?? Math.max(0, row.capacity - row.bookedSeats) }, { key: "cutoff", label: "Cut-off", render: (row) => `${row.cutoffMinutes} min` }, { key: "status", label: "Status", render: (row) => <span className={`status ${row.isBookable ? "confirmed" : "cancelled"}`}>{row.isBookable ? "BOOKABLE" : "INACTIVE"}</span> }]} actions={(row) => <><Link href={`/schedules/${row.id}`}>View</Link><Link href={`/schedules/${row.id}/edit`}>Edit</Link><button type="button" onClick={() => void remove(row.id)}>Archive</button></>} />}{!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setSelectedIds([]); setPage(nextPage); syncUrl({ page: nextPage }); }} onPageSizeChange={(size) => { setSelectedIds([]); setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl({ page: 1, pageSize: size }); }} />}</section></div>;
}
