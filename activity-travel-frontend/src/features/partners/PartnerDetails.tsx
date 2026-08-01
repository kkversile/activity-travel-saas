"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/services/apiClient";
import { ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type Kind = "suppliers" | "agents";
type ActivityLink = { id: string; costMinor: number; commissionPercent: number; status: string; activity: { id: string; name: string; status: string; destination?: string } };
type BookingSummary = { id: string; reference: string; status: string; totalMinor: number; currency: string; createdAt: string; activity?: { name: string } };
type Partner = { id: string; company: string; contactPerson: string; email: string; phone?: string; status?: string; taxDetails?: string; address?: string; commissionPercent?: number; creditLimitMinor?: number; outstandingBalanceMinor?: number; activities?: ActivityLink[]; bookings?: BookingSummary[]; commissionRules?: Array<{ id: string; commissionPercent: number; fixedMinor: number; activity?: { id: string; name: string } | null }> };
type ActivityOption = { id: string; name: string };

export function PartnerDetails({ kind, id }: { kind: Kind; id: string }) {
  const router = useRouter();
  const [row, setRow] = useState<Partner | null>(null);
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [costMinor, setCostMinor] = useState("0");
  const [commissionPercent, setCommissionPercent] = useState("0");
  const [error, setError] = useState("");

  const load = () => void apiRequest<Partner>(`/${kind}/${id}`).then(setRow).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load record"));
  useEffect(() => {
    load();
    if (kind === "suppliers") void apiRequest<{ data: ActivityOption[] }>("/activities?page=1&pageSize=100&sortBy=name&sortOrder=asc").then((result) => setActivityOptions(result.data)).catch(() => undefined);
  }, [id, kind]);

  if (error) return <ErrorPanel message={error} onRetry={() => window.location.reload()} />;
  if (!row) return <LoadingTable />;

  const partner = row;
  async function archive() { if (!window.confirm(`Archive ${partner.company}?`)) return; await apiRequest(`/${kind}/${id}`, { method: "DELETE" }); router.push(`/${kind}`); }
  async function assignActivity(event: React.FormEvent) { event.preventDefault(); if (!selectedActivity) return; try { await apiRequest(`/suppliers/${id}/activities`, { method: "POST", body: JSON.stringify({ activityId: selectedActivity, costMinor: Number(costMinor), commissionPercent: Number(commissionPercent) }) }); setSelectedActivity(""); await new Promise((resolve) => setTimeout(resolve, 0)); load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to assign activity"); } }

  return <div><div className="page-heading"><div><p className="eyebrow">PARTNERS</p><h2>{partner.company}</h2><p className="subtext">{partner.contactPerson} · {partner.email}</p></div><div className="button-row"><Link className="button-link" href={`/${kind}/${id}/edit`}>Edit</Link><button className="danger" onClick={() => void archive()}>Archive</button></div></div><section className="panel detail-grid"><div><span>Status</span><strong>{partner.status ?? "ACTIVE"}</strong></div><div><span>Phone</span><strong>{partner.phone ?? "—"}</strong></div><div><span>Address</span><strong>{partner.address ?? "—"}</strong></div><div><span>Tax details</span><strong>{partner.taxDetails ?? "—"}</strong></div>{kind === "agents" && <><div><span>Commission</span><strong>{partner.commissionPercent ?? 0}%</strong></div><div><span>Credit limit</span><strong>{partner.creditLimitMinor ?? 0}</strong></div><div><span>Outstanding balance</span><strong>{partner.outstandingBalanceMinor ?? 0}</strong></div></>}</section>{kind === "suppliers" ? <><section className="panel"><h3>Assigned activities</h3>{partner.activities?.length ? partner.activities.map((link) => <div className="activity-row" key={link.id}><strong>{link.activity.name}</strong><span>{link.activity.destination ?? ""} · cost {link.costMinor} · commission {link.commissionPercent}% · {link.status}</span></div>) : <p>No activities assigned.</p>}</section><section className="panel"><h3>Assign activity</h3><form className="form-grid" onSubmit={assignActivity}><label>Activity<select value={selectedActivity} onChange={(event) => setSelectedActivity(event.target.value)}><option value="">Select activity</option>{activityOptions.filter((activity) => !partner.activities?.some((link) => link.activity.id === activity.id)).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label><label>Cost minor units<input type="number" min="0" value={costMinor} onChange={(event) => setCostMinor(event.target.value)} /></label><label>Commission percent<input type="number" min="0" max="100" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} /></label><button className="primary" disabled={!selectedActivity}>Assign activity</button></form></section></> : <section className="panel"><h3>Bookings and revenue</h3>{partner.bookings?.length ? partner.bookings.map((booking) => <div className="activity-row" key={booking.id}><strong>{booking.reference}</strong><span>{booking.activity?.name ?? ""} · {booking.status} · {booking.currency} {(booking.totalMinor / 100).toFixed(2)}</span></div>) : <p>No bookings recorded.</p>}</section>}</div>;
}
