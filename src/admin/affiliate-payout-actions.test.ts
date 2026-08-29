import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AffiliatePayoutAdminRepository } from "@/admin/affiliate-payout-admin-service";

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

const now = new Date("2026-08-30T21:00:00.000Z");
const actorUserId = "8f400000-0000-4000-8000-000000000001";
const profileId = "8f400000-0000-4000-8000-000000000002";
const payoutId = "8f400000-0000-4000-8000-000000000003";
const policyId = "8f400000-0000-4000-8000-000000000004";
const commissionId = "8f400000-0000-4000-8000-000000000005";
const createCommandToken = "8f400000-0000-4000-8000-000000000006";
const paidCommandToken = "8f400000-0000-4000-8000-000000000007";

type PayoutAction = (formData: FormData) => Promise<never>;

function actions() {
  const candidate = actionsModule as Partial<{
    createAffiliatePayoutBatchAdminAction: PayoutAction;
    recordAffiliatePayoutPaidAdminAction: PayoutAction;
  }>;
  if (!candidate.createAffiliatePayoutBatchAdminAction ||
      !candidate.recordAffiliatePayoutPaidAdminAction) {
    throw new Error("Affiliate payout admin actions are not implemented");
  }
  return {
    create: candidate.createAffiliatePayoutBatchAdminAction,
    paid: candidate.recordAffiliatePayoutPaidAdminAction,
  };
}

