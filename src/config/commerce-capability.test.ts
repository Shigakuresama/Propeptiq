import { describe, expect, it } from "vitest";

import playwrightConfig from "../../playwright.config";
import { isLiveCheckoutEnvironmentConfigured } from "./commerce-capability";
import { parseServerEnv, type ServerEnv } from "./env-schema";

const origin = "https://research.example.test";
const databaseUrl = "postgresql://synthetic.invalid/database?sslmode=require";

const commerceLive = {
  APP_ENV: "production",
  APP_ORIGIN: origin,
  AUTH_MODE: "live",
  DATABASE_MODE: "live",
  TAX_MODE: "live",
  SHIPPING_MODE: "live",
  FULFILLMENT_MODE: "live",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_synthetic",
  CLERK_SECRET_KEY: "sk_live_synthetic",
  RATE_LIMIT_SECRET: "task6-rate-limit-secret-at-least-32-characters",
  DATABASE_URL: databaseUrl,
} as const;

const paymentsLive = {
  APP_ENV: "production",
  APP_ORIGIN: origin,
  DATABASE_MODE: "live",
  PAYMENTS_MODE: "live",
  DATABASE_URL: databaseUrl,
  STRIPE_ACCOUNT_ID: "acct_synthetic123",
  STRIPE_SECRET_KEY: "sk_live_synthetic",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
} as const;

describe("commerce capability configuration", () => {
  it("defaults every commerce creation capability and mode closed", () => {
    expect(parseServerEnv({})).toMatchObject({
      COMMERCE_LIVE_CAPABILITY: "disabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      TAX_MODE: "disabled",
      SHIPPING_MODE: "disabled",
      FULFILLMENT_MODE: "disabled",
    });
  });

  it.each([
    "COMMERCE_LIVE_CAPABILITY",
    "PAYMENTS_LIVE_CAPABILITY",
    "TAX_MODE",
    "SHIPPING_MODE",
    "FULFILLMENT_MODE",
  ] as const)("rejects an invalid %s value", (name) => {
    expect(() => parseServerEnv({ [name]: "maybe" })).toThrow(new RegExp(name));
  });

  it.each(["TAX_MODE", "SHIPPING_MODE", "FULFILLMENT_MODE"] as const)(
    "rejects %s=test in production and %s=live outside production",
    (name) => {
      expect(() =>
        parseServerEnv({ APP_ENV: "production", APP_ORIGIN: origin, [name]: "test" }),
      ).toThrow(/test mode is not permitted in production/);
      expect(() => parseServerEnv({ [name]: "live" })).toThrow(/requires APP_ENV=production/);
    },
  );

  it("permits independent commerce capability staging without a payment adapter", () => {
    const env = parseServerEnv({
      ...commerceLive,
      COMMERCE_LIVE_CAPABILITY: "enabled",
    });
    expect(env).toMatchObject({
      COMMERCE_LIVE_CAPABILITY: "enabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      PAYMENTS_MODE: "disabled",
    });
  });

  it("permits independent payment staging without auth, storage, email, or commerce", () => {
    const env = parseServerEnv({
      ...paymentsLive,
      PAYMENTS_LIVE_CAPABILITY: "enabled",
    });
    expect(env).toMatchObject({
      PAYMENTS_LIVE_CAPABILITY: "enabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      AUTH_MODE: "disabled",
      STORAGE_MODE: "disabled",
      EMAIL_MODE: "disabled",
    });
  });

  it("requires each exact capability prerequisite matrix", () => {
    for (const dependency of [
      "AUTH_MODE",
      "DATABASE_MODE",
      "TAX_MODE",
      "SHIPPING_MODE",
      "FULFILLMENT_MODE",
    ] as const) {
      expect(() =>
        parseServerEnv({
          ...commerceLive,
          [dependency]: "disabled",
          COMMERCE_LIVE_CAPABILITY: "enabled",
        }),
      ).toThrow(new RegExp(dependency));
    }
    for (const dependency of ["DATABASE_MODE", "PAYMENTS_MODE"] as const) {
      expect(() =>
        parseServerEnv({
          ...paymentsLive,
          [dependency]: "disabled",
          PAYMENTS_LIVE_CAPABILITY: "enabled",
        }),
      ).toThrow(new RegExp(dependency));
    }
  });

  it("returns true only for the exact live-checkout configuration evidence", () => {
    const configured = parseServerEnv({
      ...commerceLive,
      ...paymentsLive,
      COMMERCE_LIVE_CAPABILITY: "enabled",
      PAYMENTS_LIVE_CAPABILITY: "enabled",
    });
    expect(isLiveCheckoutEnvironmentConfigured(configured)).toBe(true);
    expect(configured.STORAGE_MODE).toBe("disabled");
    expect(configured.EMAIL_MODE).toBe("disabled");

    for (const key of [
      "COMMERCE_LIVE_CAPABILITY",
      "PAYMENTS_LIVE_CAPABILITY",
      "AUTH_MODE",
      "DATABASE_MODE",
      "PAYMENTS_MODE",
      "TAX_MODE",
      "SHIPPING_MODE",
      "FULFILLMENT_MODE",
    ] as const) {
      expect(
        isLiveCheckoutEnvironmentConfigured({
          ...configured,
          [key]: "disabled",
        } as ServerEnv),
      ).toBe(false);
    }
    expect(
      isLiveCheckoutEnvironmentConfigured({
        ...configured,
        CATALOG_DEMO_MODE: "enabled",
      }),
    ).toBe(false);
  });

  it("keeps live capabilities closed while Playwright uses synthetic commerce ports", () => {
    const servers = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer
      : [playwrightConfig.webServer];
    expect(servers[0]?.env).toMatchObject({
      COMMERCE_LIVE_CAPABILITY: "disabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      TAX_MODE: "test",
      SHIPPING_MODE: "test",
      FULFILLMENT_MODE: "test",
    });
  });
});
