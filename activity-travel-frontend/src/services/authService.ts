import { apiRequest, clearSession, setSession } from "./apiClient";

export type SessionUser = { id: string; email: string; displayName: string; role: string; tenantId?: string; memberships: Array<{ tenantId: string; role: string; tenant?: { name: string }; customRole?: { id: string; name: string; permissions: Record<string, unknown>; isActive: boolean } | null }> };
export async function login(email: string, password: string) {
  const result = await apiRequest<{ accessToken: string; user: SessionUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const tenantId = result.user.tenantId ?? result.user.memberships[0]?.tenantId ?? "";
  setSession(result.accessToken, tenantId); window.localStorage.setItem("activity_user", JSON.stringify(result.user));
  return result.user;
}
export async function logout() {
  try {
    await apiRequest("/auth/logout", { method: "POST", body: "{}" });
  } finally {
    clearSession();
  }
}
