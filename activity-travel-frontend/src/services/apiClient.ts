import type { ApiError } from "@/types/api";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4006/api/v1";
const accessTokenKey = "activity_access_token";
const tenantKey = "activity_tenant_id";

export function getAccessToken() { return typeof window === "undefined" ? "" : window.localStorage.getItem(accessTokenKey) ?? ""; }
export function getTenantId() { return typeof window === "undefined" ? "" : window.localStorage.getItem(tenantKey) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? ""; }
export function setSession(accessToken: string, tenantId: string) { window.localStorage.setItem(accessTokenKey, accessToken); window.localStorage.setItem(tenantKey, tenantId); }
export function clearSession() { window.localStorage.removeItem(accessTokenKey); window.localStorage.removeItem(tenantKey); window.localStorage.removeItem("activity_user"); }

export async function downloadApiFile(path: string): Promise<Blob> {
  const headers = new Headers({ "x-request-id": typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}` });
  const token = getAccessToken(); const tenantId = getTenantId();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (tenantId) headers.set("x-tenant-id", tenantId);
  const response = await fetch(`${baseUrl}${path}`, { headers, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  return response.blob();
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const execute = async () => {
    const headers = new Headers(options.headers);
    headers.set("content-type", "application/json");
    headers.set("x-request-id", typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    const token = getAccessToken();
    const tenantId = getTenantId();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (tenantId) headers.set("x-tenant-id", tenantId);
    const timeout = AbortSignal.timeout(30_000);
    return fetch(`${baseUrl}${path}`, { ...options, headers, credentials: "include", cache: "no-store", signal: options.signal ?? timeout });
  };
  let response = await execute();
  if (response.status === 401 && path !== "/auth/refresh" && typeof window !== "undefined") {
    const refreshed = await fetch(`${baseUrl}/auth/refresh`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-request-id": `${Date.now()}-${Math.random()}` }, body: "{}" }).then(async (refreshResponse) => refreshResponse.ok ? refreshResponse.json() as Promise<{ accessToken: string; user: { tenantId?: string; memberships?: Array<{ tenantId: string }> } }> : null).catch(() => null);
    if (refreshed?.accessToken) { setSession(refreshed.accessToken, refreshed.user.tenantId ?? refreshed.user.memberships?.[0]?.tenantId ?? getTenantId()); response = await execute(); }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiError;
    const error = new Error(body.message ? String(body.message) : `Request failed (${response.status})`) as Error & { requestId?: string };
    error.requestId = body.requestId;
    if (response.status === 401 && typeof window !== "undefined") clearSession();
    throw error;
  }
  return response.json() as Promise<T>;
}
