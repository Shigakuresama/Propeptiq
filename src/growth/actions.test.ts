import { describe, expect, it, vi } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";

import type { Principal } from "@/domain/authorization";

import {
  createCustomerReferralEnrollmentAction,
  createSharedSetMutationAction,
} from "./actions";
import { SharedSetServiceError } from "./shared-set-service";

const now = new Date("2026-08-28T18:30:00.000Z");
const buyerUserId = "53000000-0000-4000-8000-000000000001";
const otherOwnerUserId = "53000000-0000-4000-8000-000000000099";
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

const setCode = "set_Task5CActionCode1";
const productOne = "5c000000-0000-4000-8000-000000000011";
const productTwo = "5c000000-0000-4000-8000-000000000012";
const expectedUpdatedAt = "2026-08-28T20:00:00.000Z";
const sharedSet = Object.freeze({
  code: setCode,
  label: "Analytical reference set",
  active: true,
  itemCount: 2,
  updatedAt: expectedUpdatedAt,
});

function setForm(kind: "create" | "update" | "deactivate") {
  const value = new FormData();
  value.set("idempotencyKey", `task-5c-${kind}-action-0001`);
  if (kind !== "create") {
    value.set("code", setCode);
    value.set("expectedUpdatedAt", expectedUpdatedAt);
  }
  if (kind !== "deactivate") {
    value.set("label", "Analytical reference set");
    value.set("items", JSON.stringify([
      { productId: productOne, quantity: 1 },
      { productId: productTwo, quantity: 25 },
    ]));
  }
  return value;
}

function setActionSetup(overrides: Readonly<{
  buyerStatus?: "active" | "review" | "blocked";
  principal?: Principal | null;
  limit?: number;
}> = {}) {
  let count = 0;
  const buyerStatus = overrides.buyerStatus ?? "active";
  const principal = overrides.principal === undefined
    ? Object.freeze({
        actorId: buyerUserId,
        clerkUserId: identity.clerkUserId,
        buyerStatus,
        capabilities: Object.freeze([]),
        mfaSatisfied: false,
      } satisfies Principal)
    : overrides.principal;
  const createSet = vi.fn(async () => Object.freeze({ status: "created" as const, set: sharedSet }));
  const updateSet = vi.fn(async () => Object.freeze({ status: "updated" as const, set: sharedSet }));
  const deactivateSet = vi.fn(async () => Object.freeze({
    status: "deactivated" as const,
    set: Object.freeze({ ...sharedSet, active: false }),
  }));
  const action = createSharedSetMutationAction({
    environment: Object.freeze({
      APP_ENV: "production" as const,
      APP_ORIGIN: "https://propeptiq.example",
      RATE_LIMIT_SECRET: "task-5c-action-rate-limit-secret-32-characters",
    }),
    clock: () => new Date(now),
    limit: overrides.limit ?? 3,
    rateLimitStore: {
      increment: async () => {
        count += 1;
        return count;
      },
    },
    loadActor: async () => principal === null ? null : Object.freeze({
      buyerUserId,
      buyerStatus,
      principal,
    }),
    service: Object.freeze({ createSet, updateSet, deactivateSet }),
  });
  return { action, createSet, updateSet, deactivateSet };
}

describe("shared research set action boundary", () => {
  it.each(["create", "update", "deactivate"] as const)(
    "accepts exact %s fields and returns a frozen privacy-minimal result",
    async (kind) => {
      const { action, createSet, updateSet, deactivateSet } = setActionSetup();

      const result = await action(request(), kind, setForm(kind));

      expect(result).toMatchObject({ state: "success", code: `${kind}d` });
      expect(result.set).toMatchObject({ code: setCode, itemCount: 2 });
      expect(Object.isFrozen(result)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(identity.primaryEmail!);
      expect(JSON.stringify(result)).not.toContain(identity.clerkUserId);
      const selected = kind === "create" ? createSet : kind === "update" ? updateSet : deactivateSet;
      expect(selected).toHaveBeenCalledOnce();
      expect(selected).toHaveBeenCalledWith(expect.objectContaining({
        ownerUserId: buyerUserId,
        buyerStatus: "active",
        idempotencyKey: `task-5c-${kind}-action-0001`,
      }));
    },
  );

  it.each(["create", "update", "deactivate"] as const)(
    "rejects cross-origin %s before actor lookup, rate limiting, or mutation",
    async (kind) => {
      const { action, createSet, updateSet, deactivateSet } = setActionSetup();

      await expect(action(request("https://attacker.example"), kind, setForm(kind))).resolves.toEqual({
        state: "error",
        code: "origin",
        set: null,
      });
      expect(createSet).not.toHaveBeenCalled();
      expect(updateSet).not.toHaveBeenCalled();
      expect(deactivateSet).not.toHaveBeenCalled();
    },
  );

  it.each(["review", "blocked"] as const)(
    "requires an authenticated active buyer owner for a %s account",
    async (buyerStatus) => {
      const { action, createSet } = setActionSetup({ buyerStatus });

      await expect(action(request(), "create", setForm("create"))).resolves.toEqual({
        state: "error",
        code: "identity",
        set: null,
      });
      expect(createSet).not.toHaveBeenCalled();
    },
  );

  it("rejects a principal/owner mismatch before mutation", async () => {
    const { action, createSet } = setActionSetup({
      principal: Object.freeze({
        actorId: otherOwnerUserId,
        clerkUserId: identity.clerkUserId,
        buyerStatus: "active",
        capabilities: Object.freeze([]),
        mfaSatisfied: false,
      }),
    });

    await expect(action(request(), "create", setForm("create"))).resolves.toMatchObject({
      state: "error",
      code: "identity",
    });
    expect(createSet).not.toHaveBeenCalled();
  });

  it("uses one database-backed fixed window per actor and mutation kind", async () => {
    const { action, createSet } = setActionSetup({ limit: 2 });

    await expect(action(request(), "create", setForm("create"))).resolves.toMatchObject({ state: "success" });
    await expect(action(request(), "create", setForm("create"))).resolves.toMatchObject({ state: "success" });
    await expect(action(request(), "create", setForm("create"))).resolves.toEqual({
      state: "error",
      code: "rate_limit",
      set: null,
    });
    expect(createSet).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["create", "extra owner identity", "ownerUserId"],
    ["create", "price", "price"],
    ["update", "missing CAS", "expectedUpdatedAt"],
    ["deactivate", "extra label", "label"],
  ] as const)("rejects %s form with %s", async (kind, _label, field) => {
    const formData = setForm(kind);
    if (kind === "update" && field === "expectedUpdatedAt") formData.delete(field);
    else formData.set(field, "browser authority");
    const { action, createSet, updateSet, deactivateSet } = setActionSetup();

    await expect(action(request(), kind, formData)).resolves.toEqual({
      state: "error",
      code: "invalid",
      set: null,
    });
    expect(createSet).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
    expect(deactivateSet).not.toHaveBeenCalled();
  });

  it.each([
    ["version_conflict", "conflict"],
    ["idempotency_conflict", "conflict"],
    ["owner_conflict", "conflict"],
    ["product_unavailable", "invalid"],
  ] as const)("maps %s deterministically without leaking details", async (serviceCode, actionCode) => {
    const { action, updateSet } = setActionSetup();
    updateSet.mockRejectedValueOnce(new SharedSetServiceError(serviceCode));

    await expect(action(request(), "update", setForm("update"))).resolves.toEqual({
      state: "error",
      code: actionCode,
      set: null,
    });
  });
});
