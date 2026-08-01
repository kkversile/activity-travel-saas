"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/services/apiClient";

type Kind = "suppliers" | "agents";
type Partner = {
  company?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  taxDetails?: string;
  address?: string;
  commissionPercent?: number;
  creditLimitMinor?: number;
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

function editablePartner(value: Partner): Partner {
  return {
    company: value.company,
    contactPerson: value.contactPerson,
    email: value.email,
    phone: value.phone,
    taxDetails: value.taxDetails,
    address: value.address,
    commissionPercent: value.commissionPercent,
    creditLimitMinor: value.creditLimitMinor,
    status: value.status,
  };
}

export function PartnerForm({ kind, id, initial }: { kind: Kind; id?: string; initial?: Partner }) {
  const router = useRouter();
  const [form, setForm] = useState<Partner>(() => editablePartner(initial ?? {}));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id || Boolean(initial));

  useEffect(() => {
    let active = true;
    if (id && !initial) {
      setLoaded(false);
      void apiRequest<Partner>(`/${kind}/${id}`)
        .then((value) => {
          if (active) setForm(editablePartner(value));
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : "Unable to load record");
        })
        .finally(() => {
          if (active) setLoaded(true);
        });
    }
    return () => {
      active = false;
    };
  }, [id, initial, kind]);

  const set = (key: keyof Partner, value: string) =>
    setForm((current) => ({
      ...current,
      [key]: key === "commissionPercent" || key === "creditLimitMinor" ? Number(value) : value,
    }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload =
      kind === "suppliers"
        ? {
            company: form.company,
            contactPerson: form.contactPerson,
            email: form.email,
            phone: form.phone || undefined,
            taxDetails: form.taxDetails || undefined,
            address: form.address || undefined,
            status: form.status || undefined,
          }
        : {
            company: form.company,
            contactPerson: form.contactPerson,
            email: form.email,
            phone: form.phone || undefined,
            commissionPercent: form.commissionPercent ?? 0,
            creditLimitMinor: form.creditLimitMinor ?? 0,
            status: form.status || undefined,
          };
    try {
      if (id) await apiRequest(`/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await apiRequest(`/${kind}`, { method: "POST", body: JSON.stringify(payload) });
      router.push(`/${kind}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save record");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="panel" role="status">Loading record...</div>;

  return (
    <form className="panel form-stack" onSubmit={save}>
      <label>Company<input required value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} /></label>
      <label>Contact person<input required value={form.contactPerson ?? ""} onChange={(e) => set("contactPerson", e.target.value)} /></label>
      <label>Email<input required type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></label>
      <label>Phone<input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></label>
      {kind === "suppliers" ? (
        <>
          <label>Tax details<input value={form.taxDetails ?? ""} onChange={(e) => set("taxDetails", e.target.value)} /></label>
          <label>Address<textarea value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></label>
        </>
      ) : (
        <>
          <label>Commission percent<input type="number" min="0" max="100" value={form.commissionPercent ?? 0} onChange={(e) => set("commissionPercent", e.target.value)} /></label>
          <label>Credit limit (minor units)<input type="number" min="0" value={form.creditLimitMinor ?? 0} onChange={(e) => set("creditLimitMinor", e.target.value)} /></label>
        </>
      )}
      <label>Status<select value={form.status ?? "ACTIVE"} onChange={(e) => set("status", e.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" onClick={() => router.push(`/${kind}`)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
    </form>
  );
}
