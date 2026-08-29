import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminRepository,
  AdminTransaction,
  GrowthPolicyKind,
  GrowthPolicyValues,
} from "@/admin/admin-service";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  getRequestRepositories: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  getRequestRepositories: mocks.getRequestRepositories,
  loadTargetVerifiedIdentity: vi.fn(),
}));

import {
  activateAffiliatePolicyAction,
  activateLoyaltyPolicyAction,
  activateReferralPolicyAction,
  createAffiliatePolicyDraftAction,
  createLoyaltyPolicyDraftAction,
  createReferralPolicyDraftAction,
} from "./actions";

const now = new Date("2026-08-28T20:00:00.000Z");
const actorId = "8b310000-0000-4000-8000-000000000001";
const stalePolicyId = "8b310000-0000-4000-8000-000000000002";

const policyCases = [
  {
    kind: "loyalty",
    resource: "loyalty-policies",
    create: createLoyaltyPolicyDraftAction,
    activate: activateLoyaltyPolicyAction,
    values: {
      pointsPerDollar: 2,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
    },
  },
  {
    kind: "referral",
    resource: "referral-policies",
    create: createReferralPolicyDraftAction,
    activate: activateReferralPolicyAction,
    values: {
      attributionDays: 30,
      referredDiscountBasisPoints: 1_000,
      referredDiscountCapMinor: 2_500,
      referrerPointsPerDollar: 5,
      referrerRewardCapPoints: 2_500,
    },
  },
  {
    kind: "affiliate",
    resource: "affiliate-policies",
    create: createAffiliatePolicyDraftAction,
    activate: activateAffiliatePolicyAction,
    values: {
      attributionDays: 30,
      firstOrderCommissionBasisPoints: 1_000,
      reorderCommissionBasisPoints: 500,
      reorderWindowDays: 180,
      approvalDelayDays: 30,
      payoutThresholdMinor: 5_000,
      currency: "USD",
    },
  },
] as const;

type Policy = {
  id: string;
  kind: GrowthPolicyKind;
  version: number;
  status: "draft" | "active" | "retired";
  effectiveAt: string;
  values: GrowthPolicyValues;
};

type Controls = {
  failAudit: boolean;
  failCreate: boolean;
  invalidDraftReturn: boolean;
  persistedCapability: boolean;
  rateCount: number;
};

type Harness = {
  audits: unknown[];
  authorityChecks: number;
  commits: number;
  controls: Controls;
  policies: Policy[];
  rateLimitCalls: number;
  repository: AdminRepository;
  rollbacks: number;
  transactions: number;
};

function form(values: Readonly<Record<string, unknown>>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    data.set(name, value === null ? "" : String(value));
  }
  return data;
}

function draftForm(entry: (typeof policyCases)[number], extra = {}) {
  return form({ effectiveAt: now.toISOString(), ...entry.values, ...extra });
}

