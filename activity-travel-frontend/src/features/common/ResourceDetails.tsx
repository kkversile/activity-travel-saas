"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/services/apiClient";
import { ErrorPanel, LoadingTable } from "@/components/feedback/Feedback";

type ScalarRecord = Record<string, unknown>;
type FieldType = "text" | "number" | "date" | "datetime-local" | "checkbox" | "status";
type Field = { key: string; label: string; type: FieldType };

function routePath(endpoint: string) {
  return endpoint === "variants" ? "activity-variants" : endpoint;
}

function auditEntityType(endpoint: string) {
  const names: Record<string, string> = {
    variants: "ActivityVariant",
    schedules: "ActivitySchedule",
    "price-plans": "PricePlan",
    "cancellation-policies": "CancellationPolicy",
    "pickup-points": "PickupPoint",
    vouchers: "Voucher",
    taxes: "Tax",
    discounts: "Discount",
    "agent-commissions": "AgentCommission",
    "blackout-dates": "BlackoutDate",
  };
  return names[endpoint] ?? endpoint;
}

function fieldsFor(endpoint: string): Field[] {
  if (endpoint === "variants") return [{ key: "name", label: "Name", type: "text" }, { key: "description", label: "Description", type: "text" }, { key: "durationMinutes", label: "Duration minutes", type: "number" }, { key: "capacityMode", label: "Capacity mode", type: "text" }, { key: "meetingPoint", label: "Meeting point", type: "text" }, { key: "isActive", label: "Active", type: "checkbox" }];
  if (endpoint === "schedules") return [{ key: "startsAt", label: "Starts at", type: "datetime-local" }, { key: "endsAt", label: "Ends at", type: "datetime-local" }, { key: "timezone", label: "Timezone", type: "text" }, { key: "capacity", label: "Capacity", type: "number" }, { key: "isBookable", label: "Bookable", type: "checkbox" }, { key: "cutoffMinutes", label: "Cut-off minutes", type: "number" }];
  if (endpoint === "price-plans") return [{ key: "name", label: "Name", type: "text" }, { key: "currency", label: "Currency", type: "text" }, { key: "adultMinor", label: "Adult minor units", type: "number" }, { key: "childMinor", label: "Child minor units", type: "number" }, { key: "infantMinor", label: "Infant minor units", type: "number" }, { key: "taxPercent", label: "Tax percent", type: "number" }, { key: "commissionPercent", label: "Commission percent", type: "number" }, { key: "validFrom", label: "Valid from", type: "date" }, { key: "validTo", label: "Valid to", type: "date" }, { key: "isActive", label: "Active", type: "checkbox" }];
  if (endpoint === "vouchers") return [{ key: "discountMinor", label: "Discount minor units", type: "number" }, { key: "discountPercent", label: "Discount percent", type: "number" }, { key: "validTo", label: "Valid to", type: "date" }, { key: "isActive", label: "Active", type: "checkbox" }];
  if (["cancellation-policies", "pickup-points"].includes(endpoint)) return [{ key: "name", label: "Name", type: "text" }, { key: "description", label: "Description", type: "text" }, { key: "address", label: "Address", type: "text" }, { key: "status", label: "Status", type: "status" }, { key: "isActive", label: "Active", type: "checkbox" }];
  return [];
}

function inputValue(value: unknown, type: FieldType): string | boolean {
  if (type === "checkbox") return Boolean(value);
  if (value === null || value === undefined) return "";
  if ((type === "date" || type === "datetime-local") && typeof value === "string") return type === "date" ? value.slice(0, 10) : value.slice(0, 16);
  return String(value);
}

export function ResourceDetails({ endpoint, title, id }: { endpoint: string; title: string; id: string }) {
  const [data, setData] = useState<ScalarRecord | null>(null);
  const [audit, setAudit] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  const [error, setError] = useState("");
  const route = routePath(endpoint);

  useEffect(() => {
    void apiRequest<ScalarRecord>(`/${endpoint}/${id}`).then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : `Unable to load ${title.toLowerCase()}`));
    void apiRequest<{ data: Array<{ id: string; action: string; createdAt: string }> }>(`/audit-logs?page=1&pageSize=25&entityType=${encodeURIComponent(auditEntityType(endpoint))}&entityId=${encodeURIComponent(id)}&sortBy=createdAt&sortOrder=asc`).then((result) => setAudit(result.data)).catch(() => undefined);
  }, [endpoint, id, title]);

  if (error) return <ErrorPanel message={error} onRetry={() => window.location.reload()} />;
  if (!data) return <LoadingTable />;
  return <div><div className="page-heading"><div><p className="eyebrow">OPERATIONS</p><h2>{String(data.name ?? data.code ?? data.id ?? title)}</h2><p className="subtext">{title} detail</p></div>{endpoint !== "blackout-dates" && <Link className="primary button-link" href={`/${route}/${id}/edit`}>Edit</Link>}</div><section className="panel detail-grid">{Object.entries(data).filter(([, value]) => typeof value !== "object").map(([key, value]) => <div key={key}><span>{key}</span><strong>{String(value ?? "—")}</strong></div>)}</section><section className="panel"><h3>Audit history</h3>{audit.length ? audit.map((entry) => <div className="activity-row" key={entry.id}><strong>{entry.action}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span></div>) : <p>No audit events recorded.</p>}</section></div>;
}

export function ResourceEdit({ endpoint, title, id }: { endpoint: string; title: string; id: string }) {
  const [data, setData] = useState<ScalarRecord>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fields = useMemo(() => fieldsFor(endpoint), [endpoint]);
  const route = routePath(endpoint);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void apiRequest<ScalarRecord>(`/${endpoint}/${id}`)
      .then((value) => {
        if (!active) return;
        const editable = Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(value, field.key)).map((field) => [field.key, inputValue(value[field.key], field.type)]));
        setData(editable);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : `Unable to load ${title.toLowerCase()}`);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [endpoint, fields, id, title]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(fields.map((field) => {
        const value = data[field.key];
        if (field.type === "number") return [field.key, value === "" ? undefined : Number(value)];
        if (field.type === "checkbox") return [field.key, Boolean(value)];
        if (field.type === "date" || field.type === "datetime-local") return [field.key, value ? new Date(String(value)).toISOString() : undefined];
        return [field.key, value || undefined];
      }));
      await apiRequest(`/${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      window.location.href = `/${route}/${id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to save ${title.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="panel" role="status">Loading {title.toLowerCase()}...</div>;
  return <div><div className="page-heading"><div><p className="eyebrow">OPERATIONS</p><h2>Edit {title}</h2></div></div><form className="panel form-grid" onSubmit={save}>{fields.map((field) => field.type === "checkbox" ? <label key={field.key}><input type="checkbox" checked={Boolean(data[field.key])} onChange={(event) => setData({ ...data, [field.key]: event.target.checked })} />{field.label}</label> : field.type === "status" ? <label key={field.key}>{field.label}<select value={String(data[field.key] ?? "")} onChange={(event) => setData({ ...data, [field.key]: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select></label> : <label key={field.key}>{field.label}<input type={field.type} value={String(data[field.key] ?? "")} onChange={(event) => setData({ ...data, [field.key]: event.target.value })} /></label>)}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" onClick={() => window.history.back()}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button></div></form></div>;
}
