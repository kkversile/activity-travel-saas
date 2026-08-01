"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/services/apiClient";
import { updateBooking, type BookingRecord } from "@/services/bookingService";

type Partner = { id: string; company: string };

export function BookingEdit({ booking }: { booking: BookingRecord }) {
  const router = useRouter();
  const [form, setForm] = useState({ customerName: booking.customerName, customerEmail: booking.customerEmail, customerPhone: booking.customerPhone ?? "", notes: booking.notes ?? "", source: booking.source ?? "DIRECT", agentId: booking.agent?.id ?? "", supplierId: booking.supplier?.id ?? "" });
  const [agents, setAgents] = useState<Partner[]>([]);
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([apiRequest<{ data: Partner[] }>("/agents?page=1&pageSize=100&sortBy=company&sortOrder=asc"), apiRequest<{ data: Partner[] }>("/suppliers?page=1&pageSize=100&sortBy=company&sortOrder=asc")]).then(([agentResult, supplierResult]) => { setAgents(agentResult.data); setSuppliers(supplierResult.data); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await updateBooking(booking.id, { ...form, ...(form.agentId ? { agentId: form.agentId } : { agentId: null }), ...(form.supplierId ? { supplierId: form.supplierId } : { supplierId: null }) });
      setDirty(false); router.push(`/bookings/${booking.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update booking"); } finally { setSaving(false); }
  }

  function cancel() { if (!dirty || window.confirm("Discard unsaved changes?")) router.back(); }

  return <div><div className="page-heading"><div><p className="eyebrow">BOOKINGS / EDIT</p><h2>Edit {booking.reference}</h2><p className="subtext">Activity, departure, passenger capacity, totals, and status are protected from unsafe edits.</p></div></div><form className="panel form-grid" onSubmit={save}><fieldset><legend>Customer</legend><label>Name<input value={form.customerName} onChange={(event) => { setDirty(true); setForm({ ...form, customerName: event.target.value }); }} required /></label><label>Email<input type="email" value={form.customerEmail} onChange={(event) => { setDirty(true); setForm({ ...form, customerEmail: event.target.value }); }} required /></label><label>Phone<input value={form.customerPhone} onChange={(event) => { setDirty(true); setForm({ ...form, customerPhone: event.target.value }); }} /></label></fieldset><fieldset><legend>Partner attribution</legend><label>Source<select value={form.source} onChange={(event) => { setDirty(true); setForm({ ...form, source: event.target.value }); }}><option value="DIRECT">Direct</option><option value="AGENT">Agent</option><option value="SUPPLIER">Supplier</option><option value="PARTNER">Partner</option></select></label><label>Agent<select value={form.agentId} onChange={(event) => { setDirty(true); setForm({ ...form, agentId: event.target.value }); }}><option value="">No agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.company}</option>)}</select></label><label>Supplier<select value={form.supplierId} onChange={(event) => { setDirty(true); setForm({ ...form, supplierId: event.target.value }); }}><option value="">No supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.company}</option>)}</select></label></fieldset><label>Notes<textarea rows={4} value={form.notes} onChange={(event) => { setDirty(true); setForm({ ...form, notes: event.target.value }); }} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" onClick={cancel}>Cancel</button><button className="primary" disabled={saving || !dirty}>{saving ? "Saving..." : "Save booking"}</button></div></form></div>;
}
