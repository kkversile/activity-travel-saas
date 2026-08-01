import { test, expect } from "@playwright/test";

const routes = [
  "/login", "/dashboard", "/activities", "/activities/new", "/activities/test-id", "/activities/test-id/edit", "/activity-categories", "/activity-categories/new", "/activity-categories/test-id", "/activity-categories/test-id/edit", "/destinations", "/destinations/new", "/destinations/test-id", "/destinations/test-id/edit", "/activity-variants", "/activity-variants/new", "/activity-variants/test-id", "/activity-variants/test-id/edit", "/schedules", "/schedules/new", "/schedules/test-id", "/schedules/test-id/edit", "/availability", "/blackout-dates", "/blackout-dates/new", "/blackout-dates/test-id", "/price-plans", "/price-plans/new", "/price-plans/test-id", "/price-plans/test-id/edit", "/taxes", "/taxes/new", "/taxes/test-id", "/taxes/test-id/edit", "/discounts", "/discounts/new", "/discounts/test-id", "/discounts/test-id/edit", "/agent-commissions", "/agent-commissions/new", "/agent-commissions/test-id", "/agent-commissions/test-id/edit", "/bookings", "/bookings/new", "/bookings/test-id", "/bookings/test-id/edit", "/customers", "/customers/new", "/customers/test-id", "/customers/test-id/edit", "/passengers", "/passengers/new", "/passengers/test-id", "/passengers/test-id/edit", "/vouchers", "/vouchers/new", "/vouchers/test-id", "/vouchers/test-id/edit", "/cancellation-policies", "/cancellation-policies/new", "/cancellation-policies/test-id", "/cancellation-policies/test-id/edit", "/cancellations", "/pickup-points", "/pickup-points/new", "/pickup-points/test-id", "/pickup-points/test-id/edit", "/suppliers", "/suppliers/new", "/suppliers/test-id", "/suppliers/test-id/edit", "/agents", "/agents/new", "/agents/test-id", "/agents/test-id/edit", "/payments", "/payments/test-id", "/refunds", "/refunds/test-id", "/invoices", "/invoices/test-id", "/reports/bookings", "/reports/revenue", "/reports/capacity", "/reports/activities", "/reports/cancellations", "/reports/payments", "/reports/refunds", "/reports/agents", "/reports/suppliers", "/audit-logs", "/settings/users", "/settings/users/new", "/settings/roles", "/settings/roles/new", "/settings/general", "/settings/taxes", "/settings/currencies", "/settings/notifications"
];

test("login route renders", async ({ page }) => { await page.goto("/login"); await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible(); });
test("every protected route redirects unauthenticated users", async ({ page }) => { test.setTimeout(180_000); for (const route of routes.filter((item) => item !== "/login")) { await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined); await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 }); } });
test("every declared admin route renders after authentication", async ({ page }) => { test.setTimeout(240_000); const password = process.env.E2E_PASSWORD; test.skip(!password, "E2E_PASSWORD is required for authenticated route smoke testing"); const pageErrors: string[] = []; const apiErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message)); page.on("response", (response) => { const url = response.url(); if (url.includes("/api/v1/") && response.status() >= 400 && !url.includes("test-id")) apiErrors.push(`${response.status()} ${url}`); }); await page.goto("/login"); await page.getByLabel("Password").fill(password!); await page.getByRole("button", { name: "Sign in" }).click(); await expect(page).toHaveURL(/\/dashboard$/); for (const route of routes.filter((item) => item !== "/login")) { await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 }); await expect(page).not.toHaveURL(/\/login$/, { timeout: 10_000 }); await expect(page.locator("main")).toBeVisible({ timeout: 10_000 }); } expect(pageErrors).toEqual([]); expect(apiErrors).toEqual([]); });

test("logout revokes the refresh session", async ({ page, context, request }) => {
  const password = process.env.E2E_PASSWORD;
  test.skip(!password, "E2E_PASSWORD is required for authenticated logout testing");
  await page.goto("/login");
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const refreshCookie = (await context.cookies("http://localhost:4006/api/v1/auth/refresh")).find((cookie) => cookie.name === "activity_refresh");
  expect(refreshCookie?.value).toBeTruthy();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  const response = await request.post("http://localhost:4006/api/v1/auth/refresh", { data: {}, headers: { Cookie: `activity_refresh=${refreshCookie?.value ?? ""}` } });
  expect(response.status()).toBe(401);
});