function form(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function request(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    environment: {
      APP_ENV: "production",
      APP_ORIGIN: "https://admin.example.test",
      RATE_LIMIT_SECRET: "task-8-payout-action-rate-secret-32-characters",
    },
    identity: {
      clerkUserId: "clerk-task8-payout-action-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: "2026-08-30T20:00:00.000Z",
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    principal: {
      actorId: actorUserId,
      clerkUserId: "clerk-task8-payout-action-admin",
      buyerStatus: "active",
      capabilities: ["affiliate:payout"],
      mfaSatisfied: true,
    },
    localDriver: null,
    ...overrides,
  };
}

function harness(options: Readonly<{ rateCount?: number; error?: string }> = {}) {
  let limiterCalls = 0;
  const createInputs: unknown[] = [];
  const paidInputs: unknown[] = [];
  const repository: AffiliatePayoutAdminRepository = {
    rateLimitStore: {
      async increment() {
        limiterCalls += 1;
        return options.rateCount ?? 1;
      },
    },
    async createInTransaction(input) {
      createInputs.push(input);
      if (options.error) throw new Error(options.error);
      return {
        status: "applied",
        payout: {
          id: input.payoutId,
          affiliateProfileId: input.profileId,
          affiliatePolicyId: policyId,
          affiliatePolicyVersion: 1,
          idempotencyKey: input.idempotencyKey,
          amountMinor: 5_000,
          currency: "USD",
          state: "pending",
          version: 1,
          commissionIds: [commissionId],
          providerName: null,
          externalReference: null,
          paidAt: null,
          createdAt: input.createdAt.toISOString(),
        },
      };
    },
    async markPaidInTransaction(input) {
      paidInputs.push(input);
      if (options.error) throw new Error(options.error);
      return {
        status: "applied",
        payout: {
          id: input.payoutId,
          affiliateProfileId: profileId,
          affiliatePolicyId: policyId,
          affiliatePolicyVersion: 1,
          idempotencyKey: "affiliate-payout-create:fixed",
          amountMinor: 5_000,
          currency: "USD",
          state: "paid",
          version: input.expectedVersion + 1,
          commissionIds: [commissionId],
          providerName: input.providerName,
          externalReference: input.externalReference,
          paidAt: input.paidAt.toISOString(),
          createdAt: now.toISOString(),
        },
      };
    },
  };
  return { repository, read: () => ({ limiterCalls, createInputs, paidInputs }) };
}

function install(store: ReturnType<typeof harness>, supplied: unknown = request()) {
  mocks.getRequestIdentity.mockResolvedValue(supplied);
  mocks.getRequestRepositories.mockReturnValue({
    affiliatePayoutAdminRepository: store.repository,
  });
}

async function expectResult(operation: Promise<never>, result: string) {
  await expect(operation).rejects.toThrow(`redirect:/admin/payouts?result=${result}`);
}

describe("Task 8 affiliate payout server actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
  });

  afterEach(() => vi.useRealTimers());

  it("accepts only a rendered command token and profile for server-selected batching", async () => {
    const store = harness();
    install(store);
    await expectResult(actions().create(form({ commandToken: createCommandToken, profileId })), "saved");

    const input = store.read().createInputs[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      actorUserId,
      actorClerkUserId: "clerk-task8-payout-action-admin",
      requiredCapability: "affiliate:payout",
      profileId,
      payoutId: createCommandToken,
      idempotencyKey: `affiliate-payout-create:${createCommandToken}`,
      correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      createdAt: now,
    });
  });

  it("accepts only expected-version and bounded external evidence for paid recording", async () => {
    const store = harness();
    install(store);
    await expectResult(actions().paid(form({
      commandToken: paidCommandToken,
      payoutId,
      expectedVersion: "1",
      providerName: "Offline ACH operator",
      externalReference: "ach-confirmation-0001",
    })), "saved");

    expect(store.read().paidInputs[0]).toMatchObject({
      actorUserId,
      actorClerkUserId: "clerk-task8-payout-action-admin",
      requiredCapability: "affiliate:payout",
      payoutId,
      expectedVersion: 1,
      idempotencyKey: `affiliate-payout-paid:${paidCommandToken}`,
      providerName: "Offline ACH operator",
      externalReference: "ach-confirmation-0001",
      correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      paidAt: now,
    });
  });

  it("reuses the rendered command token for exact payout retries", async () => {
    const store = harness();
    install(store);
    const commandToken = "8f400000-0000-4000-8000-000000000099";
    const createForm = form({ commandToken, profileId });
    await expectResult(actions().create(createForm), "saved");
    await expectResult(actions().create(createForm), "saved");

    const paidForm = form({
      commandToken,
      payoutId,
      expectedVersion: "1",
      providerName: "Offline ACH operator",
      externalReference: "ach-confirmation-0001",
    });
    await expectResult(actions().paid(paidForm), "saved");
    await expectResult(actions().paid(paidForm), "saved");

    const { createInputs, paidInputs } = store.read();
    expect(createInputs).toHaveLength(2);
    expect(paidInputs).toHaveLength(2);
    expect(createInputs[0]).toMatchObject({
      payoutId: commandToken,
      idempotencyKey: `affiliate-payout-create:${commandToken}`,
    });
    expect(createInputs[1]).toMatchObject({
      payoutId: commandToken,
      idempotencyKey: `affiliate-payout-create:${commandToken}`,
      profileId,
    });
    expect(paidInputs[0]).toMatchObject({
      idempotencyKey: `affiliate-payout-paid:${commandToken}`,
    });
    expect(paidInputs[1]).toMatchObject({
      payoutId,
      expectedVersion: 1,
      idempotencyKey: `affiliate-payout-paid:${commandToken}`,
      providerName: "Offline ACH operator",
      externalReference: "ach-confirmation-0001",
    });
  });

  it.each([
    ["browser amount", () => actions().create(form({ commandToken: createCommandToken, profileId, amountMinor: "5000" }))],
    ["browser idempotency", () => actions().create(form({ commandToken: createCommandToken, profileId, idempotencyKey: "chosen" }))],
    ["missing profile", () => actions().create(form({ commandToken: createCommandToken }))],
    ["non-v4 profile", () => actions().create(form({ commandToken: createCommandToken, profileId: profileId.replace("-4000-", "-1000-") }))],
    ["coercible version", () => actions().paid(form({ commandToken: paidCommandToken, payoutId, expectedVersion: "1e0", providerName: "ACH", externalReference: "ref" }))],
    ["unsafe version", () => actions().paid(form({ commandToken: paidCommandToken, payoutId, expectedVersion: "9007199254740992", providerName: "ACH", externalReference: "ref" }))],
    ["external command field", () => actions().paid(form({ commandToken: paidCommandToken, payoutId, expectedVersion: "1", providerName: "ACH", externalReference: "ref", sendMoney: "yes" }))],
  ])("rejects %s before identity, limiter, or transaction", async (_label, invoke) => {
    await expectResult(invoke(), "denied");
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
  });

  it("denies wrong origin, missing MFA, missing capability, and blocked principals", async () => {
    const wrongOrigin = harness();
    install(wrongOrigin);
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://attacker.example" }));
    await expectResult(actions().create(form({ commandToken: createCommandToken, profileId })), "denied");

    for (const supplied of [
      { ...request(), identity: { ...request().identity, secondFactorCompleted: false } },
      { ...request(), principal: { ...request().principal, capabilities: [] } },
      { ...request(), principal: { ...request().principal, buyerStatus: "blocked" } },
    ]) {
      const denied = harness();
      install(denied, supplied);
      mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
      await expectResult(actions().create(form({ commandToken: createCommandToken, profileId })), "denied");
      expect(denied.read()).toMatchObject({ limiterCalls: 0, createInputs: [] });
    }
  });

  it("reports local unavailability, rate limit, stale version, and threshold honestly", async () => {
    const local = harness({ error: "Affiliate payout mutation is unavailable in local mode" });
    install(local, request({ localDriver: {} }));
    await expectResult(actions().create(form({ commandToken: createCommandToken, profileId })), "unavailable");

    const limited = harness({ rateCount: 31 });
    install(limited);
    await expectResult(actions().create(form({ commandToken: createCommandToken, profileId })), "rate-limited");
    expect(limited.read()).toMatchObject({ limiterCalls: 1, createInputs: [] });

    const stale = harness({ error: "version_conflict" });
    install(stale);
    await expectResult(actions().paid(form({
      commandToken: paidCommandToken, payoutId, expectedVersion: "1", providerName: "ACH", externalReference: "ref",
    })), "stale");

    const threshold = harness({ error: "threshold_not_met" });
    install(threshold);
    await expectResult(actions().create(form({ commandToken: createCommandToken, profileId })), "unavailable");
  });
});
