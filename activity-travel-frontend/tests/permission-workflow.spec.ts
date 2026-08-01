import { test, expect } from "@playwright/test";

const api = "http://localhost:4006/api/v1";

test("custom role restrictions apply to navigation and direct routes", async ({ page, request }) => {
  test.setTimeout(120_000);
  const password = process.env.E2E_PASSWORD;
  test.skip(!password, "E2E_PASSWORD is required for permission testing");

  const adminLogin = await request.post(`${api}/auth/login`, { data: { email: "admin@demo.travel", password } });
  expect(adminLogin.ok()).toBeTruthy();
  const admin = await adminLogin.json() as { accessToken: string; user: { tenantId: string } };
  const headers = { authorization: `Bearer ${admin.accessToken}`, "x-tenant-id": admin.user.tenantId };
  const roleName = `Browser Reviewer ${Date.now()}`;
  const roleResponse = await request.post(`${api}/roles`, { headers, data: { name: roleName, description: "Browser permission verification", permissions: { bookings: ["view"] } } });
  expect(roleResponse.ok()).toBeTruthy();
  const role = await roleResponse.json() as { id: string };
  const email = `browser-reviewer-${Date.now()}@example.test`;
  const userResponse = await request.post(`${api}/users`, { headers, data: { email, displayName: "Browser Reviewer", password: "RoleReviewer123!", role: "VIEWER", customRoleId: role.id } });
  expect(userResponse.ok()).toBeTruthy();
  const user = await userResponse.json() as { id: string };

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("RoleReviewer123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "All Bookings" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Payments" })).toHaveCount(0);
    await page.goto("/payments");
    await expect(page.getByText(/Insufficient custom-role permissions/i)).toBeVisible();
  } finally {
    await request.put(`${api}/users/${user.id}`, { headers, data: { isActive: false } });
    await request.delete(`${api}/roles/${role.id}`, { headers });
  }
});
