"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse, PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";
import { catalogRoute } from "@/services/catalogService";
import type { CatalogKind, CatalogRecord } from "@/services/catalogService";

const initialMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

export function CatalogList({ title, endpoint, createHref, eyebrow = "CATALOGUE" }: { title: string; endpoint: CatalogKind; createHref: string; eyebrow?: string }) {
  const isDestination = endpoint === "destinations";
  const route = catalogRoute(endpoint);
  const [rows, setRows] = useState<CatalogRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(initialMeta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("search") ?? "");
    setStatus(params.get("status") ?? "");
    setCountry(params.get("country") ?? "");
    setState(params.get("state") ?? "");
    setSortBy(params.get("sortBy") ?? "createdAt");
    setSortOrder(params.get("sortOrder") === "asc" ? "asc" : "desc");
    setPage(Math.max(1, Number(params.get("page") ?? "1")));
    const size = Number(params.get("pageSize") ?? "25");
    if ([10, 25, 50, 100].includes(size)) setMeta((current) => ({ ...current, pageSize: size }));
  }, []);

  const syncUrl = useCallback((next: Partial<{ page: number; pageSize: number; search: string; status: string; country: string; state: string; sortBy: string; sortOrder: "asc" | "desc" }>) => {
    const value = { page, pageSize: meta.pageSize, search, status, country, state, sortBy, sortOrder, ...next };
    const params = new URLSearchParams({ page: String(value.page), pageSize: String(value.pageSize), sortBy: value.sortBy, sortOrder: value.sortOrder });
    for (const [key, item] of Object.entries({ search: value.search, status: value.status, country: value.country, state: value.state })) if (item) params.set(key, item);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [country, meta.pageSize, page, search, sortBy, sortOrder, state, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(meta.pageSize), sortBy, sortOrder });
      for (const [key, item] of Object.entries({ search, status, country: isDestination ? country : "", state: isDestination ? state : "" })) if (item) params.set(key, item);
      const result = await apiRequest<PaginatedResponse<CatalogRecord>>(`/${endpoint}?${params.toString()}`);
      setRows(result.data);
      setMeta(result.meta);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to load ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [country, endpoint, isDestination, meta.pageSize, page, search, sortBy, sortOrder, state, status, title]);

  useEffect(() => { void load(); }, [load]);

  const update = (key: "search" | "status" | "country" | "state", value: string) => {
    setPage(1);
    if (key === "search") setSearch(value);
    if (key === "status") setStatus(value);
    if (key === "country") setCountry(value);
    if (key === "state") setState(value);
    syncUrl({ page: 1, [key]: value });
  };

  const clear = () => {
    setSearch(""); setStatus(""); setCountry(""); setState(""); setPage(1); setSortBy("createdAt"); setSortOrder("desc");
    syncUrl({ page: 1, search: "", status: "", country: "", state: "", sortBy: "createdAt", sortOrder: "desc" });
  };

  const archive = async (id: string) => {
    if (!window.confirm(`Archive this ${isDestination ? "destination" : "category"}?`)) return;
    try {
      await apiRequest(`/${endpoint}/${id}`, { method: "DELETE" });
      setMessage(`${isDestination ? "Destination" : "Category"} archived`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive record");
    }
  };

  const columns = [
    { key: "name", label: isDestination ? "Destination" : "Category", render: (row: CatalogRecord) => <><strong>{row.name}</strong><small>{isDestination ? `${row.city ?? ""}${row.country ? `, ${row.country}` : ""}` : row.slug ?? row.address ?? ""}</small></> },
    ...(isDestination ? [{ key: "region", label: "Region", render: (row: CatalogRecord) => `${row.state ?? "—"} · ${row.timezone ?? "—"}` }] : [{ key: "timezone", label: "Timezone", render: (row: CatalogRecord) => row.timezone ?? "—" }, { key: "displayOrder", label: "Display order", render: (row: CatalogRecord) => row.displayOrder ?? 0 }]),
    { key: "status", label: "Status", render: (row: CatalogRecord) => <span className="status confirmed">{row.status ?? "ACTIVE"}</span> },
    { key: "activities", label: "Activities", render: (row: CatalogRecord) => row._count?.activities ?? 0 },
    { key: "updatedAt", label: "Updated", render: (row: CatalogRecord) => row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—" }
  ];

  return <div>
    <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p className="subtext">Server-side search, filters, sorting and pagination.</p></div><Link className="primary button-link" href={createHref}>Create {title.replace(/s$/, "").toLowerCase()}</Link></div>
    <section className="panel">
      {message && <p className="notice success" role="status">{message}</p>}
      <div className="toolbar">
        <input aria-label={`Search ${title}`} placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={(event) => update("search", event.target.value)} />
        <select aria-label={`Filter ${title} status`} value={status} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select>
        {isDestination && <><input aria-label="Filter destinations country" placeholder="Country" value={country} onChange={(event) => update("country", event.target.value)} /><input aria-label="Filter destinations state" placeholder="State or region" value={state} onChange={(event) => update("state", event.target.value)} /></>}
        <select aria-label={`Sort ${title}`} value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); syncUrl({ page: 1, sortBy: event.target.value }); }}><option value="name">Name</option><option value="createdAt">Created date</option><option value="updatedAt">Updated date</option></select>
        <select aria-label={`Sort direction ${title}`} value={sortOrder} onChange={(event) => { const value = event.target.value as "asc" | "desc"; setPage(1); setSortOrder(value); syncUrl({ page: 1, sortOrder: value }); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
        <button type="button" onClick={clear}>Clear filters</button>
      </div>
      {loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} found`} /> : <DataTable rows={rows} columns={columns} actions={(row) => <><Link href={`/${route}/${row.id}`}>View</Link><Link href={`/${route}/${row.id}/edit`}>Edit</Link><button type="button" onClick={() => void archive(row.id)}>Archive</button></>} />}
      {!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl({ page: nextPage }); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl({ page: 1, pageSize: size }); }} />}
    </section>
  </div>;
}
