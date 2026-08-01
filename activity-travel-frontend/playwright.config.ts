import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./tests", timeout: 30_000, expect: { timeout: 15_000 }, fullyParallel: false, workers: 1, use: { baseURL: "http://localhost:3001", headless: true, navigationTimeout: 45_000, actionTimeout: 30_000, trace: "retain-on-failure", ...devices["Desktop Chrome"] } });
