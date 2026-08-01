import type { Activity } from "@/types/activity";
import type { PaginatedResponse } from "@/types/api";
import { apiRequest } from "./apiClient";

export type ActivityQuery = { page?: number; pageSize?: number; search?: string; status?: string; categoryId?: string; destinationId?: string; minDuration?: number | string; maxDuration?: number | string; hasActiveSchedule?: boolean | string; createdFrom?: string; createdTo?: string; publishedFrom?: string; publishedTo?: string; sortBy?: string; sortOrder?: "asc" | "desc" };
export function listActivities(query: ActivityQuery) { const params = new URLSearchParams(); Object.entries(query).forEach(([key, value]) => value !== undefined && value !== "" && params.set(key, String(value))); return apiRequest<PaginatedResponse<Activity>>(`/activities?${params}`); }
export function createActivity(payload: Record<string, unknown>) { return apiRequest<Activity>("/activities", { method: "POST", body: JSON.stringify(payload) }); }
export function getActivity(id: string) { return apiRequest<Activity>(`/activities/${id}`); }
export function updateActivity(id: string, payload: Record<string, unknown>) { return apiRequest<Activity>(`/activities/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function createRecurringSchedule(activityId: string, payload: Record<string, unknown>) { return apiRequest<{ id: string }>(`/activities/${activityId}/recurrences`, { method: "POST", body: JSON.stringify(payload) }); }
export function generateRecurringSchedules(activityId: string, recurringId: string) { return apiRequest(`/activities/${activityId}/recurrences/${recurringId}/generate`, { method: "POST", body: "{}" }); }
