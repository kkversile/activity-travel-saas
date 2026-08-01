import { apiRequest } from "./apiClient"; import type { PaginatedResponse } from "@/types/api";
export type VariantRecord = { id: string; name: string; description?: string; durationMinutes?: number | null; capacityMode?: string; meetingPoint?: string | null; isActive: boolean; activity: { id: string; name: string }; _count?: { schedules: number; pricePlans: number } };
export function listVariants(query = "page=1&pageSize=25") { return apiRequest<PaginatedResponse<VariantRecord>>(`/variants?${query}`); }
export function createVariant(payload: Record<string, unknown>) { return apiRequest<VariantRecord>("/variants", { method: "POST", body: JSON.stringify(payload) }); }
