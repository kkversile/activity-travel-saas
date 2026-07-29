import type { Activity } from "@/types/activity";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4006/api/v1";

export async function getActivities(): Promise<Activity[]> {
  const tenantId = process.env.NEXT_PUBLIC_DEMO_TENANT_ID;

  if (!tenantId) {
    return [];
  }

  const response = await fetch(`${apiBaseUrl}/activities`, {
    headers: {
      "x-tenant-id": tenantId
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Activity API failed with status ${response.status}`);
  }

  return response.json() as Promise<Activity[]>;
}
