import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/config/env-schema";
import {
  createProviderEventAuthorityV1,
  projectProviderEventAuthorityV1,
  verifyStripeEventDeliveryV1,
} from "@/commerce/stripe-webhook-verifier";

const secret = "whsec_synthetic_6e_offline_only";
const timestamp = 1_787_659_200;

function testAuthority() {
  const authority = createProviderEventAuthorityV1(
    parseServerEnv({
      APP_ENV: "local",
      PAYMENTS_MODE: "test",
      STRIPE_ACCOUNT_ID: "acct_synthetic123",
      STRIPE_SECRET_KEY: "sk_test_synthetic_6e",
      STRIPE_WEBHOOK_SECRET: secret,
    }),
  );
  expect(authority).not.toBeNull();
  if (authority === null) throw new Error("expected synthetic authority");
  return authority;
}

function signedPayload(payload: string, signedAt = timestamp) {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: signedAt,
  });
}

function exactBytes(payload: string): Uint8Array {
  return Uint8Array.from(new TextEncoder().encode(payload));
}

describe("offline Stripe event verification", () => {
  it("verifies the exact Uint8Array with the static Stripe helper", () => {
    const text = JSON.stringify({
      id: "evt_synthetic_6e_verified",
      type: "customer.created",
      created: timestamp,
      livemode: false,
      data: { object: { id: "cus_synthetic_6e" } },
    });
    const exactPayload = exactBytes(text);

    expect(
      verifyStripeEventDeliveryV1(testAuthority(), {
        exactPayload,
        signature: signedPayload(text),
        receivedAtSeconds: timestamp,
      }),
    ).toMatchObject({
      ok: true,
      rawEvent: { id: "evt_synthetic_6e_verified", type: "customer.created" },
    });
  });

  it("returns one generic failure for missing, stale, or altered signatures", () => {
    const original = '{"id":"evt_synthetic_6e_exact","livemode":false}';
    const signature = signedPayload(original);
    const authority = testAuthority();

    for (const input of [
      {
        exactPayload: exactBytes(original),
        signature: null,
        receivedAtSeconds: timestamp,
      },
      {
        exactPayload: exactBytes(original),
        signature,
        receivedAtSeconds: timestamp + 301,
      },
      {
        exactPayload: exactBytes(`${original}\n`),
        signature,
        receivedAtSeconds: timestamp,
      },
    ]) {
      expect(verifyStripeEventDeliveryV1(authority, input)).toEqual({ ok: false });
    }
  });

  it("mints an opaque environment-only authority without origin or creation flags", () => {
    const authority = testAuthority();
    expect(projectProviderEventAuthorityV1(authority)).toEqual({
      provider: "stripe",
      expectedLivemode: false,
      providerScope: "stripe:acct_synthetic123",
    });
    expect(projectProviderEventAuthorityV1({ ...authority })).toBeNull();
    expect(JSON.stringify(projectProviderEventAuthorityV1(authority))).not.toContain(
      secret,
    );
    expect(() => JSON.stringify(authority)).toThrow(/must never be serialized/i);
  });

  it("does not mint authority for disabled payments and ignores live creation flags", () => {
    expect(createProviderEventAuthorityV1(parseServerEnv({}))).toBeNull();

    const live = createProviderEventAuthorityV1(
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "https://commerce.synthetic.example",
        DATABASE_MODE: "live",
        DATABASE_URL: "postgresql://synthetic.invalid/database?sslmode=require",
        PAYMENTS_MODE: "live",
        STRIPE_ACCOUNT_ID: "acct_synthetic123",
        STRIPE_SECRET_KEY: "sk_live_synthetic_6e",
        STRIPE_WEBHOOK_SECRET: secret,
        COMMERCE_LIVE_CAPABILITY: "disabled",
        PAYMENTS_LIVE_CAPABILITY: "disabled",
      }),
    );
    expect(live).not.toBeNull();
    if (live === null) return;
    expect(projectProviderEventAuthorityV1(live)).toEqual({
      provider: "stripe",
      expectedLivemode: true,
      providerScope: "stripe:acct_synthetic123",
    });
  });
});
