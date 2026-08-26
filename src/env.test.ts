import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

describe("parseServerEnv", () => {
  it("defaults every external capability to disabled", () => {
    const env = parseServerEnv({});

    expect(env).toMatchObject({
      APP_ENV: "local",
      CATALOG_DEMO_MODE: "disabled",
      LOCAL_TEST_DRIVER: "disabled",
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

  it("requires one valid nonsecret Stripe account namespace whenever payments are enabled", () => {
    const stripeTest = {
      APP_ENV: "preview",
      APP_ORIGIN: "https://preview.synthetic.example",
      PAYMENTS_MODE: "test",
      STRIPE_SECRET_KEY: "sk_test_synthetic",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
    } as const;
    expect(() => parseServerEnv(stripeTest)).toThrow(/STRIPE_ACCOUNT_ID/);
    for (const STRIPE_ACCOUNT_ID of [
      "acct_",
      "acct_has-punctuation",
      "ca_synthetic123",
      " acct_synthetic123",
    ]) {
      expect(() => parseServerEnv({ ...stripeTest, STRIPE_ACCOUNT_ID })).toThrow(
        /STRIPE_ACCOUNT_ID/,
      );
    }
    expect(
      parseServerEnv({
        ...stripeTest,
        STRIPE_ACCOUNT_ID: "acct_synthetic123",
      }).STRIPE_ACCOUNT_ID,
    ).toBe("acct_synthetic123");
  });

  it("requires an explicitly isolated database URL in test mode", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_MODE: "test",
        DATABASE_URL: "postgresql://production.example.invalid/database",
      }),
    ).toThrow(/TEST_DATABASE_URL/);

    expect(() =>
      parseServerEnv({
        DATABASE_MODE: "test",
        TEST_DATABASE_URL:
          "postgresql://test-user@example.invalid/propeptiq_test",
      }),
    ).toThrow(/TEST_DATABASE_CONFIRMATION/);
  });

  it("rejects an apparently production-scoped database in test mode", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_MODE: "test",
        TEST_DATABASE_URL:
          "postgresql://app@production-db.example.invalid/propeptiq_live",
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      }),
    ).toThrow(/appears production-scoped/);
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

  it.each([
    "https://localhost.",
    "https://0.0.0.0",
    "https://127.99.1.1",
    "https://10.0.0.8",
    "https://172.20.1.2",
    "https://192.168.1.2",
    "https://[::1]",
    "https://[::]",
    "https://[fd00::1]",
    "https://[0:0:0:0:0:0:0:1]",
    "https://[::ffff:7f00:1]",
  ])("rejects non-public production origin %s", (origin) => {
    expect(() =>
      parseServerEnv({ APP_ENV: "production", APP_ORIGIN: origin }),
    ).toThrow(/secure non-local APP_ORIGIN/);
  });

  it("rejects malformed provider values", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test",
        DATABASE_MODE: "live",
        DATABASE_URL: "not-a-postgres-url",
      }),
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      parseServerEnv({
        APP_ENV: "preview",
        APP_ORIGIN: "https://preview.example.test",
        STORAGE_MODE: "test",
        BLOB_READ_WRITE_TOKEN: "   ",
      }),
    ).toThrow(/BLOB_READ_WRITE_TOKEN/);

    expect(() =>
      parseServerEnv({
        APP_ENV: "preview",
        APP_ORIGIN: "https://preview.example.test",
        PAYMENTS_MODE: "test",
        STRIPE_SECRET_KEY: "sk_test_synthetic",
        STRIPE_WEBHOOK_SECRET: "not-a-webhook-secret",
      }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it.each([
    ["AUTH_MODE", "live", "CLERK_SECRET_KEY"],
    ["DATABASE_MODE", "live", "DATABASE_URL"],
    ["STORAGE_MODE", "live", "BLOB_READ_WRITE_TOKEN"],
    ["EMAIL_MODE", "live", "RESEND_API_KEY"],
  ] as const)(
    "rejects incomplete live capability %s",
    (modeKey, mode, missingField) => {
      expect(() =>
        parseServerEnv({
          APP_ENV: "production",
          APP_ORIGIN: "https://research.example.test",
          [modeKey]: mode,
        }),
      ).toThrow(new RegExp(missingField));
    },
  );

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
      RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
      DATABASE_URL: "postgresql://synthetic.invalid/database?sslmode=require",
      STRIPE_ACCOUNT_ID: "acct_synthetic123",
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

  it("permits the deterministic auth driver only for an explicit local test secret", () => {
    const env = parseServerEnv({
      APP_ENV: "local",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
      RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
    });
    expect(env.LOCAL_TEST_DRIVER).toBe("enabled");

    expect(() =>
      parseServerEnv({
        APP_ENV: "local",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "short",
        RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
      }),
    ).toThrow(/LOCAL_TEST_SECRET/);
  });

  it.each([
    { APP_ENV: "production" },
    { APP_ENV: "preview" },
    { APP_ENV: "local", VERCEL_ENV: "production" },
    { APP_ENV: "local", VERCEL_ENV: "preview" },
    { APP_ENV: "local", VERCEL_TARGET_ENV: "production" },
    { APP_ENV: "local", VERCEL_TARGET_ENV: "customer-preview" },
  ] as const)("rejects the local test driver for non-local or production identity %#", (identity) => {
    expect(() =>
      parseServerEnv({
        ...identity,
        APP_ORIGIN:
          identity.APP_ENV === "local" ? undefined : "https://research.example.test",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
        RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
      }),
    ).toThrow(/LOCAL_TEST_DRIVER/);
  });

  it("requires a dedicated rate-limit secret for every enabled identity adapter", () => {
    expect(() =>
      parseServerEnv({
        AUTH_MODE: "test",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_synthetic",
        CLERK_SECRET_KEY: "sk_test_synthetic",
      }),
    ).toThrow(/RATE_LIMIT_SECRET/);

    expect(() =>
      parseServerEnv({
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
      }),
    ).toThrow(/RATE_LIMIT_SECRET/);
  });

  it("rejects catalog demo mode for the production application environment", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test",
        CATALOG_DEMO_MODE: "enabled",
      }),
    ).toThrow(/CATALOG_DEMO_MODE.*production/);
  });

  it.each([
    ["VERCEL_ENV", "production"],
    ["VERCEL_TARGET_ENV", "production"],
  ] as const)(
    "rejects catalog demo mode for production deployment identity %s",
    (identityKey, identityValue) => {
      expect(() =>
        parseServerEnv({
          APP_ENV: "preview",
          APP_ORIGIN: "https://preview.example.test",
          CATALOG_DEMO_MODE: "enabled",
          [identityKey]: identityValue,
        }),
      ).toThrow(/CATALOG_DEMO_MODE.*production/);
    },
  );
});
