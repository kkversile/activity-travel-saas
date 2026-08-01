import { apiRequest } from "./apiClient";
import type { PaginatedResponse } from "@/types/api";
export type CatalogKind = "categories" | "destinations" | "cancellation-policies" | "pickup-points";
export function catalogRoute(kind: CatalogKind) { return kind === "categories" ? "activity-categories" : kind; }
export type CatalogRecord = { id: string; name: string; slug: string; address?: string; description?: string; status?: string; displayOrder?: number; country?: string; state?: string; city?: string; timezone?: string; latitude?: number; longitude?: number; createdAt?: string; updatedAt?: string; _count?: { activities: number } };
export function getCatalog(kind: CatalogKind, id: string) { return apiRequest<CatalogRecord>(`/${kind}/${id}`); }
export function listCatalog(kind: CatalogKind, query = "page=1&pageSize=100") { return apiRequest<PaginatedResponse<CatalogRecord>>(`/${kind}?${query}`); }
export function createCatalog(kind: CatalogKind, payload: Record<string, unknown>) { return apiRequest<CatalogRecord>(`/${kind}`, { method: "POST", body: JSON.stringify(payload) }); }
export function updateCatalog(kind: CatalogKind, id: string, payload: Record<string, unknown>) { return apiRequest<CatalogRecord>(`/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteCatalog(kind: CatalogKind, id: string) { return apiRequest<{ success: true }>(`/${kind}/${id}`, { method: "DELETE" }); }
