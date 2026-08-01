"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, downloadApiFile } from "@/services/apiClient";
import type { PaginatedResponse, PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type ReportRow = Record<string, unknown> & { id: string };
type ReportKind = "bookings" | "capacity" | "cancellations" | "payments" | "refunds" | "agents" | "suppliers" | "activities";
const initialMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

export function OperationalReport({ title, kind }: { title: string; kind: ReportKind }) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("search") ?? ""); setFrom(params.get("from") ?? ""); setTo(params.get("to") ?? ""); setStatus(params.get("status") ?? ""); setPage(Math.max(1, Number(params.get("page") ?? "1")));
    const pageSize = Number(params.get("pageSize") ?? "25"); if ([10, 25, 50, 100].includes(pageSize)) setMeta((current) => ({ ...current, pageSize }));
  }, []);
  const syncUrl = useCallback((next: { page?: number; pageSize?: number; search?: string; from?: string; to?: string; status?: string }) => {
    const value = { page, pageSize: meta.pageSize, search, from, to, status, ...next }; const params = new URLSearchParams({ page: String(value.page), pageSize: String(value.pageSize) });
    if (value.search) params.set("search", value.search); if (value.from) params.set("from", value.from); if (value.to) params.set("to", value.to); if (value.status) params.set("status", value.status);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [from, meta.pageSize, page, search, status, to]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(meta.pageSize) }); if (search) params.set("search", search); if (from) params.set("from", from); if (to) params.set("to", to); if (status) params.set("status", status);
      const result = await apiRequest<PaginatedResponse<ReportRow>>(`/reports/${kind}?${params}`); setRows(result.data); setMeta(result.meta);
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Unable to load ${title.toLowerCase()}`); }
    finally { setLoading(false); }
  }, [from, kind, meta.pageSize, page, search, status, title, to]);
  useEffect(() => { void load(); }, [load]);

  async function exportCsv() { const params = new URLSearchParams(); if (search) params.set("search", search); if (from) params.set("from", from); if (to) params.set("to", to); if (status) params.set("status", status); try { const blob = await downloadApiFile(`/reports/${kind}/export?${params}`); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${kind}-report.csv`; link.click(); URL.revokeObjectURL(link.href); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to export report"); } }
  const statusOptions = kind === "bookings" ? ["HOLD", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] : kind === "capacity" ? [] : kind === "payments" ? ["PENDING", "CAPTURED", "FAILED", "REFUNDED"] : kind === "refunds" ? ["REQUESTED", "APPROVED", "PROCESSED", "FAILED"] : kind === "activities" ? ["DRAFT", "PUBLISHED", "ARCHIVED"] : [];
  const columns = kind === "bookings" || kind === "cancellations" ? [
    { key: "reference", label: "Reference", render: (row: ReportRow) => <strong>{String(row.reference ?? "—")}</strong> }, { key: "customerName", label: "Customer", render: (row: ReportRow) => String(row.customerName ?? "—") }, { key: "status", label: "Status", render: (row: ReportRow) => <span className="status confirmed">{String(row.status ?? "—")}</span> }, { key: "totalMinor", label: "Total", render: (row: ReportRow) => `${String(row.currency ?? "")} ${(Number(row.totalMinor ?? 0) / 100).toFixed(2)}` }
  ] : kind === "capacity" ? [
    { key: "activity", label: "Activity", render: (row: ReportRow) => String((row.activity as { name?: string } | undefined)?.name ?? "—") }, { key: "startsAt", label: "Departure", render: (row: ReportRow) => new Date(String(row.startsAt)).toLocaleString() }, { key: "capacity", label: "Capacity", render: (row: ReportRow) => String(row.capacity ?? 0) }, { key: "bookedSeats", label: "Booked", render: (row: ReportRow) => String(row.bookedSeats ?? 0) }, { key: "available", label: "Available", render: (row: ReportRow) => String(row.available ?? 0) }
  ] : [{ key: "status", label: "Status", render: (row: ReportRow) => <span className="status confirmed">{String(row.status ?? "—")}</span> }, { key: "company", label: "Company", render: (row: ReportRow) => String(row.company ?? row.reason ?? row.providerReference ?? "—") }, { key: "amount", label: "Amount", render: (row: ReportRow) => String(row.amountMinor ?? row.requestedAmountMinor ?? "—") }];

  return <div><div className="page-heading"><div><p className="eyebrow">REPORTS</p><h2>{title}</h2><p className="subtext">Tenant-scoped data with server-side filtering and pagination.</p></div><button type="button" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div><section className="panel"><div className="toolbar"><input aria-label={`Search ${title}`} placeholder="Search…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); syncUrl({ search: event.target.value, page: 1 }); }} />{statusOptions.length > 0 && <label>Status<select aria-label={`Filter ${title} status`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); syncUrl({ status: event.target.value, page: 1 }); }}><option value="">All statuses</option>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}<label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); syncUrl({ from: event.target.value, page: 1 }); }} /></label><label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); syncUrl({ to: event.target.value, page: 1 }); }} /></label><button type="button" onClick={() => { setSearch(""); setFrom(""); setTo(""); setStatus(""); setPage(1); syncUrl({ search: "", from: "", to: "", status: "", page: 1 }); }}>Clear filters</button></div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} found`} /> : <DataTable rows={rows} columns={columns} />}{!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl({ page: nextPage }); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl({ page: 1, pageSize: size }); }} />}</section></div>;
}
