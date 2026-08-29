import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminAuditEvent,
  AdminRepository,
  AdminTransaction,
} from "@/admin/admin-service";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  getRequestRepositories: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  randomUUID: vi.fn(() => "8c1c0000-0000-4000-8000-000000000001"),
}));

vi.mock("node:crypto", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:crypto")>(),
  randomUUID: mocks.randomUUID,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  getRequestRepositories: mocks.getRequestRepositories,
  loadTargetVerifiedIdentity: vi.fn(),
}));

import * as actionsModule from "./actions";

const now = new Date("2026-08-29T18:00:00.000Z");
const actorId = "8c1c0000-0000-4000-8000-000000000002";
const rewardAccountId = "8c1c0000-0000-4000-8000-000000000003";

type RewardAdjustmentAction = (formData: FormData) => Promise<never>;

function action(): RewardAdjustmentAction {
  const candidate = (actionsModule as Partial<{
    adjustRewardBalanceAction: RewardAdjustmentAction;
  }>).adjustRewardBalanceAction;
  if (!candidate) throw new Error("adjustRewardBalanceAction is not implemented");
  return candidate;
}

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    rewardAccountId,
    delta: "250",
    reason: "account_correction",
    internalAuditReason: "Corrected a verified migration discrepancy.",
    ...overrides,
  })) {
    data.set(name, value);
  }
  return data;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    environment: {
      APP_ENV: "production",
      APP_ORIGIN: "https://admin.example.test",
      RATE_LIMIT_SECRET: "task-8c1a2-rate-limit-secret-at-least-32-characters",
    },
    identity: {
      clerkUserId: "clerk-growth-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: now.toISOString(),
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
    ...overrides,
  };
}

function harness(options: Readonly<{ failAudit?: boolean; rateCount?: number }> = {}) {
  let availablePoints = 1_000;
  let storedInput: Readonly<{
    entryId: string;
    rewardAccountId: string;
    delta: number;
    reason: "account_correction";
    idempotencyKey: string;
    fingerprint: string;
    occurredAt: Date;
  }> | null = null;
  let audits: AdminAuditEvent[] = [];
  let rateLimitCalls = 0;
  let transactions = 0;

  const repository: AdminRepository = {
    rateLimitStore: {
      async increment() {
        rateLimitCalls += 1;
        return options.rateCount ?? 1;
      },
    },
    async transaction<Result>(work: (transaction: AdminTransaction) => Promise<Result>) {
      return repository.retrySerializableTransaction(work);
    },
    async retrySerializableTransaction<Result>(
      work: (transaction: AdminTransaction) => Promise<Result>,
    ) {
      transactions += 1;
      const balanceBefore = availablePoints;
      const storedBefore = storedInput;
      const stagedAudits = [...audits];
      try {
        const result = await work({
          async assertActorAuthority(input) {
            if (
              input.actorUserId !== actorId ||
              input.clerkUserId !== "clerk-growth-admin" ||
              input.capability !== "growth:manage"
            ) {
              throw new Error("Persisted growth:manage capability is required");
            }
          },
          async adjustRewardBalance(input) {
            storedInput = input;
            availablePoints += input.delta;
            return {
              status: "applied" as const,
              entryId: input.entryId,
              rewardAccountId: input.rewardAccountId,
              delta: input.delta,
              reason: input.reason,
              availablePointsBalanceAfter: availablePoints,
            };
          },
          async appendAudit(event) {
            if (options.failAudit) throw new Error("Synthetic audit insert failure");
            stagedAudits.push(event);
          },
        } as AdminTransaction);
        audits = stagedAudits;
        return result;
      } catch (error) {
        availablePoints = balanceBefore;
        storedInput = storedBefore;
        throw error;
      }
    },
  };

  return {
    repository,
    read: () => ({ audits, availablePoints, rateLimitCalls, storedInput, transactions }),
  };
}

function install(store: ReturnType<typeof harness>, supplied = request()): void {
  mocks.getRequestIdentity.mockResolvedValue(supplied);
  mocks.getRequestRepositories.mockReturnValue({ adminRepository: store.repository });
}

async function expectResult(data: FormData, result: string): Promise<void> {
  await expect(action()(data)).rejects.toThrow(
    `redirect:/admin/reward-adjustments?result=${result}`,
  );
}

describe("Task 8C1A2 reward adjustment action safeguards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
  });

  afterEach(() => vi.useRealTimers());

  it("reports saved only after the real service validates and commits server-owned authority", async () => {
    const store = harness();
    install(store);

    await expectResult(form(), "saved");

    expect(store.read()).toMatchObject({
      availablePoints: 1_250,
      rateLimitCalls: 1,
      transactions: 1,
      storedInput: {
        entryId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        ),
        rewardAccountId,
        delta: 250,
        reason: "account_correction",
      },
    });
    expect(store.read().storedInput?.idempotencyKey).toMatch(
      /^reward-adjustment:[0-9a-f-]{36}$/u,
    );
    expect(store.read().audits).toEqual([expect.objectContaining({
      actorUserId: actorId,
      action: "growth.reward.adjusted",
      resourceType: "reward_account",
      resourceId: rewardAccountId,
      metadata: {
        delta: 250,
        reason: "account_correction",
        internalAuditReason: "Corrected a verified migration discrepancy.",
      },
    })]);
  });

  it.each([
    ["extra actor authority", { actorUserId: actorId }],
    ["browser idempotency", { idempotencyKey: "browser-owned-idempotency" }],
    ["coercible delta", { delta: "1e2" }],
    ["zero delta", { delta: "0" }],
    ["out-of-bound delta", { delta: "10001" }],
    ["unknown reason", { reason: "customer_request" }],
    ["blank private reason", { internalAuditReason: "" }],
  ])("rejects %s before identity, limiter, or transaction", async (_label, overrides) => {
    const store = harness();
    install(store);

    await expectResult(form(overrides), "denied");

    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(store.read()).toMatchObject({ rateLimitCalls: 0, transactions: 0, availablePoints: 1_000 });
    expect(store.read().audits).toEqual([]);
  });

  it("rejects a wrong origin before limiter or transaction", async () => {
    const store = harness();
    install(store);
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://attacker.example" }));

    await expectResult(form(), "denied");

    expect(store.read()).toMatchObject({ rateLimitCalls: 0, transactions: 0 });
  });

  it.each([
    ["missing capability", { principal: { ...request().principal, capabilities: [] } }],
    ["missing MFA", { identity: { ...request().identity, secondFactorCompleted: false } }],
    ["blocked", { principal: { ...request().principal, buyerStatus: "blocked" } }],
  ])("rejects %s before limiter or transaction", async (_label, override) => {
    const store = harness();
    install(store, { ...request(), ...override });

    await expectResult(form(), "denied");

    expect(store.read()).toMatchObject({ rateLimitCalls: 0, transactions: 0 });
  });

  it("reports rate limiting before a transaction", async () => {
    const store = harness({ rateCount: 31 });
    install(store);

    await expectResult(form(), "rate-limited");

    expect(store.read()).toMatchObject({ rateLimitCalls: 1, transactions: 0 });
  });

  it("rolls back the adjustment when audit insertion fails", async () => {
    const store = harness({ failAudit: true });
    install(store);

    await expectResult(form(), "denied");

    expect(store.read()).toMatchObject({ availablePoints: 1_000, transactions: 1 });
    expect(store.read().audits).toEqual([]);
  });
});
