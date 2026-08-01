"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/services/apiClient";

type VoucherFormValues = { code: string; discountPercent: string; discountMinor: string; maxRedemptions: string; validTo: string; isActive: boolean };
const empty: VoucherFormValues = { code: "", discountPercent: "", discountMinor: "", maxRedemptions: "", validTo: "", isActive: true };

export function VoucherForm({ id }: { id?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<VoucherFormValues>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void apiRequest<Record<string, unknown>>(`/vouchers/${id}`).then((value) => {
      if (!active) return;
      setForm({
        code: String(value.code ?? ""),
        discountPercent: value.discountPercent === null || value.discountPercent === undefined ? "" : String(value.discountPercent),
        discountMinor: value.discountMinor === null || value.discountMinor === undefined ? "" : String(value.discountMinor),
        maxRedemptions: value.maxRedemptions === null || value.maxRedemptions === undefined ? "" : String(value.maxRedemptions),
        validTo: value.validTo ? String(value.validTo).slice(0, 10) : "",
        isActive: Boolean(value.isActive),
      });
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load voucher"); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  const change = (key: keyof VoucherFormValues, value: string | boolean) => { setDirty(true); setForm((current) => ({ ...current, [key]: value })); };
  async function submit(event: React.FormEvent, continueEditing = false) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...(id ? {} : { code: form.code.trim().toUpperCase() }), ...(form.discountPercent ? { discountPercent: Number(form.discountPercent), discountMinor: undefined } : {}), ...(form.discountMinor ? { discountMinor: Number(form.discountMinor), discountPercent: undefined } : {}), ...(!id && form.maxRedemptions ? { maxRedemptions: Number(form.maxRedemptions) } : {}), ...(form.validTo ? { validTo: form.validTo } : {}), ...(id ? { isActive: form.isActive } : {}) };
      const result = await apiRequest<{ id?: string }>(`/vouchers${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setDirty(false);
      if (continueEditing) router.push(`/vouchers/${id ?? result.id}/edit`); else router.push(`/vouchers${id ? `/${id}` : ""}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save voucher"); } finally { setSaving(false); }
  }
  function cancel() { if (!dirty || window.confirm("Discard unsaved changes?")) router.back(); }
  if (!loaded) return <div className="panel" role="status">Loading voucher...</div>;
  return <div><div className="page-heading"><div><p className="eyebrow">PRICING / VOUCHERS</p><h2>{id ? "Edit voucher" : "New voucher"}</h2></div></div><form className="panel form-grid" onSubmit={(event) => void submit(event)}><label>Code<input required value={form.code} disabled={Boolean(id)} onChange={(event) => change("code", event.target.value)} /></label><label>Discount percent<input type="number" min="0" max="100" value={form.discountPercent} onChange={(event) => { change("discountPercent", event.target.value); if (event.target.value) change("discountMinor", ""); }} /></label><label>Discount minor units<input type="number" min="0" value={form.discountMinor} onChange={(event) => { change("discountMinor", event.target.value); if (event.target.value) change("discountPercent", ""); }} /></label><label>Max redemptions<input type="number" min="1" value={form.maxRedemptions} disabled={Boolean(id)} onChange={(event) => change("maxRedemptions", event.target.value)} /></label><label>Valid to<input type="date" value={form.validTo} onChange={(event) => change("validTo", event.target.value)} /></label>{id && <label><input type="checkbox" checked={form.isActive} onChange={(event) => change("isActive", event.target.checked)} /> Active</label>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" onClick={cancel}>Cancel</button><button type="button" disabled={saving || !dirty} onClick={(event) => void submit(event as unknown as React.FormEvent, true)}>Save and continue</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button></div></form></div>;
}
