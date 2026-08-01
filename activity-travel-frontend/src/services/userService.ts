import { apiRequest } from "./apiClient";
import type { PaginatedResponse } from "@/types/api";
export type UserMembership = { user: { id: string; email: string; displayName: string; role: string; isActive: boolean; lastLoginAt?: string | null; createdAt: string; _count?: { memberships: number } }; role: string; tenantId: string; customRoleId?: string | null; customRole?: { id: string; name: string; isActive: boolean } | null };
export function listUsers(query = "page=1&pageSize=25") { return apiRequest<PaginatedResponse<UserMembership>>(`/users?${query}`); }
export function createUser(payload: Record<string, unknown>) { return apiRequest("/users", { method: "POST", body: JSON.stringify(payload) }); }
export function updateUser(id: string, payload: Record<string, unknown>) { return apiRequest(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