function baseRequest() {
  return {
    environment: {
      APP_ENV: "production",
      APP_ORIGIN: "https://admin.example.test",
      RATE_LIMIT_SECRET: "task-8b3-safeguard-rate-secret-at-least-32-characters",
    },
    identity: {
      clerkUserId: "clerk-growth-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: "2026-08-28T00:00:00.000Z",
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    principal: {
      actorId,
      clerkUserId: "clerk-growth-admin",
      buyerStatus: "active",
      capabilities: ["growth:manage"],
      mfaSatisfied: true,
    },
    localDriver: null,
  };
}

function createHarness(overrides: Partial<Controls> = {}): Harness {
  const harness = {
    audits: [],
    authorityChecks: 0,
    commits: 0,
    controls: {
      failAudit: false,
      failCreate: false,
      invalidDraftReturn: false,
      persistedCapability: true,
      rateCount: 1,
      ...overrides,
    },
    policies: [],
    rateLimitCalls: 0,
    rollbacks: 0,
    transactions: 0,
  } as unknown as Harness;

  function transactionPort(): AdminTransaction {
    const port: Pick<
      AdminTransaction,
      | "assertActorAuthority"
      | "createGrowthPolicyDraft"
      | "activateGrowthPolicy"
      | "appendAudit"
    > = {
      async assertActorAuthority(input) {
        harness.authorityChecks += 1;
        if (
          !harness.controls.persistedCapability ||
          input.actorUserId !== actorId ||
          input.clerkUserId !== "clerk-growth-admin" ||
          input.capability !== "growth:manage"
        ) {
          throw new Error("Persisted growth:manage capability is required");
        }
      },
      async createGrowthPolicyDraft(input) {
        if (harness.controls.failCreate) throw new Error("Synthetic repository service failure");
        const version = Math.max(
          0,
          ...harness.policies
            .filter((policy) => policy.kind === input.kind)
            .map((policy) => policy.version),
        ) + 1;
        harness.policies.push({
          id: input.id,
          kind: input.kind,
          version,
          status: "draft",
          effectiveAt: input.effectiveAt.toISOString(),
          values: input.values,
        });
        return harness.controls.invalidDraftReturn
          ? { id: stalePolicyId, kind: input.kind, version, status: "draft" }
          : { id: input.id, kind: input.kind, version, status: "draft" };
      },
      async activateGrowthPolicy(input) {
        const candidate = harness.policies.find((policy) =>
          policy.id === input.id &&
          policy.kind === input.kind &&
          policy.version === input.expectedVersion &&
          policy.status === "draft");
        if (!candidate) throw new Error("Stale growth policy activation rejected");
        for (const policy of harness.policies) {
          if (policy.kind === input.kind && policy.status === "active") policy.status = "retired";
        }
        candidate.status = "active";
        return {
          id: candidate.id,
          kind: candidate.kind,
          version: candidate.version,
          status: "active",
        };
      },
      async appendAudit(event) {
        if (harness.controls.failAudit) throw new Error("Synthetic audit failure");
        harness.audits.push(event);
      },
    };
    return port as AdminTransaction;
  }

  const transaction: AdminRepository["transaction"] = async (work) => {
    harness.transactions += 1;
    const policiesBefore = harness.policies.map((policy) => ({ ...policy }));
    const auditsBefore = [...harness.audits];
    try {
      const result = await work(transactionPort());
      harness.commits += 1;
      return result;
    } catch (error) {
      harness.policies.splice(0, harness.policies.length, ...policiesBefore);
      harness.audits.splice(0, harness.audits.length, ...auditsBefore);
      harness.rollbacks += 1;
      throw error;
    }
  };

  harness.repository = {
    rateLimitStore: {
      async increment() {
        harness.rateLimitCalls += 1;
        return harness.controls.rateCount;
      },
    },
    transaction,
    retrySerializableTransaction: transaction,
  };
  return harness;
}

function install(harness: Harness, request: unknown = baseRequest()): void {
  mocks.getRequestIdentity.mockResolvedValue(request);
  mocks.getRequestRepositories.mockReturnValue({ adminRepository: harness.repository });
}

async function expectResult(operation: Promise<never>, resource: string, result: string): Promise<void> {
  await expect(operation).rejects.toThrow(`redirect:/admin/${resource}?result=${result}`);
}

describe("Task 8B3 real-service growth policy action safeguards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
  });

  afterEach(() => vi.useRealTimers());

  it.each(policyCases)("reports saved for $resource only after validated real-service commits", async (entry) => {
    const harness = createHarness();
    install(harness);

    await expectResult(entry.create(draftForm(entry)), entry.resource, "saved");
    expect(harness.policies).toHaveLength(1);
    expect(harness.policies[0]).toMatchObject({
      kind: entry.kind,
      version: 1,
      status: "draft",
      values: entry.values,
    });
    expect(harness.commits).toBe(1);
    expect(harness.audits).toEqual([]);

    const policyId = harness.policies[0]!.id;
    await expectResult(
      entry.activate(form({ policyId, expectedVersion: 1 })),
      entry.resource,
      "saved",
    );
    expect(harness.policies[0]).toMatchObject({ id: policyId, kind: entry.kind, status: "active" });
    expect(harness.commits).toBe(2);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      actorUserId: actorId,
      action: "growth.policy.activated",
      resourceType: `${entry.kind}_policy`,
      resourceId: policyId,
      metadata: { kind: entry.kind, version: 1, status: "active" },
    });
    expect(harness.rateLimitCalls).toBe(2);
    expect(harness.authorityChecks).toBe(2);
  });

  it.each([
    ["missing", new Headers()],
    ["wrong", new Headers({ origin: "https://attacker.example" })],
  ])("rejects %s origin before limiter, transaction, or write", async (_label, suppliedHeaders) => {
    const harness = createHarness();
    install(harness);
    mocks.headers.mockResolvedValue(suppliedHeaders);
    await expectResult(policyCases[0].create(draftForm(policyCases[0])), "loyalty-policies", "denied");
    expect(harness).toMatchObject({ rateLimitCalls: 0, transactions: 0, commits: 0 });
    expect(harness.policies).toEqual([]);
  });

  it.each([
    ["non-admin", { identity: null, principal: null }],
    ["missing growth capability", {
      principal: { ...baseRequest().principal, capabilities: [] },
    }],
    ["missing MFA", {
      identity: { ...baseRequest().identity, secondFactorCompleted: false },
    }],
    ["blocked principal", {
      principal: { ...baseRequest().principal, buyerStatus: "blocked" },
    }],
  ])("rejects %s before limiter, transaction, or write", async (_label, override) => {
    const harness = createHarness();
    install(harness, { ...baseRequest(), ...override });
    await expectResult(policyCases[0].create(draftForm(policyCases[0])), "loyalty-policies", "denied");
    expect(harness).toMatchObject({ rateLimitCalls: 0, transactions: 0, commits: 0 });
    expect(harness.policies).toEqual([]);
  });

  it("rejects missing persisted capability before a write", async () => {
    const harness = createHarness({ persistedCapability: false });
    install(harness);
    await expectResult(policyCases[0].create(draftForm(policyCases[0])), "loyalty-policies", "unavailable");
    expect(harness).toMatchObject({ rateLimitCalls: 1, transactions: 1, commits: 0, rollbacks: 1 });
    expect(harness.policies).toEqual([]);
  });

  it("reports rate-limit denial before opening a transaction", async () => {
    const harness = createHarness({ rateCount: 31 });
    install(harness);
    await expectResult(policyCases[0].create(draftForm(policyCases[0])), "loyalty-policies", "rate-limited");
    expect(harness).toMatchObject({ rateLimitCalls: 1, transactions: 0, commits: 0 });
    expect(harness.policies).toEqual([]);
  });

  it("maps a repository service failure without a saved result or write", async () => {
    const harness = createHarness({ failCreate: true });
    install(harness);
    await expectResult(policyCases[0].create(draftForm(policyCases[0])), "loyalty-policies", "denied");
    expect(harness).toMatchObject({ commits: 0, rollbacks: 1 });
    expect(harness.policies).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("rolls back prior retirement and activation when audit insertion fails", async () => {
    const harness = createHarness();
    harness.policies.push({
      id: "8b310000-0000-4000-8000-000000000010",
      kind: "loyalty",
      version: 1,
      status: "active",
      effectiveAt: "2026-08-27T20:00:00.000Z",
      values: policyCases[0].values,
    });
    install(harness);
    await expectResult(policyCases[0].create(draftForm(policyCases[0])), "loyalty-policies", "saved");
    const draft = harness.policies.find((policy) => policy.status === "draft")!;
    harness.controls.failAudit = true;

    await expectResult(
      policyCases[0].activate(form({ policyId: draft.id, expectedVersion: 2 })),
      "loyalty-policies",
      "denied",
    );
    expect(harness.policies.map(({ version, status }) => ({ version, status }))).toEqual([
      { version: 1, status: "active" },
      { version: 2, status: "draft" },
    ]);
    expect(harness.audits).toEqual([]);
    expect(harness.rollbacks).toBe(1);
  });

  it("rejects stale CAS without a saved result, mutation, or audit", async () => {
    const harness = createHarness();
    install(harness);
    await expectResult(
      policyCases[0].activate(form({ policyId: stalePolicyId, expectedVersion: 1 })),
      "loyalty-policies",
      "stale",
    );
    expect(harness).toMatchObject({ commits: 0, rollbacks: 1 });
    expect(harness.policies).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("rejects an invalid transactional read-back and rolls back its write", async () => {
    const harness = createHarness({ invalidDraftReturn: true });
    install(harness);
    await expectResult(policyCases[0].create(draftForm(policyCases[0])), "loyalty-policies", "denied");
    expect(harness).toMatchObject({ commits: 0, rollbacks: 1 });
    expect(harness.policies).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("rejects extra browser authority before the real service or repository", async () => {
    const harness = createHarness();
    install(harness);
    await expectResult(
      policyCases[0].create(draftForm(policyCases[0], { kind: "affiliate" })),
      "loyalty-policies",
      "denied",
    );
    expect(harness).toMatchObject({ rateLimitCalls: 0, transactions: 0, commits: 0 });
  });
});
