import { apiRequest } from "./apiClient";
import type { PaginatedResponse } from "@/types/api";
export type ScheduleRecord = { id: string; startsAt: string; endsAt: string; timezone?: string; capacity: number; bookedSeats: number; heldSeats?: number; confirmedSeats?: number; availableSeats?: number; isBookable: boolean; cutoffMinutes: number; scheduleType?: "ONE_TIME" | "RECURRING"; recurrenceGroupId?: string | null; variantId?: string | null; variant?: { id: string; name: string } | null; activity: { id: string; name: string; destination?: string } };
export type PricePlanRecord = { id: string; name: string; currency: string; adultMinor: number; childMinor: number; infantMinor: number; basis?: string; taxPercent?: number; commissionPercent?: number; validFrom?: string | null; validTo?: string | null; isActive: boolean; variantId?: string | null; variant?: { id: string; name: string } | null; activity: { id: string; name: string } };
export function listSchedules(query = "page=1&pageSize=25") { return apiRequest<PaginatedResponse<ScheduleRecord>>(`/schedules?${query}`); }
export function createSchedule(payload: Record<string, unknown>) { return apiRequest<ScheduleRecord>("/schedules", { method: "POST", body: JSON.stringify(payload) }); }
export function bulkGenerateSchedules(payload: Record<string, unknown>) { return apiRequest<{ preview: boolean; recurrenceGroupId: string; candidates?: Array<{ startsAt: string; endsAt: string }>; created?: ScheduleRecord[]; conflicts: Array<{ startsAt: string; reason: string }> }>("/schedules/bulk-generate", { method: "POST", body: JSON.stringify(payload) }); }
export function bulkUpdateScheduleStatus(ids: string[], isBookable: boolean) { return apiRequest<{ updated: number; requested: number; isBookable: boolean }>("/schedules/bulk-status", { method: "PATCH", body: JSON.stringify({ ids, isBookable }) }); }
export function duplicateSchedule(id: string, payload: { startsAt: string; endsAt: string }) { return apiRequest<ScheduleRecord>(`/schedules/${id}/duplicate`, { method: "POST", body: JSON.stringify(payload) }); }
export function getSchedule(id: string) { return apiRequest<ScheduleRecord>(`/schedules/${id}`); }
export function updateSchedule(id: string, payload: Record<string, unknown>) { return apiRequest<ScheduleRecord>(`/schedules/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function adjustScheduleCapacity(id: string, payload: { capacity: number; reason: string }) { return apiRequest<ScheduleRecord>(`/schedules/${id}/capacity`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function listPricePlans(query = "page=1&pageSize=25") { return apiRequest<PaginatedResponse<PricePlanRecord>>(`/price-plans?${query}`); }
export function createPricePlan(payload: Record<string, unknown>) { return apiRequest<PricePlanRecord>("/price-plans", { method: "POST", body: JSON.stringify(payload) }); }
export function getPricePlan(id: string) { return apiRequest<PricePlanRecord>(`/price-plans/${id}`); }
export function updatePricePlan(id: string, payload: Record<string, unknown>) { return apiRequest<PricePlanRecord>(`/price-plans/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function listAvailability(query = "page=1&pageSize=25") { return listSchedules(query); }
