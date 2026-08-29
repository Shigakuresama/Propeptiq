import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AffiliateApplicationAdminRepository } from "@/admin/affiliate-application-admin-service";
import type { AffiliateAdminMutationTransactionInput } from "@/growth/affiliate-service";

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

import * as actionsModule from "./actions";

const now = new Date("2026-08-29T23:00:00.000Z");
const actorUserId = "8e000000-0000-4000-8000-000000000001";
const profileId = "8e000000-0000-4000-8000-000000000002";

type AffiliateAction = (formData: FormData) => Promise<never>;

function actions() {
  const candidate = actionsModule as Partial<{
    decideAffiliateApplicationAction: AffiliateAction;
    suspendAffiliateApplicationAction: AffiliateAction;
  }>;
  if (!candidate.decideAffiliateApplicationAction || !candidate.suspendAffiliateApplicationAction) {
    throw new Error("Affiliate application actions are not implemented");
  }
  return {
    decide: candidate.decideAffiliateApplicationAction,
    suspend: candidate.suspendAffiliateApplicationAction,
  };
}

function form(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function decisionForm(overrides: Readonly<Record<string, string>> = {}) {
  return form({ profileId, expectedVersion: "1", decision: "active", ...overrides });
}

function suspensionForm(overrides: Readonly<Record<string, string>> = {}) {
  return form({ profileId, expectedVersion: "2", ...overrides });
}

function request(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    environment: {
      APP_ENV: "production",
      APP_ORIGIN: "https://admin.example.test",
      RATE_LIMIT_SECRET: "task-8-affiliate-action-rate-secret-32-characters",
    },
    identity: {
      clerkUserId: "clerk-task8-affiliate-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: "2026-08-29T22:00:00.000Z",
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    principal: {
      actorId: actorUserId,
      clerkUserId: "clerk-task8-affiliate-admin",
      buyerStatus: "active",
      capabilities: ["growth:manage"],
      mfaSatisfied: true,
    },
    localDriver: null,
    ...overrides,
  };
}

function harness(options: Readonly<{
  invalidTransition?: boolean;
  rateCount?: number;
  stale?: boolean;
}> = {}) {
  let limiterCalls = 0;
  let mutationCalls = 0;
  let received: AffiliateAdminMutationTransactionInput | null = null;
  const repository: AffiliateApplicationAdminRepository = {
    rateLimitStore: {
      async increment() {
        limiterCalls += 1;
        return options.rateCount ?? 1;
      },
    },
    async mutateInTransaction(input) {
      mutationCalls += 1;
      received = input;
      if (options.stale) throw new Error("version_conflict");
      if (options.invalidTransition) throw new Error("invalid_transition");
      return {
        profile: {
          id: input.profileId,
          status: input.targetStatus,
          version: input.expectedVersion + 1,
          updatedAt: input.mutatedAt.toISOString(),
        },
      };
    },
  };
  return { repository, read: () => ({ limiterCalls, mutationCalls, received }) };
}

function install(store: ReturnType<typeof harness>, supplied: unknown = request()) {
  mocks.getRequestIdentity.mockResolvedValue(supplied);
  mocks.getRequestRepositories.mockReturnValue({
    affiliateApplicationAdminRepository: store.repository,
  });
}

async function expectResult(operation: Promise<never>, result: string) {
  await expect(operation).rejects.toThrow(
    `redirect:/admin/affiliate-applications?result=${result}`,
  );
}

describe("Task 8 affiliate application server actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
  });

  afterEach(() => vi.useRealTimers());

  it("binds exact decision and suspension fields to the real approved adapter", async () => {
    const store = harness();
    install(store);

    await expectResult(actions().decide(decisionForm()), "saved");
    expect(store.read().received).toEqual({
      actorUserId,
      actorClerkUserId: "clerk-task8-affiliate-admin",
      requiredCapability: "growth:manage",
      profileId,
      expectedVersion: 1,
      targetStatus: "active",
      correlationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      ),
      mutatedAt: now,
    });

    await expectResult(actions().suspend(suspensionForm()), "saved");
    expect(store.read()).toMatchObject({
      limiterCalls: 2,
      mutationCalls: 2,
      received: { profileId, expectedVersion: 2, targetStatus: "suspended" },
    });
  });

  it.each([
    ["extra authority", () => actions().decide(decisionForm({ actorUserId }))],
    ["cross resource", () => actions().decide(decisionForm({ resource: "affiliate-policies" }))],
    ["missing decision", () => actions().decide(form({ profileId, expectedVersion: "1" }))],
    ["unsupported decision", () => actions().decide(decisionForm({ decision: "suspended" }))],
    ["coercible version", () => actions().decide(decisionForm({ expectedVersion: "1e0" }))],
    ["zero version", () => actions().suspend(suspensionForm({ expectedVersion: "0" }))],
    ["unsafe version", () => actions().suspend(suspensionForm({ expectedVersion: "9007199254740992" }))],
    ["non-v4 UUID", () => actions().suspend(suspensionForm({ profileId: "8e000000-0000-1000-8000-000000000002" }))],
  ])("rejects %s before request identity or mutation", async (_label, invoke) => {
    await expectResult(invoke(), "denied");
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
  });

  it("rejects wrong origin and missing MFA before limiter or mutation", async () => {
    const originStore = harness();
    install(originStore);
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://attacker.example" }));
    await expectResult(actions().decide(decisionForm()), "denied");
    expect(originStore.read()).toMatchObject({ limiterCalls: 0, mutationCalls: 0 });

    const mfaStore = harness();
    install(mfaStore, {
      ...request(),
      identity: { ...request().identity, secondFactorCompleted: false },
    });
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
    await expectResult(actions().suspend(suspensionForm()), "denied");
    expect(mfaStore.read()).toMatchObject({ limiterCalls: 0, mutationCalls: 0 });
  });

  it.each([
    ["non-admin", { principal: null }],
    ["missing capability", {
      principal: { ...request().principal, capabilities: [] },
    }],
    ["blocked principal", {
      principal: { ...request().principal, buyerStatus: "blocked" },
    }],
  ])("rejects %s before limiter or mutation", async (_label, override) => {
    const store = harness();
    install(store, { ...request(), ...override });

    await expectResult(actions().decide(decisionForm()), "denied");
    expect(store.read()).toMatchObject({ limiterCalls: 0, mutationCalls: 0 });
  });

  it("reports missing request repositories as unavailable", async () => {
    mocks.getRequestIdentity.mockResolvedValue(request());
    mocks.getRequestRepositories.mockReturnValue(null);

    await expectResult(actions().suspend(suspensionForm()), "unavailable");
  });

  it("reports local unavailable, rate limit, and stale results truthfully", async () => {
    mocks.getRequestIdentity.mockResolvedValue(request({ localDriver: {} }));
    mocks.getRequestRepositories.mockReturnValue({
      affiliateApplicationAdminRepository: {
        rateLimitStore: { increment: async () => 1 },
        mutateInTransaction: async () => {
          throw new Error("Affiliate application mutation is unavailable in local mode");
        },
      },
    });
    await expectResult(actions().decide(decisionForm()), "unavailable");

    const limited = harness({ rateCount: 31 });
    install(limited);
    await expectResult(actions().decide(decisionForm()), "rate-limited");
    expect(limited.read()).toMatchObject({ limiterCalls: 1, mutationCalls: 0 });

    const stale = harness({ stale: true });
    install(stale);
    await expectResult(actions().suspend(suspensionForm()), "stale");

    const invalidTransition = harness({ invalidTransition: true });
    install(invalidTransition);
    await expectResult(actions().suspend(suspensionForm()), "denied");
  });
});
