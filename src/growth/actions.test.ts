import { describe, expect, it, vi } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";

import { createCustomerReferralEnrollmentAction } from "./actions";

const now = new Date("2026-08-28T18:30:00.000Z");
const buyerUserId = "53000000-0000-4000-8000-000000000001";
const termsVersionId = "53000000-0000-4000-8000-000000000002";
const termsContentHash = "a".repeat(64);
const identity: VerifiedIdentity = Object.freeze({
  clerkUserId: "clerk_task_5b_action",
  primaryEmail: "buyer@example.test",
  emailVerifiedAt: "2026-08-28T18:00:00.000Z",
  mfaConfigured: false,
  secondFactorCompleted: false,
});

function request(origin = "https://propeptiq.example") {
  return new Request("https://propeptiq.example/account/referrals", {
    method: "POST",
    headers: { origin },
  });
}

function form() {
  const value = new FormData();
  value.set("acceptCurrentTerms", "yes");
  value.set("termsVersionId", termsVersionId);
  value.set("termsContentHash", termsContentHash);
  return value;
}

function setup(limit = 3) {
  let count = 0;
  const enrollCustomerReferral = vi.fn(async () => Object.freeze({
    status: "enrolled" as const,
    code: "ref_5BActionOpaqueCode",
    createdAt: now.toISOString(),
  }));
  const action = createCustomerReferralEnrollmentAction({
    environment: Object.freeze({
      APP_ENV: "production" as const,
      APP_ORIGIN: "https://propeptiq.example",
      RATE_LIMIT_SECRET: "task-5b-action-rate-limit-secret-32-characters",
    }),
    clock: () => new Date(now),
    limit,
    rateLimitStore: {
      increment: async () => {
        count += 1;
        return count;
      },
    },
    loadActor: async () => Object.freeze({
      buyerUserId,
      buyerStatus: "active" as const,
      identity,
    }),
    enrollCustomerReferral,
  });
  return { action, enrollCustomerReferral };
}

describe("customer referral enrollment action boundary", () => {
  it("accepts only explicit current terms fields and returns a frozen privacy-minimal result", async () => {
    const { action, enrollCustomerReferral } = setup();

    const result = await action(request(), form());

    expect(result).toEqual({
      state: "success",
      code: "enrolled",
      referralCode: "ref_5BActionOpaqueCode",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(enrollCustomerReferral).toHaveBeenCalledWith({
      buyerUserId,
      buyerStatus: "active",
      identity,
      termsVersionId,
      termsContentHash,
    });
    expect(JSON.stringify(result)).not.toContain("buyer@example.test");
    expect(JSON.stringify(result)).not.toContain("clerk_task_5b_action");
  });

  it.each([
    ["cross origin", request("https://attacker.example")],
    ["missing origin", new Request("https://propeptiq.example/account/referrals", { method: "POST" })],
  ] as const)("rejects %s before rate limit or enrollment", async (_label, hostile) => {
    const { action, enrollCustomerReferral } = setup();

    await expect(action(hostile, form())).resolves.toEqual({
      state: "error",
      code: "origin",
      referralCode: null,
    });
    expect(enrollCustomerReferral).not.toHaveBeenCalled();
  });

  it("enforces one database-store-backed fixed window for the actor and operation", async () => {
    const { action, enrollCustomerReferral } = setup(2);

    await expect(action(request(), form())).resolves.toMatchObject({ state: "success" });
    await expect(action(request(), form())).resolves.toMatchObject({ state: "success" });
    await expect(action(request(), form())).resolves.toEqual({
      state: "error",
      code: "rate_limit",
      referralCode: null,
    });
    expect(enrollCustomerReferral).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing acceptance", { acceptCurrentTerms: null }],
    ["stale version shape", { termsVersionId: "not-a-uuid" }],
    ["hash shape", { termsContentHash: "browser-rate-10-percent" }],
    ["extra browser authority", { referralOwnerId: buyerUserId }],
  ] as const)("fails closed for %s without enrollment", async (_label, mutation) => {
    const value = form();
    for (const [key, candidate] of Object.entries(mutation)) {
      if (candidate === null) value.delete(key);
      else value.set(key, candidate);
    }
    const { action, enrollCustomerReferral } = setup();

    await expect(action(request(), value)).resolves.toEqual({
      state: "error",
      code: "invalid",
      referralCode: null,
    });
    expect(enrollCustomerReferral).not.toHaveBeenCalled();
  });
});
