"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/services/apiClient";

type Kind = "taxes" | "discounts" | "agent-commissions" | "blackout-dates";
type Field = { key: string; label: string; required?: boolean; type?: "text" | "number" | "date" | "status" };
const numericKeys = new Set(["ratePercent", "discountPercent", "discountMinor", "commissionPercent", "fixedMinor"]);

export function SimpleResourceForm({ kind, id }: { kind: Kind; id?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [agents, setAgents] = useState<Array<{ id: string; company: string }>>([]);
  const [activities, setActivities] = useState<Array<{ id: string; name: string }>>([]);
  const fields = useMemo<Field[]>(() => {
    if (kind === "taxes") return id ? [{ key: "name", label: "Name", required: true }, { key: "ratePercent", label: "Rate percent", required: true, type: "number" }, { key: "status", label: "Status", type: "status" }] : [{ key: "name", label: "Name", required: true }, { key: "ratePercent", label: "Rate percent", required: true, type: "number" }];
    if (kind === "discounts") return id ? [{ key: "name", label: "Name", required: true }, { key: "code", label: "Code" }, { key: "discountPercent", label: "Discount percent", type: "number" }, { key: "discountMinor", label: "Discount minor units", type: "number" }, { key: "validTo", label: "Valid to", type: "date" }, { key: "status", label: "Status", type: "status" }] : [{ key: "name", label: "Name", required: true }, { key: "code", label: "Code" }, { key: "discountPercent", label: "Discount percent", type: "number" }, { key: "discountMinor", label: "Discount minor units", type: "number" }, { key: "validFrom", label: "Valid from", type: "date" }, { key: "validTo", label: "Valid to", type: "date" }];
    if (kind === "agent-commissions") return id ? [{ key: "commissionPercent", label: "Commission percent", type: "number" }, { key: "fixedMinor", label: "Fixed minor units", type: "number" }, { key: "status", label: "Status", type: "status" }] : [{ key: "agentId", label: "Agent ID", required: true }, { key: "activityId", label: "Activity ID" }, { key: "commissionPercent", label: "Commission percent", type: "number" }, { key: "fixedMinor", label: "Fixed minor units", type: "number" }];
    return [{ key: "activityId", label: "Activity ID", required: true }, { key: "date", label: "Date", required: true, type: "date" }, { key: "reason", label: "Reason" }];
  }, [id, kind]);

  useEffect(() => {
    if (kind !== "agent-commissions" && kind !== "blackout-dates") return;
    const requests: Array<Promise<unknown>> = [apiRequest<{ data: Array<{ id: string; name: string }> }>("/activities?page=1&pageSize=100&sortBy=name&sortOrder=asc").then((result) => setActivities(result.data))];
    if (kind === "agent-commissions") requests.push(apiRequest<{ data: Array<{ id: string; company: string }> }>("/agents?page=1&pageSize=100&sortBy=company&sortOrder=asc").then((result) => setAgents(result.data)));
    void Promise.all(requests).catch(() => undefined);
  }, [kind]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoaded(false);
    void apiRequest<Record<string, unknown>>(`/${kind}/${id}`)
      .then((data) => {
        if (active) setForm(Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value !== "object").map(([key, value]) => [key, String(value ?? "")])));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load record");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [id, kind]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  async function save(event: React.FormEvent<HTMLFormElement>, continueEditing = false) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "").map(([key, value]) => [key, numericKeys.has(key) ? Number(value) : value]));
      const result = await apiRequest<{ id?: string }>(`/${kind}${id ? `/${id}` : ""}`, { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setDirty(false);
      if (continueEditing) router.push(`/${kind}/${id ?? result.id}/edit`);
      else router.push(`/${kind}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save record");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (!dirty || window.confirm("Discard unsaved changes?")) router.back();
  }

  if (!loaded) return <div className="panel" role="status">Loading {kind.replaceAll("-", " ")}...</div>;
  return <div><div className="page-heading"><div><p className="eyebrow">OPERATIONS</p><p className="subtext"><a href={`/${kind}`}>{kind.replaceAll("-", " ")}</a> / {id ? "Edit" : "New"}</p><h2>{id ? "Edit" : "Create"} {kind.replaceAll("-", " ")}</h2></div></div><form className="panel form-grid" onSubmit={(event) => void save(event)}>{fields.map((field) => { const optionField = field.key === "agentId" || field.key === "activityId"; return <label key={field.key}>{field.label}{field.required && " *"}{optionField ? <select required={field.required} value={form[field.key] ?? ""} onChange={(event) => { setDirty(true); setForm({ ...form, [field.key]: event.target.value }); }}><option value="">Select {field.label.toLowerCase()}</option>{field.key === "agentId" ? agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.company}</option>) : activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select> : field.type === "status" ? <select value={form[field.key] ?? "ACTIVE"} onChange={(event) => { setDirty(true); setForm({ ...form, [field.key]: event.target.value }); }}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select> : <input required={field.required} type={field.type ?? (numericKeys.has(field.key) ? "number" : "text")} value={form[field.key] ?? ""} onChange={(event) => { setDirty(true); setForm({ ...form, [field.key]: event.target.value }); }} />}</label>; })}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" onClick={cancel}>Cancel</button><button type="button" disabled={saving || !dirty} onClick={(event) => void save(event as unknown as React.FormEvent<HTMLFormElement>, true)}>Save and continue</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button></div></form></div>;
}
