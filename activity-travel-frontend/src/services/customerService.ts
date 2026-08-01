import { apiRequest } from "./apiClient";
import type { PaginatedResponse } from "@/types/api";
export type CustomerRecord = { id: string; name: string; email: string; phone?: string; country?: string | null; notes?: string | null; status?: string; totalSpentMinor?: number; lastBookingAt?: string | null; _count?: { bookings: number }; bookings?: Array<{ id: string; reference: string; status: string; totalMinor: number; currency: string; notes?: string | null; createdAt: string; activity: { name: string }; schedule: { startsAt: string }; passengers: Array<{ id: string; firstName: string; lastName: string; type: string }>; payments: Array<{ id: string; amountMinor: number; currency: string; status: string; refunds: Array<{ id: string; status: string; requestedAmountMinor: number }> }> }> };
export function listCustomers(query = "page=1&pageSize=25") { return apiRequest<PaginatedResponse<CustomerRecord>>(`/customers?${query}`); }
export function getCustomer(id: string) { return apiRequest<CustomerRecord>(`/customers/${id}`); }
export function createCustomer(payload: Record<string, unknown>) { return apiRequest<CustomerRecord>("/customers", { method: "POST", body: JSON.stringify(payload) }); }
export function updateCustomer(id: string, payload: Record<string, unknown>) { return apiRequest<CustomerRecord>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
