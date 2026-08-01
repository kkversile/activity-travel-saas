"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import { bookingAction, listBookings, type BookingRecord } from "@/services/bookingService";
import type { PaginatedResponse, PaginationMeta } from "@/types/api";
import { DataTable } from "@/components/table/DataTable";
import { PaginationControls } from "@/components/table/PaginationControls";
import { EmptyState, ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

const initialMeta: PaginationMeta = { page: 1, pageSize: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
type Option = { id: string; company: string };

export function BookingList() {
  const [rows, setRows] = useState<BookingRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [agentId, setAgentId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [scheduleFrom, setScheduleFrom] = useState("");
  const [scheduleTo, setScheduleTo] = useState("");
  const [bookingFrom, setBookingFrom] = useState("");
  const [bookingTo, setBookingTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [agents, setAgents] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const read = (key: string) => params.get(key) ?? "";
    setSearch(read("search")); setStatus(read("status")); setPaymentStatus(read("paymentStatus")); setAgentId(read("agentId")); setSupplierId(read("supplierId")); setSource(read("source")); setDestination(read("destination")); setScheduleFrom(read("scheduleFrom")); setScheduleTo(read("scheduleTo")); setBookingFrom(read("bookingFrom")); setBookingTo(read("bookingTo")); setAmountMin(read("amountMin")); setAmountMax(read("amountMax")); setPage(Math.max(1, Number(read("page") || "1"))); setSortBy(read("sortBy") || "createdAt"); setSortOrder(read("sortOrder") === "asc" ? "asc" : "desc");
    const pageSize = Number(read("pageSize") || "25"); if ([10, 25, 50, 100].includes(pageSize)) setMeta((current) => ({ ...current, pageSize }));
    void Promise.all([apiRequest<PaginatedResponse<Option>>("/agents?page=1&pageSize=100&sortBy=company&sortOrder=asc"), apiRequest<PaginatedResponse<Option>>("/suppliers?page=1&pageSize=100&sortBy=company&sortOrder=asc")]).then(([agentResult, supplierResult]) => { setAgents(agentResult.data); setSuppliers(supplierResult.data); }).catch(() => undefined);
  }, []);

  const syncUrl = useCallback((next: Partial<Record<string, string | number>>) => {
    const values = { page, pageSize: meta.pageSize, search, status, paymentStatus, agentId, supplierId, source, destination, scheduleFrom, scheduleTo, bookingFrom, bookingTo, amountMin, amountMax, sortBy, sortOrder, ...next };
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value !== "" && value !== undefined) params.set(key, String(value)); });
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [agentId, amountMax, amountMin, bookingFrom, bookingTo, destination, meta.pageSize, page, paymentStatus, scheduleFrom, scheduleTo, search, sortBy, sortOrder, source, status, supplierId]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(meta.pageSize), sortBy, sortOrder });
      for (const [key, value] of Object.entries({ search, status, paymentStatus, agentId, supplierId, source, destination, scheduleFrom, scheduleTo, bookingFrom, bookingTo, amountMin, amountMax })) if (value) params.set(key, value);
      const result = await listBookings(params.toString()); setRows(result.data); setMeta(result.meta);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load bookings"); } finally { setLoading(false); }
  }, [agentId, amountMax, amountMin, bookingFrom, bookingTo, destination, meta.pageSize, page, paymentStatus, scheduleFrom, scheduleTo, search, sortBy, sortOrder, source, status, supplierId]);
  useEffect(() => { void load(); }, [load]);

  const change = (key: string, value: string) => { setPage(1); const setters: Record<string, (value: string) => void> = { search: setSearch, status: setStatus, paymentStatus: setPaymentStatus, agentId: setAgentId, supplierId: setSupplierId, source: setSource, destination: setDestination, scheduleFrom: setScheduleFrom, scheduleTo: setScheduleTo, bookingFrom: setBookingFrom, bookingTo: setBookingTo, amountMin: setAmountMin, amountMax: setAmountMax }; setters[key]?.(value); syncUrl({ page: 1, [key]: value }); };
  const clear = () => { for (const setter of [setSearch, setStatus, setPaymentStatus, setAgentId, setSupplierId, setSource, setDestination, setScheduleFrom, setScheduleTo, setBookingFrom, setBookingTo, setAmountMin, setAmountMax]) setter(""); setPage(1); syncUrl({ page: 1, search: "", status: "", paymentStatus: "", agentId: "", supplierId: "", source: "", destination: "", scheduleFrom: "", scheduleTo: "", bookingFrom: "", bookingTo: "", amountMin: "", amountMax: "" }); };
  async function action(id: string, name: "confirm" | "cancel" | "complete" | "no-show") { try { await bookingAction(id, name); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update booking"); } }

  const paymentLabel = (row: BookingRecord) => row.payments?.some((payment) => payment.status === "CAPTURED") ? "CAPTURED" : row.payments?.some((payment) => payment.status === "PENDING") ? "PENDING" : "UNPAID";
  return <div><div className="page-heading"><div><p className="eyebrow">BOOKINGS</p><h2>Bookings</h2><p className="subtext">Review booking status, customers, departures, partners and capacity.</p></div><Link className="primary button-link" href="/bookings/new">New booking</Link></div><section className="panel"><div className="toolbar"><input aria-label="Search bookings" placeholder="Reference, customer or email…" value={search} onChange={(event) => change("search", event.target.value)} /><select aria-label="Filter booking status" value={status} onChange={(event) => change("status", event.target.value)}><option value="">All statuses</option><option value="HOLD">Hold</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option><option value="COMPLETED">Completed</option><option value="NO_SHOW">No-show</option></select><select aria-label="Filter booking payment status" value={paymentStatus} onChange={(event) => change("paymentStatus", event.target.value)}><option value="">All payment states</option><option value="PENDING">Pending</option><option value="CAPTURED">Captured</option><option value="FAILED">Failed</option><option value="REFUNDED">Refunded</option></select><select aria-label="Filter booking agent" value={agentId} onChange={(event) => change("agentId", event.target.value)}><option value="">All agents</option>{agents.map((option) => <option key={option.id} value={option.id}>{option.company}</option>)}</select><select aria-label="Filter booking supplier" value={supplierId} onChange={(event) => change("supplierId", event.target.value)}><option value="">All suppliers</option>{suppliers.map((option) => <option key={option.id} value={option.id}>{option.company}</option>)}</select><input aria-label="Filter booking destination" placeholder="Destination" value={destination} onChange={(event) => change("destination", event.target.value)} /><input aria-label="Filter booking source" placeholder="Source" value={source} onChange={(event) => change("source", event.target.value)} /><input aria-label="Booking amount minimum" type="number" min="0" placeholder="Min amount" value={amountMin} onChange={(event) => change("amountMin", event.target.value)} /><input aria-label="Booking amount maximum" type="number" min="0" placeholder="Max amount" value={amountMax} onChange={(event) => change("amountMax", event.target.value)} /><label>Departure from<input aria-label="Departure from" type="date" value={scheduleFrom} onChange={(event) => change("scheduleFrom", event.target.value)} /></label><label>Departure to<input aria-label="Departure to" type="date" value={scheduleTo} onChange={(event) => change("scheduleTo", event.target.value)} /></label><button type="button" onClick={clear}>Clear filters</button></div><div className="toolbar"><select aria-label="Sort bookings" value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); syncUrl({ sortBy: event.target.value, page: 1 }); }}><option value="createdAt">Newest</option><option value="reference">Reference</option><option value="totalMinor">Total</option><option value="status">Status</option></select><select aria-label="Sort direction bookings" value={sortOrder} onChange={(event) => { const value = event.target.value as "asc" | "desc"; setSortOrder(value); setPage(1); syncUrl({ sortOrder: value, page: 1 }); }}><option value="desc">Descending</option><option value="asc">Ascending</option></select></div>{loading ? <LoadingTable /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="No bookings found" /> : <DataTable rows={rows} columns={[{ key: "reference", label: "Reference", render: (row) => <><strong>{row.reference}</strong><small>{row.customerName}</small></> }, { key: "activity", label: "Activity", render: (row) => row.activity.name }, { key: "departure", label: "Departure", render: (row) => new Date(row.schedule.startsAt).toLocaleString() }, { key: "passengers", label: "Passengers", render: (row) => row.passengers.length }, { key: "total", label: "Total", render: (row) => `${row.currency} ${(row.totalMinor / 100).toFixed(2)}` }, { key: "payment", label: "Payment", render: paymentLabel }, { key: "status", label: "Status", render: (row) => <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span> }, { key: "source", label: "Source", render: (row) => row.source ?? "DIRECT" }]} actions={(row) => <div className="row-actions"><Link href={`/bookings/${row.id}`}>View</Link>{row.status === "HOLD" && <><button type="button" onClick={() => void action(row.id, "confirm")}>Confirm</button><button type="button" onClick={() => void action(row.id, "cancel")}>Cancel</button></>}{row.status === "CONFIRMED" && <><button type="button" onClick={() => void action(row.id, "complete")}>Complete</button><button type="button" onClick={() => void action(row.id, "no-show")}>No-show</button></>}</div>} />}{!loading && !error && <PaginationControls meta={meta} onPageChange={(nextPage) => { setPage(nextPage); syncUrl({ page: nextPage }); }} onPageSizeChange={(size) => { setPage(1); setMeta((current) => ({ ...current, pageSize: size })); syncUrl({ page: 1, pageSize: size }); }} />}</section></div>;
}
