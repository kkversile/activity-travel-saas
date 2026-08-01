"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, downloadApiFile } from "@/services/apiClient";
import { ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type Kind = "payments" | "refunds" | "invoices";
type RecordData = Record<string, unknown> & { id: string; status?: string; booking?: { id?: string; reference?: string }; payment?: { id?: string }; invoiceNumber?: string };

export function FinanceDetails({ kind, id }: { kind: Kind; id: string }) {
  const router = useRouter(); const [row, setRow] = useState<RecordData | null>(null); const [error, setError] = useState(""); const [refundAmount, setRefundAmount] = useState(""); const [refundReason, setRefundReason] = useState(""); const [refundSaving, setRefundSaving] = useState(false);
  useEffect(() => { void apiRequest<RecordData>(`/${kind}/${id}`).then(setRow).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load finance record")); }, [kind, id]);
  if (error) return <ErrorPanel message={error} onRetry={() => window.location.reload()} />;
  if (!row) return <LoadingTable />;
  const record = row;
  async function action(path: string) { try { await apiRequest(`/${kind}/${id}/${path}`, { method: "POST" }); router.refresh(); setRow(await apiRequest<RecordData>(`/${kind}/${id}`)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed"); } }
  async function requestRefund(event: FormEvent) { event.preventDefault(); if (!row?.booking?.id) return; setRefundSaving(true); setError(""); try { await apiRequest("/refunds", { method: "POST", body: JSON.stringify({ paymentId: id, amountMinor: Number(refundAmount), reason: refundReason }) }); setRefundAmount(""); setRefundReason(""); setRow(await apiRequest<RecordData>(`/${kind}/${id}`)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to request refund"); } finally { setRefundSaving(false); } }
  async function downloadPdf() { try { const blob = await downloadApiFile(`/invoices/${id}/pdf`); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${record.invoiceNumber ?? id}.pdf`; link.click(); URL.revokeObjectURL(link.href); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to download invoice"); } }
  const label = kind === "payments" ? "Payment" : kind === "refunds" ? "Refund" : "Invoice";
  return <div><div className="page-heading"><div><p className="eyebrow">FINANCE</p><h2>{label} {record.invoiceNumber ?? record.id.slice(0, 8)}</h2><p className="subtext">Booking {String(record.booking?.reference ?? "—")}</p></div><div className="button-row">{kind === "payments" && record.status === "PENDING" && <button className="primary" onClick={() => void action("capture")}>Capture</button>}{kind === "refunds" && record.status === "REQUESTED" && <button className="primary" onClick={() => void action("approve")}>Approve</button>}{kind === "refunds" && record.status === "APPROVED" && <button className="primary" onClick={() => void action("process")}>Process</button>}{kind === "invoices" && <button type="button" onClick={() => void downloadPdf()}>Download PDF</button>}{kind === "invoices" && record.status === "DRAFT" && <button className="primary" onClick={() => void action("issue")}>Issue</button>}<Link className="button-link" href={`/${kind}`}>Back</Link></div></div>{error && <div className="notice error">{error}</div>}<section className="panel detail-grid">{Object.entries(record).filter(([key, value]) => !["id", "booking", "payment"].includes(key) && typeof value !== "object").map(([key, value]) => <div key={key}><span>{key}</span><strong>{String(value ?? "—")}</strong></div>)}</section>{kind === "payments" && record.status === "CAPTURED" && <form className="panel form-grid" onSubmit={requestRefund}><h3>Request refund</h3><label>Amount (minor units)<input type="number" min="1" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} required /></label><label>Reason<textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} required /></label><button className="primary" disabled={refundSaving}>{refundSaving ? "Submitting…" : "Request refund"}</button></form>}</div>;
}
