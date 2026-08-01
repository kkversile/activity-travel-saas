"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import { listActivities } from "@/services/activityService";
import type { Activity } from "@/types/activity";
import type { PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type CategoryOption = { id: string; name: string };
type DestinationOption = { id: string; city: string; country: string };

export default function ActivitiesPage() {
  const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [rows, setRows] = useState<Activity[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: Number(query?.get("page") ?? 1), pageSize: Number(query?.get("pageSize") ?? 25), totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
  const [search, setSearch] = useState(query?.get("search") ?? "");
  const [status, setStatus] = useState(query?.get("status") ?? "");
  const [categoryId, setCategoryId] = useState(query?.get("categoryId") ?? "");
  const [destinationId, setDestinationId] = useState(query?.get("destinationId") ?? "");
  const [minDuration, setMinDuration] = useState(query?.get("minDuration") ?? "");
  const [maxDuration, setMaxDuration] = useState(query?.get("maxDuration") ?? "");
  const [hasActiveSchedule, setHasActiveSchedule] = useState(query?.get("hasActiveSchedule") ?? "");
  const [publishedFrom, setPublishedFrom] = useState(query?.get("publishedFrom") ?? "");
  const [publishedTo, setPublishedTo] = useState(query?.get("publishedTo") ?? "");
  const [createdFrom, setCreatedFrom] = useState(query?.get("createdFrom") ?? "");
  const [createdTo, setCreatedTo] = useState(query?.get("createdTo") ?? "");
  const [sortBy, setSortBy] = useState(query?.get("sortBy") ?? "updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(query?.get("sortOrder") === "asc" ? "asc" : "desc");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [page, setPage] = useState(Number(query?.get("page") ?? 1));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      apiRequest<CategoryOption[]>("/activities/catalog/categories"),
      apiRequest<DestinationOption[]>("/activities/catalog/destinations")
    ]).then(([categoryRows, destinationRows]) => { setCategories(categoryRows); setDestinations(destinationRows); }).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await listActivities({ page, pageSize: meta.pageSize, search, status, categoryId, destinationId, minDuration, maxDuration, hasActiveSchedule, publishedFrom, publishedTo, createdFrom, createdTo, sortBy, sortOrder });
      setRows(result.data); setMeta(result.meta);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load activities"); }
    finally { setLoading(false); }
  }, [page, meta.pageSize, search, status, categoryId, destinationId, minDuration, maxDuration, hasActiveSchedule, publishedFrom, publishedTo, createdFrom, createdTo, sortBy, sortOrder, setRows, setMeta, setLoading, setError]);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    { key: "name", label: "Activity", render: (row: Activity) => <><strong>{row.name}</strong><small>{row.slug}</small></> },
    { key: "destination", label: "Destination", render: (row: Activity) => row.destination },
    { key: "category", label: "Category", render: (row: Activity) => row.category?.name ?? "—" },
    { key: "duration", label: "Duration", render: (row: Activity) => `${row.durationMinutes} min` },
    { key: "status", label: "Status", render: (row: Activity) => <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span> },
    { key: "activeSchedules", label: "Active schedules", render: (row: Activity) => row.schedules?.filter((schedule) => schedule.isBookable !== false).length ?? 0 },
    { key: "startingPrice", label: "Starting price", render: (row: Activity) => { const price = row.pricePlans?.map((plan) => plan.adultMinor).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)[0]; return price === undefined ? "—" : `${row.pricePlans.find((plan) => plan.adultMinor === price)?.currency ?? ""} ${(price / 100).toFixed(2)}`; } },
    { key: "publishedAt", label: "Published", render: (row: Activity) => row.publishedAt ? new Date(row.publishedAt).toLocaleDateString() : "—" },
    { key: "updated", label: "Updated", render: (row: Activity) => new Date(row.updatedAt).toLocaleDateString() }
  ], []);

  const syncUrl = (nextPage: number, nextPageSize: number, overrides: Partial<Record<string, string>> = {}) => {
    const values = { search, status, categoryId, destinationId, minDuration, maxDuration, hasActiveSchedule, publishedFrom, publishedTo, createdFrom, createdTo, sortBy, sortOrder, ...overrides };
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize), ...Object.fromEntries(Object.entries(values).filter(([, value]) => value)) });
    window.history.replaceState(null, "", `/activities?${params}`);
  };
  const change = (key: string, value: string) => {
    setPage(1);
    if (key === "search") setSearch(value); if (key === "status") setStatus(value); if (key === "categoryId") setCategoryId(value); if (key === "destinationId") setDestinationId(value); if (key === "minDuration") setMinDuration(value); if (key === "maxDuration") setMaxDuration(value); if (key === "hasActiveSchedule") setHasActiveSchedule(value); if (key === "publishedFrom") setPublishedFrom(value); if (key === "publishedTo") setPublishedTo(value); if (key === "createdFrom") setCreatedFrom(value); if (key === "createdTo") setCreatedTo(value);
    syncUrl(1, meta.pageSize, { [key]: value });
  };
  const clear = () => { setSearch(""); setStatus(""); setCategoryId(""); setDestinationId(""); setMinDuration(""); setMaxDuration(""); setHasActiveSchedule(""); setPublishedFrom(""); setPublishedTo(""); setCreatedFrom(""); setCreatedTo(""); setSortBy("updatedAt"); setSortOrder("desc"); setPage(1); syncUrl(1, meta.pageSize, { search: "", status: "", categoryId: "", destinationId: "", minDuration: "", maxDuration: "", hasActiveSchedule: "", publishedFrom: "", publishedTo: "", createdFrom: "", createdTo: "", sortBy: "updatedAt", sortOrder: "desc" }); };

  return <div>
    <div className="page-heading"><div><p className="eyebrow">CATALOGUE</p><h2>Activities</h2><p className="subtext">Search and manage activities using server-side filters.</p></div><Link className="primary button-link" href="/activities/new">Create activity</Link></div>
    <section className="panel"><div className="toolbar">
      <input aria-label="Search activities" placeholder="Search activities..." value={search} onChange={(event) => change("search", event.target.value)} />
      <select aria-label="Filter status" value={status} onChange={(event) => change("status", event.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select>
      <select aria-label="Filter category" value={categoryId} onChange={(event) => change("categoryId", event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Filter destination" value={destinationId} onChange={(event) => change("destinationId", event.target.value)}><option value="">All destinations</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.city}, {item.country}</option>)}</select>
      <input aria-label="Minimum duration" type="number" min="0" placeholder="Min minutes" value={minDuration} onChange={(event) => change("minDuration", event.target.value)} />
      <input aria-label="Maximum duration" type="number" min="0" placeholder="Max minutes" value={maxDuration} onChange={(event) => change("maxDuration", event.target.value)} />
      <select aria-label="Filter schedule" value={hasActiveSchedule} onChange={(event) => change("hasActiveSchedule", event.target.value)}><option value="">Any schedule</option><option value="true">Has active schedule</option><option value="false">No active schedule</option></select>
      <label>Published from<input aria-label="Published from" type="date" value={publishedFrom} onChange={(event) => change("publishedFrom", event.target.value)} /></label>
      <label>Published to<input aria-label="Published to" type="date" value={publishedTo} onChange={(event) => change("publishedTo", event.target.value)} /></label>
      <label>Created from<input aria-label="Created from" type="date" value={createdFrom} onChange={(event) => change("createdFrom", event.target.value)} /></label>
      <label>Created to<input aria-label="Created to" type="date" value={createdTo} onChange={(event) => change("createdTo", event.target.value)} /></label>
      <select aria-label="Sort activities" value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); syncUrl(1, meta.pageSize, { sortBy: event.target.value }); }}><option value="name">Name</option><option value="createdAt">Created date</option><option value="updatedAt">Updated date</option><option value="publishedAt">Published date</option><option value="status">Status</option></select>
      <select aria-label="Sort direction activities" value={sortOrder} onChange={(event) => { const value = event.target.value as "asc" | "desc"; setSortOrder(value); setPage(1); syncUrl(1, meta.pageSize, { sortOrder: value }); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
      <button type="button" onClick={clear}>Clear filters</button>
    </div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="No activities found" description="Adjust your filters or create an activity." /> : <DataTable rows={rows} columns={columns} actions={(row) => <><Link href={`/activities/${row.id}`}>View</Link><Link href={`/activities/${row.id}/edit`}>Edit</Link><button type="button" onClick={() => { if (window.confirm("Archive this activity?")) void apiRequest(`/activities/${row.id}`, { method: "DELETE" }).then(() => void load()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to archive activity")); }}>Archive</button></>} />} {!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl(nextPage, meta.pageSize); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl(1, size); }} />}</section>
  </div>;
}
