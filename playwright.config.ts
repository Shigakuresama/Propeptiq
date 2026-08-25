import { defineConfig, devices } from "@playwright/test";

const port = 4631;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_ENV: "local",
      CATALOG_DEMO_MODE: "enabled",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
      RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
      VERCEL_ENV: "development",
      VERCEL_TARGET_ENV: "development",
      AUTH_MODE: "disabled",
      DATABASE_MODE: "disabled",
      PAYMENTS_MODE: "disabled",
      STORAGE_MODE: "disabled",
      EMAIL_MODE: "disabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      TAX_MODE: "disabled",
      SHIPPING_MODE: "disabled",
      FULFILLMENT_MODE: "disabled",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
