"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listActivities } from "@/services/activityService";
import { createVariant } from "@/services/variantService";
import type { Activity } from "@/types/activity";

export function VariantForm() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [form, setForm] = useState({ activityId: "", name: "", description: "", durationMinutes: "", capacityMode: "SHARED", meetingPoint: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void listActivities({ page: 1, pageSize: 100, sortBy: "createdAt", sortOrder: "desc" }).then((result) => setActivities(result.data)).catch(() => setError("Unable to load activities")); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { const { durationMinutes, ...baseForm } = form; await createVariant({ ...baseForm, ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}), ...(form.meetingPoint ? { meetingPoint: form.meetingPoint } : {}) }); router.push("/activity-variants"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save variant"); } finally { setSaving(false); } }
  return <div><div className="page-heading"><div><p className="eyebrow">CATALOGUE / VARIANTS</p><h2>Create variant</h2></div></div><form className="panel form-grid" onSubmit={submit}><label>Activity<select value={form.activityId} onChange={(event) => setForm({ ...form, activityId: event.target.value })} required><option value="">Select activity</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label><label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label><label>Duration (minutes)<input type="number" min="1" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} /></label><label>Capacity mode<select value={form.capacityMode} onChange={(event) => setForm({ ...form, capacityMode: event.target.value })}><option value="SHARED">Shared</option><option value="PRIVATE">Private</option><option value="PER_PERSON">Per person</option></select></label><label>Meeting point<input value={form.meetingPoint} onChange={(event) => setForm({ ...form, meetingPoint: event.target.value })} /></label><label className="full-span">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>{error && <div className="notice error" role="alert">{error}</div>}<div className="form-actions"><button type="button" onClick={() => router.back()}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : "Save variant"}</button></div></form></div>;
}
