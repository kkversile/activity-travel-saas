"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import type { PaginatedResponse, PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type Partner = { id: string; company: string; contactPerson: string; email: string; phone?: string; status?: string; _count?: { activities?: number; bookings?: number; commissionRules?: number }; revenueMinor?: number };
const initialMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

export function PartnerList({ title, endpoint }: { title: "Suppliers" | "Agents"; endpoint: "suppliers" | "agents" }) {
  const [rows, setRows] = useState<Partner[]>([]);
  const [meta, setMeta] = useState(initialMeta);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("company");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPage(Math.max(1, Number(params.get("page") ?? "1")));
    setSearch(params.get("search") ?? "");
    setStatus(params.get("status") ?? "");
    setSortBy(params.get("sortBy") ?? "company");
    setSortOrder(params.get("sortOrder") === "desc" ? "desc" : "asc");
    const size = Number(params.get("pageSize") ?? "25");
    if ([10, 25, 50, 100].includes(size)) setMeta((current) => ({ ...current, pageSize: size }));
  }, []);

  const syncUrl = useCallback((next: Partial<{ page: number; pageSize: number; search: string; status: string; sortBy: string; sortOrder: "asc" | "desc" }>) => {
    const value = { page, pageSize: meta.pageSize, search, status, sortBy, sortOrder, ...next };
    const params = new URLSearchParams({ page: String(value.page), pageSize: String(value.pageSize), sortBy: value.sortBy, sortOrder: value.sortOrder });
    if (value.search) params.set("search", value.search);
    if (value.status) params.set("status", value.status);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [meta.pageSize, page, search, sortBy, sortOrder, status]);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<PaginatedResponse<Partner>>(`/${endpoint}?page=${page}&pageSize=${meta.pageSize}&sortBy=${sortBy}&sortOrder=${sortOrder}${search ? `&search=${encodeURIComponent(search)}` : ""}${status ? `&status=${status}` : ""}`);
      if (requestId !== latestRequest.current) return;
      setRows(result.data);
      setMeta(result.meta);
    } catch (reason) {
      if (requestId === latestRequest.current) setError(reason instanceof Error ? reason.message : `Unable to load ${title.toLowerCase()}`);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [endpoint, page, meta.pageSize, search, sortBy, sortOrder, status, title]);

  useEffect(() => { void load(); }, [load]);

  const archive = async (id: string) => {
    if (!window.confirm(`Archive this ${title.slice(0, -1).toLowerCase()}?`)) return;
    try {
      await apiRequest(`/${endpoint}/${id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive partner");
    }
  };

  const columns = [
    { key: "company", label: "Company", render: (row: Partner) => <><strong>{row.company}</strong><small>{row.contactPerson}</small></> },
    { key: "email", label: "Email", render: (row: Partner) => row.email },
    { key: "phone", label: "Phone", render: (row: Partner) => row.phone ?? "—" },
    ...(endpoint === "suppliers" ? [{ key: "activities", label: "Activities", render: (row: Partner) => row._count?.activities ?? 0 }] : [{ key: "bookings", label: "Bookings", render: (row: Partner) => row._count?.bookings ?? 0 }, { key: "revenue", label: "Revenue", render: (row: Partner) => (row.revenueMinor ?? 0) / 100 }]),
    { key: "status", label: "Status", render: (row: Partner) => <span className="status confirmed">{row.status ?? "ACTIVE"}</span> }
  ];

  return <div><div className="page-heading"><div><p className="eyebrow">PARTNERS</p><h2>{title}</h2><p className="subtext">Manage partner contacts, status and commercial relationships.</p></div><Link className="primary button-link" href={`/${endpoint}/new`}>Create {title.slice(0, -1).toLowerCase()}</Link></div><section className="panel"><div className="toolbar"><input aria-label={`Search ${title}`} value={search} placeholder={`Search ${title.toLowerCase()}…`} onChange={(e) => { setPage(1); setSearch(e.target.value); syncUrl({ page: 1, search: e.target.value }); }} /><select aria-label={`Filter ${title} status`} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); syncUrl({ page: 1, status: e.target.value }); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select><select aria-label={`Sort ${title}`} value={sortBy} onChange={(e) => { setPage(1); setSortBy(e.target.value); syncUrl({ page: 1, sortBy: e.target.value }); }}><option value="company">Company</option><option value="createdAt">Created date</option><option value="updatedAt">Updated date</option></select><select aria-label={`Sort direction ${title}`} value={sortOrder} onChange={(e) => { const value = e.target.value as "asc" | "desc"; setPage(1); setSortOrder(value); syncUrl({ page: 1, sortOrder: value }); }}><option value="asc">Ascending</option><option value="desc">Descending</option></select><button type="button" onClick={() => { setPage(1); setSearch(""); setStatus(""); syncUrl({ page: 1, search: "", status: "" }); }}>Clear filters</button></div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} found`} /> : <DataTable rows={rows} columns={columns} actions={(row) => <><Link href={`/${endpoint}/${row.id}`}>View</Link><Link href={`/${endpoint}/${row.id}/edit`}>Edit</Link><button type="button" onClick={() => void archive(row.id)}>Archive</button></>} />}{!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl({ page: nextPage }); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl({ page: 1, pageSize: size }); }} />}</section></div>;
}
