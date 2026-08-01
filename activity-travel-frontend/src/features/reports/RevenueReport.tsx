"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, downloadApiFile } from "@/services/apiClient";
import { ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type Revenue = { totals: { bookings: number; totalMinor: number; taxMinor: number; discountMinor: number } };

export function RevenueReport() {
  const [data, setData] = useState<Revenue | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { const params = new URLSearchParams(window.location.search); setFrom(params.get("from") ?? ""); setTo(params.get("to") ?? ""); }, []);
  const syncUrl = useCallback((next: { from?: string; to?: string }) => { const value = { from, to, ...next }; const params = new URLSearchParams(); if (value.from) params.set("from", value.from); if (value.to) params.set("to", value.to); window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`); }, [from, to]);
  const load = useCallback(async () => { setError(""); setData(null); try { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); setData(await apiRequest<Revenue>(`/reports/revenue?${params}`)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load revenue report"); } }, [from, to]);
  useEffect(() => { void load(); }, [load]);
  const exportCsv = async () => { if (!data) return; try { const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); const blob = await downloadApiFile(`/reports/revenue/export?${params}`); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "revenue-report.csv"; link.click(); URL.revokeObjectURL(link.href); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to export revenue report"); } };
  const clear = () => { setFrom(""); setTo(""); syncUrl({ from: "", to: "" }); };
  return <div><div className="page-heading"><div><p className="eyebrow">REPORTS</p><h2>Revenue Report</h2><p className="subtext">Confirmed and completed revenue totals.</p></div><button type="button" onClick={() => void exportCsv()} disabled={!data}>Export CSV</button></div><section className="panel toolbar"><label>From<input aria-label="Revenue report from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); syncUrl({ from: event.target.value }); }} /></label><label>To<input aria-label="Revenue report to" type="date" value={to} onChange={(event) => { setTo(event.target.value); syncUrl({ to: event.target.value }); }} /></label><button type="button" onClick={clear}>Clear filters</button></section><section className="metric-grid">{error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !data ? <LoadingTable /> : <><div className="metric-card"><span>Bookings</span><strong>{data.totals.bookings}</strong></div><div className="metric-card"><span>Revenue</span><strong>{(data.totals.totalMinor / 100).toFixed(2)}</strong></div><div className="metric-card"><span>Tax</span><strong>{(data.totals.taxMinor / 100).toFixed(2)}</strong></div></>}</section></div>;
}
