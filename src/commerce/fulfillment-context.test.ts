import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

import {
  createFulfillmentExecutionContextV1,
  projectFulfillmentExecutionContextV1,
} from "./fulfillment-context";

const secret = "task6f-fulfillment-secret-at-least-32-characters";
const syntheticBetterAuth = {
  BETTER_AUTH_SECRET:
    "synthetic-better-auth-secret-material-0123456789ABCDEF",
  RESEND_API_KEY: "re_synthetic_auth_test",
  RESEND_FROM: "accounts@example.test",
} as const;

describe("opaque fulfillment execution authority", () => {
  it("defaults closed and rejects every incoherent test/live identity", () => {
    for (const environment of [
      parseServerEnv({}),
      parseServerEnv({
        APP_ENV: "local",
        FULFILLMENT_MODE: "test",
      }),
      parseServerEnv({
        APP_ENV: "production",
        VERCEL_ENV: "production",
        APP_ORIGIN: "https://commerce.example.test",
        FULFILLMENT_MODE: "live",
      }),
    ]) {
      expect(
        projectFulfillmentExecutionContextV1(
          createFulfillmentExecutionContextV1(environment),
        ),
      ).toEqual({ enabled: false });
    }
  });

  it("enables only explicit local-driver or guarded isolated test authority", () => {
    const local = parseServerEnv({
      APP_ENV: "local",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: secret,
      RATE_LIMIT_SECRET: secret,
      FULFILLMENT_MODE: "test",
      PAYMENTS_MODE: "disabled",
      TAX_MODE: "disabled",
      SHIPPING_MODE: "disabled",
    });
    const guarded = parseServerEnv({
      APP_ENV: "preview",
      APP_ORIGIN: "https://preview.example.test",
      AUTH_MODE: "test",
      ...syntheticBetterAuth,
      DATABASE_MODE: "test",
      EMAIL_MODE: "test",
      FULFILLMENT_MODE: "test",
      RATE_LIMIT_SECRET: secret,
      TEST_DATABASE_URL: "postgresql://test_user:test_password@127.0.0.1:5432/propeptiq_slice6f_test",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    });
    expect(
      projectFulfillmentExecutionContextV1(
        createFulfillmentExecutionContextV1(local),
      ),
    ).toEqual({ enabled: true });
    expect(
      projectFulfillmentExecutionContextV1(
        createFulfillmentExecutionContextV1(guarded),
      ),
    ).toEqual({ enabled: true });
  });

  it("enables exact production live authority independently of Checkout and payments", () => {
    const environment = parseServerEnv({
      APP_ENV: "production",
      VERCEL_ENV: "production",
      APP_ORIGIN: "https://commerce.example.test",
      AUTH_MODE: "live",
      AUTH_EMAIL_DELIVERY_VERIFIED: "verified",
      AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified",
      ...syntheticBetterAuth,
      DATABASE_MODE: "live",
      EMAIL_MODE: "live",
      FULFILLMENT_MODE: "live",
      PAYMENTS_MODE: "disabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      RATE_LIMIT_SECRET: secret,
      DATABASE_URL: "postgresql://live_user:password@db.example.test:5432/commerce",
    });
    expect(
      projectFulfillmentExecutionContextV1(
        createFulfillmentExecutionContextV1(environment),
      ),
    ).toEqual({ enabled: true });
  });

  it("cannot be forged or serialized", () => {
    const authority = createFulfillmentExecutionContextV1(
      parseServerEnv({
        APP_ENV: "local",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: secret,
        RATE_LIMIT_SECRET: secret,
        FULFILLMENT_MODE: "test",
      }),
    );
    expect(() => JSON.stringify(authority)).toThrow(/must not be serialized/i);
    expect(projectFulfillmentExecutionContextV1({ enabled: true })).toBeNull();
    expect(
      projectFulfillmentExecutionContextV1(
        Object.freeze({ ...authority }),
      ),
    ).toBeNull();
  });
});
