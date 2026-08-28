import { describe, expect, it, vi } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";

import type { Principal } from "@/domain/authorization";

import {
  createAffiliateApplicationAction,
  createAffiliatePayoutBatchAction,
  createAffiliatePayoutPaidAction,
  createCustomerReferralEnrollmentAction,
  createSharedSetMutationAction,
} from "./actions";
import {
  AffiliateApplicationError,
  AffiliatePayoutError,
  type AffiliateApplicationResult,
} from "./affiliate-service";
import { SharedSetServiceError } from "./shared-set-service";

const now = new Date("2026-08-28T18:30:00.000Z");
const buyerUserId = "53000000-0000-4000-8000-000000000001";
const otherOwnerUserId = "53000000-0000-4000-8000-000000000099";
const termsVersionId = "53000000-0000-4000-8000-000000000002";
const termsContentHash = "a".repeat(64);
const payoutProfileId = "6c200000-0000-4000-8000-000000000001";
const payoutId = "6c200000-0000-4000-8000-000000000002";
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

function affiliateRequest(origin = "https://propeptiq.example") {
  return new Request("https://propeptiq.example/account/partner", {
    method: "POST",
    headers: { origin },
  });
}

function affiliateForm() {
  const value = new FormData();
  value.set("publicChannel", "https://partner.example/research");
  value.set("promotionMethod", "website");
  value.set("acceptCurrentTerms", "yes");
  value.set("termsVersionId", termsVersionId);
  value.set("termsContentHash", termsContentHash);
  return value;
}

function affiliateActionSetup(overrides: Readonly<{
  buyerStatus?: "active" | "review" | "blocked";
  principal?: Principal | null;
  identity?: VerifiedIdentity;
  limit?: number;
}> = {}) {
  let count = 0;
  const buyerStatus = overrides.buyerStatus ?? "active";
  const actorIdentity = overrides.identity ?? identity;
  const principal = overrides.principal === undefined
    ? Object.freeze({
        actorId: buyerUserId,
        clerkUserId: actorIdentity.clerkUserId,
        buyerStatus,
        capabilities: Object.freeze([]),
        mfaSatisfied: false,
      } satisfies Principal)
    : overrides.principal;
  const applyForAffiliate = vi.fn(async (): Promise<AffiliateApplicationResult> => Object.freeze({
    status: "submitted" as const,
    application: Object.freeze({
      publicCode: "aff_6AActionOpaqueCode",
      status: "pending" as const,
      version: 1,
      publicChannel: "https://partner.example/research",
      promotionMethod: "website" as const,
      createdAt: now.toISOString(),
    }),
  }));
  const action = createAffiliateApplicationAction({
    environment: Object.freeze({
      APP_ENV: "production" as const,
      APP_ORIGIN: "https://propeptiq.example",
      RATE_LIMIT_SECRET: "task-6a-action-rate-limit-secret-32-characters",
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
      identity: actorIdentity,
      principal,
    }),
    applyForAffiliate,
  });
  return { action, applyForAffiliate };
}

