"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/services/apiClient";

type Role = { id: string; name: string; description?: string | null; permissions: string[] | Record<string, unknown> };
const defaultPermissions = ["view", "create", "edit", "delete", "export", "approve", "cancel", "finance", "audit"];

function parseModulePermissions(value: string) {
  return Object.fromEntries(value.split("\n").map((line) => {
    const separator = line.indexOf(":");
    return separator < 0 ? ["", []] : [line.slice(0, separator).trim(), line.slice(separator + 1).split(",").map((item) => item.trim()).filter(Boolean)];
  }).filter(([module, actions]) => module && Array.isArray(actions) && actions.length > 0));
}

export function RoleForm({ id }: { id?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", permissions: defaultPermissions.join(", "), modulePermissions: "", accessRoles: "ACTIVITY_MANAGER" });
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    void apiRequest<{ data: Role[] }>("/roles?page=1&pageSize=100").then((result) => {
      const role = result.data.find((item) => item.id === id);
      if (!role) throw new Error("Custom role not found");
      const permissions = Array.isArray(role.permissions) ? { global: role.permissions } : role.permissions;
      const modulePermissions = Object.entries(permissions).filter(([key, value]) => !["global", "roles"].includes(key) && Array.isArray(value)).map(([key, value]) => `${key}: ${(value as unknown[]).map(String).join(", ")}`).join("\n");
      setForm({ name: role.name, description: role.description ?? "", permissions: Array.isArray(permissions.global) ? permissions.global.map(String).join(", ") : "", modulePermissions, accessRoles: Array.isArray(permissions.roles) ? permissions.roles.map(String).join(", ") : "" });
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load role")).finally(() => setLoading(false));
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined, permissions: { global: form.permissions.split(",").map((item) => item.trim()).filter(Boolean), roles: form.accessRoles.split(",").map((item) => item.trim()).filter(Boolean), ...parseModulePermissions(form.modulePermissions) } };
      if (id) await apiRequest(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); else await apiRequest("/roles", { method: "POST", body: JSON.stringify(payload) });
      router.push("/settings/roles");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save role"); } finally { setSaving(false); }
  }

  if (loading) return <section className="panel">Loading role...</section>;
  return <form className="panel form-grid" onSubmit={submit}>
    <label>Role name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
    <label>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} /></label>
    <label>Permissions<input aria-label="Permissions" value={form.permissions} onChange={(event) => setForm({ ...form, permissions: event.target.value })} /><small>Global actions: view, create, edit, delete, export, approve, cancel, finance, audit.</small></label>
    <label>Module permissions<textarea aria-label="Per-module access" value={form.modulePermissions} onChange={(event) => setForm({ ...form, modulePermissions: event.target.value })} rows={4} placeholder={"bookings: view, create, cancel\nfinance: view, approve"} /><small>One module per line; keys match API paths.</small></label>
    <label>Access role levels<input value={form.accessRoles} onChange={(event) => setForm({ ...form, accessRoles: event.target.value })} /><small>ACTIVITY_MANAGER, BOOKING_AGENT, VIEWER, PARTNER_ADMIN.</small></label>
    {error && <div className="notice error">{error}</div>}
    <div className="form-actions"><button type="button" onClick={() => router.push("/settings/roles")}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save role"}</button></div>
  </form>;
}
