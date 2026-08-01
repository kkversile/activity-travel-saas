"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse, PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type Log = { id: string; action: string; entityType: string; entityId?: string; createdAt: string };
const initialMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

export function AuditLogList() {
  const [rows, setRows] = useState<Log[]>([]); const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [meta, setMeta] = useState<PaginationMeta>(initialMeta); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const params = new URLSearchParams(window.location.search); setSearch(params.get("search") ?? ""); setPage(Math.max(1, Number(params.get("page") ?? "1"))); const size = Number(params.get("pageSize") ?? "25"); if ([10, 25, 50, 100].includes(size)) setMeta((current) => ({ ...current, pageSize: size })); }, []);
  const syncUrl = useCallback((nextPage: number, nextSearch: string, size: number) => { const params = new URLSearchParams({ page: String(nextPage), pageSize: String(size) }); if (nextSearch) params.set("search", nextSearch); window.history.replaceState(null, "", `${window.location.pathname}?${params}`); }, []);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result = await apiRequest<PaginatedResponse<Log>>(`/audit-logs?page=${page}&pageSize=${meta.pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`); setRows(result.data); setMeta(result.meta); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load audit logs"); } finally { setLoading(false); } }, [meta.pageSize, page, search]);
  useEffect(() => { void load(); }, [load]);
  return <div><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>Audit Logs</h2><p className="subtext">Security-sensitive and commercial changes for this tenant.</p></div></div><section className="panel"><div className="toolbar"><input aria-label="Search audit logs" placeholder="Search actions or entities…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); syncUrl(1, event.target.value, meta.pageSize); }} /><button type="button" onClick={() => { setSearch(""); setPage(1); syncUrl(1, "", meta.pageSize); }}>Clear filters</button></div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="No audit events found" /> : <DataTable rows={rows} columns={[{ key: "action", label: "Action", render: (row) => <strong>{row.action}</strong> }, { key: "entity", label: "Entity", render: (row) => `${row.entityType} ${row.entityId ?? ""}` }, { key: "createdAt", label: "When", render: (row) => new Date(row.createdAt).toLocaleString() }]} />}{!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl(nextPage, search, meta.pageSize); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl(1, search, size); }} />}</section></div>;
}
