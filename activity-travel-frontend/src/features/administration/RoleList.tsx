"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";
import { PaginationControls } from "@/components/table/PaginationControls";
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse, PaginationMeta } from "@/types/api";

type Role = { id: string; name: string; description?: string | null; permissions: string[] | Record<string, unknown>; isActive?: boolean; createdAt?: string; updatedAt?: string };
type Status = "" | "ACTIVE" | "INACTIVE";
const emptyMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

function permissionLabels(permissions: Role["permissions"]): string[] {
  return Array.isArray(permissions) ? permissions : Object.entries(permissions).flatMap(([module, values]) => Array.isArray(values) ? values.map((value) => `${module}:${String(value)}`) : [`${module}:${String(values)}`]);
}

export function RoleList() {
  const [rows, setRows] = useState<Role[]>([]); const [meta, setMeta] = useState(emptyMeta); const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [status, setStatus] = useState<Status>(""); const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc"); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("search") ?? ""); setStatus((params.get("status") ?? "") as Status); setSortOrder(params.get("sortOrder") === "desc" ? "desc" : "asc"); setPage(Math.max(1, Number(params.get("page") ?? "1")));
    const size = Number(params.get("pageSize") ?? "25"); if ([10, 25, 50, 100].includes(size)) setMeta((current) => ({ ...current, pageSize: size }));
  }, []);

  const syncUrl = useCallback((next: Partial<{ page: number; pageSize: number; search: string; status: Status; sortOrder: "asc" | "desc" }> = {}) => {
    const value = { page, pageSize: meta.pageSize, search, status, sortOrder, ...next }; const params = new URLSearchParams({ page: String(value.page), pageSize: String(value.pageSize), sortBy: "name", sortOrder: value.sortOrder });
    if (value.search) params.set("search", value.search); if (value.status) params.set("status", value.status); window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [meta.pageSize, page, search, sortOrder, status]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const params = new URLSearchParams({ page: String(page), pageSize: String(meta.pageSize), sortBy: "name", sortOrder, ...(search ? { search } : {}), ...(status ? { status } : {}) }); const result = await apiRequest<PaginatedResponse<Role>>(`/roles?${params}`); setRows(result.data); setMeta(result.meta); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load roles"); }
    finally { setLoading(false); }
  }, [meta.pageSize, page, search, sortOrder, status]);

  useEffect(() => { void load(); }, [load]);

  async function archive(role: Role) {
    if (!role.id.includes("-") || !window.confirm(`Archive ${role.name}?`)) return;
    setBusyId(role.id); setError(""); setNotice("");
    try { await apiRequest(`/roles/${role.id}`, { method: "DELETE" }); setNotice(`${role.name} archived.`); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive role"); }
    finally { setBusyId(null); }
  }

  function clear() { setPage(1); setSearch(""); setStatus(""); syncUrl({ page: 1, search: "", status: "" }); }

  return <div><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>Roles &amp; Permissions</h2><p className="subtext">Backend-enforced built-in and tenant custom roles.</p></div><Link className="primary button-link" href="/settings/roles/new">Create custom role</Link></div>{notice && <div className="notice success" role="status">{notice}</div>}<section className="panel"><div className="toolbar"><input aria-label="Search roles" placeholder="Search roles..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); syncUrl({ search: event.target.value, page: 1 }); }} /><select aria-label="Filter roles status" value={status} onChange={(event) => { const value = event.target.value as Status; setStatus(value); setPage(1); syncUrl({ status: value, page: 1 }); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><select aria-label="Sort direction roles" value={sortOrder} onChange={(event) => { const value = event.target.value as "asc" | "desc"; setSortOrder(value); setPage(1); syncUrl({ sortOrder: value, page: 1 }); }}><option value="asc">Name A-Z</option><option value="desc">Name Z-A</option></select><button type="button" onClick={clear}>Clear filters</button></div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="No roles found" /> : <div className="role-list">{rows.map((role) => <article className="state-card" key={role.id}><div><strong>{role.name}</strong>{role.description && <small>{role.description}</small>}</div><span className={`status ${role.isActive === false ? "cancelled" : "confirmed"}`}>{role.isActive === false ? "INACTIVE" : "ACTIVE"}</span><span>{permissionLabels(role.permissions).join(" · ")}</span>{role.id.includes("-") && <><Link href={`/settings/roles/${role.id}/edit`}>Edit</Link><button type="button" disabled={busyId === role.id || role.isActive === false} onClick={() => void archive(role)}>{busyId === role.id ? "Archiving..." : "Archive"}</button></>}</article>)}</div>}{!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl({ page: nextPage }); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl({ page: 1, pageSize: size }); }} />}</section></div>;
}