describe("affiliate application action boundary", () => {
  it("submits exact lightweight fields for the authenticated active owner and returns a frozen redacted result", async () => {
    const { action, applyForAffiliate } = affiliateActionSetup();

    const result = await action(affiliateRequest(), affiliateForm());

    expect(result).toEqual({
      state: "success",
      code: "submitted",
      application: {
        publicCode: "aff_6AActionOpaqueCode",
        status: "pending",
        version: 1,
        publicChannel: "https://partner.example/research",
        promotionMethod: "website",
        createdAt: now.toISOString(),
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.application)).toBe(true);
    expect(applyForAffiliate).toHaveBeenCalledWith({
      buyerUserId,
      buyerStatus: "active",
      identity,
      publicChannel: "https://partner.example/research",
      promotionMethod: "website",
      termsVersionId,
      termsContentHash,
    });
    expect(JSON.stringify(result)).not.toContain(identity.primaryEmail!);
    expect(JSON.stringify(result)).not.toContain(identity.clerkUserId);
  });

  it("returns immutable idempotent replay status without expanding the result", async () => {
    const { action, applyForAffiliate } = affiliateActionSetup();
    applyForAffiliate.mockResolvedValueOnce(Object.freeze({
      status: "idempotent" as const,
      application: Object.freeze({
        publicCode: "aff_6AActionOpaqueCode",
        status: "pending" as const,
        version: 1,
        publicChannel: "https://partner.example/research",
        promotionMethod: "website" as const,
        createdAt: now.toISOString(),
      }),
    }));

    await expect(action(affiliateRequest(), affiliateForm())).resolves.toMatchObject({
      state: "success",
      code: "idempotent",
      application: { status: "pending", version: 1 },
    });
  });

  it.each([
    ["cross origin", affiliateRequest("https://attacker.example")],
    ["missing origin", new Request("https://propeptiq.example/account/partner", { method: "POST" })],
  ] as const)("rejects %s before actor lookup, rate limiting, or mutation", async (_label, hostile) => {
    const { action, applyForAffiliate } = affiliateActionSetup();

    await expect(action(hostile, affiliateForm())).resolves.toEqual({
      state: "error",
      code: "origin",
      application: null,
    });
    expect(applyForAffiliate).not.toHaveBeenCalled();
  });

  it.each(["review", "blocked"] as const)(
    "requires an active buyer rather than a %s buyer",
    async (buyerStatus) => {
      const { action, applyForAffiliate } = affiliateActionSetup({ buyerStatus });

      await expect(action(affiliateRequest(), affiliateForm())).resolves.toEqual({
        state: "error",
        code: "identity",
        application: null,
      });
      expect(applyForAffiliate).not.toHaveBeenCalled();
    },
  );

  it("enforces owner scope before rate limiting or application work", async () => {
    const { action, applyForAffiliate } = affiliateActionSetup({
      principal: Object.freeze({
        actorId: otherOwnerUserId,
        clerkUserId: identity.clerkUserId,
        buyerStatus: "active",
        capabilities: Object.freeze([]),
        mfaSatisfied: false,
      }),
    });

    await expect(action(affiliateRequest(), affiliateForm())).resolves.toEqual({
      state: "error",
      code: "identity",
      application: null,
    });
    expect(applyForAffiliate).not.toHaveBeenCalled();
  });

  it("uses one database-backed fixed window for affiliate application submission", async () => {
    const { action, applyForAffiliate } = affiliateActionSetup({ limit: 2 });

    await expect(action(affiliateRequest(), affiliateForm())).resolves.toMatchObject({ state: "success" });
    await expect(action(affiliateRequest(), affiliateForm())).resolves.toMatchObject({ state: "success" });
    await expect(action(affiliateRequest(), affiliateForm())).resolves.toEqual({
      state: "error",
      code: "rate_limit",
      application: null,
    });
    expect(applyForAffiliate).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing terms acceptance", "acceptCurrentTerms", null],
    ["unknown promotion method", "promotionMethod", "podcast"],
    ["malformed terms version", "termsVersionId", "terms-v1"],
    ["malformed terms hash", "termsContentHash", "browser-hash"],
    ["organization document", "organizationDocument", "upload-id"],
    ["identity upload", "identityUpload", "upload-id"],
    ["tax upload", "taxDocument", "upload-id"],
    ["application essay", "essay", "Why I should be accepted"],
    ["browser owner", "buyerUserId", otherOwnerUserId],
    ["browser status", "status", "active"],
  ] as const)("rejects %s as invalid form authority", async (_label, field, value) => {
    const formData = affiliateForm();
    if (value === null) formData.delete(field);
    else formData.set(field, value);
    const { action, applyForAffiliate } = affiliateActionSetup();

    await expect(action(affiliateRequest(), formData)).resolves.toEqual({
      state: "error",
      code: "invalid",
      application: null,
    });
    expect(applyForAffiliate).not.toHaveBeenCalled();
  });

  it.each([
    ["identity_unverified", "identity"],
    ["buyer_inactive", "identity"],
    ["invalid_channel", "invalid"],
    ["invalid_promotion_method", "invalid"],
    ["content_rejected", "invalid"],
    ["terms_mismatch", "invalid"],
    ["idempotency_conflict", "conflict"],
    ["terms_unavailable", "unavailable"],
    ["persistence_conflict", "unavailable"],
  ] as const)("maps service %s without leaking details", async (serviceCode, actionCode) => {
    const { action, applyForAffiliate } = affiliateActionSetup();
    applyForAffiliate.mockRejectedValueOnce(new AffiliateApplicationError(serviceCode));

    await expect(action(affiliateRequest(), affiliateForm())).resolves.toEqual({
      state: "error",
      code: actionCode,
      application: null,
    });
  });
});

const payoutPrincipal: Principal = Object.freeze({
  actorId: "6c200000-0000-4000-8000-000000000090",
  clerkUserId: "clerk_task_6c_action_admin",
  buyerStatus: null,
  capabilities: Object.freeze(["affiliate:payout"] as const),
  mfaSatisfied: true,
});

const payoutActionResult = Object.freeze({
  status: "created" as const,
  payout: Object.freeze({
    id: payoutId,
    affiliateProfileId: payoutProfileId,
    affiliatePolicyId: "6c200000-0000-4000-8000-000000000003",
    affiliatePolicyVersion: 1,
    amountMinor: 5_000,
    currency: "USD" as const,
    state: "pending" as const,
    version: 1,
    commissionCount: 1,
    providerName: null,
    externalReference: null,
    createdAt: now.toISOString(),
    paidAt: null,
  }),
});

function payoutBatchForm() {
  const value = new FormData();
  value.set("profileId", payoutProfileId);
  value.set("idempotencyKey", "task-6c-payout-action-create-one");
  value.set("correlationId", "task-6c-payout-action-create-correlation");
  return value;
}

function payoutPaidForm() {
  const value = new FormData();
  value.set("payoutId", payoutId);
  value.set("expectedVersion", "1");
  value.set("idempotencyKey", "task-6c-payout-action-paid-one");
  value.set("providerName", "ACH operator");
  value.set("externalReference", "bank-confirmation-6c-action-001");
  value.set("correlationId", "task-6c-payout-action-paid-correlation");
  return value;
}

describe("affiliate payout action boundary", () => {
  it("accepts only profile and idempotency authority for server-selected batching", async () => {
    const createBatch = vi.fn(async () => payoutActionResult);
    const action = createAffiliatePayoutBatchAction({
      environment: { APP_ENV: "production", APP_ORIGIN: "https://propeptiq.example" },
      loadPrincipal: async () => payoutPrincipal,
      createBatch,
    });

    await expect(action(request(), payoutBatchForm())).resolves.toEqual({
      state: "success",
      code: "created",
      payout: payoutActionResult.payout,
    });
    expect(createBatch).toHaveBeenCalledWith({
      principal: payoutPrincipal,
      profileId: payoutProfileId,
      idempotencyKey: "task-6c-payout-action-create-one",
      correlationId: "task-6c-payout-action-create-correlation",
    });
  });

  it.each(["amountMinor", "currency", "commissionIds", "affiliatePolicyVersion", "paymentOutcome"])(
    "rejects browser-supplied %s authority before service selection",
    async (field) => {
      const createBatch = vi.fn();
      const action = createAffiliatePayoutBatchAction({
        environment: { APP_ENV: "production", APP_ORIGIN: "https://propeptiq.example" },
        loadPrincipal: async () => payoutPrincipal,
        createBatch,
      });
      const supplied = payoutBatchForm();
      supplied.set(field, "browser-value");

      await expect(action(request(), supplied)).resolves.toEqual({
        state: "error", code: "invalid", payout: null,
      });
      expect(createBatch).not.toHaveBeenCalled();
    },
  );

  it("passes only expected-version and bounded external evidence to paid recording", async () => {
    const paidResult = Object.freeze({
      status: "paid" as const,
      payout: Object.freeze({
        ...payoutActionResult.payout,
        state: "paid" as const,
        version: 2,
        providerName: "ACH operator",
        externalReference: "bank-confirmation-6c-action-001",
        paidAt: now.toISOString(),
      }),
    });
    const markPaid = vi.fn(async () => paidResult);
    const action = createAffiliatePayoutPaidAction({
      environment: { APP_ENV: "production", APP_ORIGIN: "https://propeptiq.example" },
      loadPrincipal: async () => payoutPrincipal,
      markPaid,
    });

    await expect(action(request(), payoutPaidForm())).resolves.toEqual({
      state: "success", code: "paid", payout: paidResult.payout,
    });
    expect(markPaid).toHaveBeenCalledWith({
      principal: payoutPrincipal,
      payoutId,
      expectedVersion: 1,
      idempotencyKey: "task-6c-payout-action-paid-one",
      providerName: "ACH operator",
      externalReference: "bank-confirmation-6c-action-001",
      correlationId: "task-6c-payout-action-paid-correlation",
    });
  });

  it("denies missing external evidence, wrong origin, and service conflicts without leaking internals", async () => {
    const markPaid = vi.fn(async () => {
      throw new AffiliatePayoutError("version_conflict");
    });
    const action = createAffiliatePayoutPaidAction({
      environment: { APP_ENV: "production", APP_ORIGIN: "https://propeptiq.example" },
      loadPrincipal: async () => payoutPrincipal,
      markPaid,
    });
    const missing = payoutPaidForm();
    missing.set("externalReference", "");
    await expect(action(request(), missing)).resolves.toEqual({
      state: "error", code: "invalid", payout: null,
    });
    await expect(action(request("https://evil.example"), payoutPaidForm())).resolves.toEqual({
      state: "error", code: "origin", payout: null,
    });
    await expect(action(request(), payoutPaidForm())).resolves.toEqual({
      state: "error", code: "conflict", payout: null,
    });
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
