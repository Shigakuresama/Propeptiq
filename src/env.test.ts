import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

describe("parseServerEnv", () => {
  it("defaults every external capability to disabled", () => {
    const env = parseServerEnv({});

    expect(env).toMatchObject({
      APP_ENV: "local",
      AUTH_MODE: "disabled",
      DATABASE_MODE: "disabled",
      PAYMENTS_MODE: "disabled",
      STORAGE_MODE: "disabled",
      EMAIL_MODE: "disabled",
    });
  });

  it("rejects incomplete Stripe test configuration", () => {
    expect(() =>
      parseServerEnv({
        PAYMENTS_MODE: "test",
        STRIPE_SECRET_KEY: "sk_test_synthetic",
      }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("rejects live payments outside the production environment", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "preview",
        PAYMENTS_MODE: "live",
        STRIPE_SECRET_KEY: "sk_live_synthetic",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
      }),
    ).toThrow(/PAYMENTS_MODE=live requires APP_ENV=production/);
  });

  it("rejects insecure production origins", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "http://localhost:3000",
      }),
    ).toThrow(/secure non-local APP_ORIGIN/);
  });

  it("accepts an explicitly complete live capability set", () => {
    const env = parseServerEnv({
      APP_ENV: "production",
      APP_ORIGIN: "https://research.example.test",
      AUTH_MODE: "live",
      DATABASE_MODE: "live",
      PAYMENTS_MODE: "live",
      STORAGE_MODE: "live",
      EMAIL_MODE: "live",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_synthetic",
      CLERK_SECRET_KEY: "sk_live_synthetic",
      DATABASE_URL: "postgresql://synthetic.invalid/database?sslmode=require",
      STRIPE_SECRET_KEY: "sk_live_synthetic",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_synthetic",
      RESEND_API_KEY: "re_synthetic",
      RESEND_FROM: "research@example.test",
    });

    expect(env.PAYMENTS_MODE).toBe("live");
  });

  it("rejects test-mode providers in production", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test",
        EMAIL_MODE: "test",
        RESEND_API_KEY: "re_synthetic",
        RESEND_FROM: "research@example.test",
      }),
    ).toThrow(/test mode is not permitted in production/);
  });
});
