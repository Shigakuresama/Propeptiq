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
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  getRequestRepositories: mocks.getRequestRepositories,
  loadTargetVerifiedIdentity: vi.fn(),
}));

import * as actionsModule from "./actions";

const now = new Date("2026-08-29T22:00:00.000Z");
const actorId = "8c1a7000-0000-4000-8000-000000000001";
const referralCodeId = "8c1a7000-0000-4000-8000-000000000002";
const sharedSetId = "8c1a7000-0000-4000-8000-000000000003";
const expectedCreatedAt = "2026-08-28T20:00:00.000Z";
const expectedUpdatedAt = "2026-08-28T21:00:00.000Z";

type LifecycleAction = (formData: FormData) => Promise<never>;

function actions(): Readonly<{
  revoke: LifecycleAction;
  deactivate: LifecycleAction;
}> {
  const candidate = actionsModule as Partial<{
    revokeReferralCodeAction: LifecycleAction;
    deactivateSharedSetAction: LifecycleAction;
  }>;
  if (!candidate.revokeReferralCodeAction || !candidate.deactivateSharedSetAction) {
    throw new Error("Growth lifecycle actions are not implemented");
  }
  return {
    revoke: candidate.revokeReferralCodeAction,
    deactivate: candidate.deactivateSharedSetAction,
  };
}

function form(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function referralForm(overrides: Readonly<Record<string, string>> = {}): FormData {
  return form({ referralCodeId, expectedCreatedAt, ...overrides });
}

function sharedSetForm(overrides: Readonly<Record<string, string>> = {}): FormData {
  return form({ sharedSetId, expectedUpdatedAt, ...overrides });
}

function request(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    environment: {
      APP_ENV: "production",
      APP_ORIGIN: "https://admin.example.test",
      RATE_LIMIT_SECRET: "growth-lifecycle-action-secret-at-least-32-characters",
    },
    identity: {
      clerkUserId: "clerk-growth-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: expectedCreatedAt,
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

type ReferralInput = Parameters<NonNullable<AdminTransaction["revokeReferralCode"]>>[0];
type SharedSetInput = Parameters<NonNullable<AdminTransaction["deactivateSharedSet"]>>[0];

function harness(options: Readonly<{ rateCount?: number; stale?: boolean }> = {}) {
  let referralInput: ReferralInput | null = null;
  let sharedSetInput: SharedSetInput | null = null;
  let audits: AdminAuditEvent[] = [];
  let authorityChecks = 0;
  let rateLimitCalls = 0;
  let transactions = 0;

  const transaction: AdminTransaction = {
    async assertActorAuthority(input) {
      authorityChecks += 1;
      if (
        input.actorUserId !== actorId ||
        input.clerkUserId !== "clerk-growth-admin" ||
        input.capability !== "growth:manage"
      ) {
        throw new Error("Persisted growth:manage capability is required");
      }
    },
    async revokeReferralCode(input) {
      if (options.stale) throw new Error("Stale referral code revocation");
      referralInput = input;
      return {
        status: "applied",
        referralCodeId: input.referralCodeId,
        createdAt: input.expectedCreatedAt.toISOString(),
        revokedAt: input.revokedAt.toISOString(),
      };
    },
    async deactivateSharedSet(input) {
      if (options.stale) throw new Error("Stale shared set deactivation");
      sharedSetInput = input;
      return {
        status: "applied",
        sharedSetId: input.sharedSetId,
        active: false,
        updatedAt: input.deactivatedAt.toISOString(),
        deactivatedAt: input.deactivatedAt.toISOString(),
      };
    },
    async appendAudit(event) {
      audits = [...audits, event];
    },
  } as AdminTransaction;

  const repository: AdminRepository = {
    rateLimitStore: {
      async increment() {
        rateLimitCalls += 1;
        return options.rateCount ?? 1;
      },
    },
    async transaction<Result>(work: (port: AdminTransaction) => Promise<Result>) {
      return work(transaction);
    },
    async retrySerializableTransaction<Result>(
      work: (port: AdminTransaction) => Promise<Result>,
    ) {
      transactions += 1;
      return work(transaction);
    },
  };

  return {
    repository,
    read: () => ({
      audits,
      authorityChecks,
      rateLimitCalls,
      referralInput,
      sharedSetInput,
      transactions,
    }),
  };
}

function install(store: ReturnType<typeof harness>, supplied: unknown = request()): void {
  mocks.getRequestIdentity.mockResolvedValue(supplied);
  mocks.getRequestRepositories.mockReturnValue({ adminRepository: store.repository });
}

async function expectResult(
  operation: Promise<never>,
  resource: "referral-codes" | "shared-sets",
  result: string,
): Promise<void> {
  await expect(operation).rejects.toThrow(`redirect:/admin/${resource}?result=${result}`);
}

describe("Task 8 growth lifecycle server actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
  });

  afterEach(() => vi.useRealTimers());

  it("binds exact referral and shared-set commands to fixed resources through real services", async () => {
    const store = harness();
    install(store);

    await expectResult(actions().revoke(referralForm()), "referral-codes", "saved");
    await expectResult(actions().deactivate(sharedSetForm()), "shared-sets", "saved");

    expect(store.read()).toMatchObject({
      authorityChecks: 2,
      rateLimitCalls: 2,
      transactions: 2,
      referralInput: {
        referralCodeId,
        expectedCreatedAt: new Date(expectedCreatedAt),
        revokedAt: now,
      },
      sharedSetInput: {
        sharedSetId,
        expectedUpdatedAt: new Date(expectedUpdatedAt),
        deactivatedAt: now,
      },
    });
    expect(store.read().audits).toEqual([
      expect.objectContaining({
        action: "growth.referral_code.revoked",
        resourceType: "referral_code",
        resourceId: referralCodeId,
        metadata: { status: "revoked" },
      }),
      expect.objectContaining({
        action: "growth.shared_set.deactivated",
        resourceType: "shared_research_set",
        resourceId: sharedSetId,
        metadata: { active: false },
      }),
    ]);
  });

  it.each([
    ["extra owner", "referral-codes", () => actions().revoke(referralForm({ ownerUserId: actorId }))],
    ["missing timestamp", "referral-codes", () => actions().revoke(form({ referralCodeId }))],
    ["non-v4 UUID", "referral-codes", () => actions().revoke(referralForm({ referralCodeId: "8c1a7000-0000-1000-8000-000000000002" }))],
    ["uppercase UUID", "shared-sets", () => actions().deactivate(sharedSetForm({ sharedSetId: sharedSetId.toUpperCase() }))],
    ["noncanonical timestamp", "shared-sets", () => actions().deactivate(sharedSetForm({ expectedUpdatedAt: "2026-08-28T21:00:00Z" }))],
    ["cross-resource authority", "shared-sets", () => actions().deactivate(sharedSetForm({ resource: "referral-codes" }))],
  ] as const)("rejects %s before identity or service access", async (_case, resource, invoke) => {
    await expectResult(invoke(), resource, "denied");
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.getRequestRepositories).not.toHaveBeenCalled();
  });

  it("rejects a coercible file timestamp before identity or service access", async () => {
    const data = form({ referralCodeId });
    data.set("expectedCreatedAt", new Blob([expectedCreatedAt]), "timestamp.txt");

    await expectResult(actions().revoke(data), "referral-codes", "denied");
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
  });

  it("rejects a wrong origin before limiter or transaction", async () => {
    const store = harness();
    install(store);
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://attacker.example" }));

    await expectResult(actions().revoke(referralForm()), "referral-codes", "denied");
    expect(store.read()).toMatchObject({ rateLimitCalls: 0, transactions: 0 });
  });

  it.each([
    ["non-admin", { principal: null }],
    ["missing capability", { principal: { ...request().principal, capabilities: [] } }],
    ["missing MFA", { identity: { ...request().identity, secondFactorCompleted: false } }],
    ["blocked", { principal: { ...request().principal, buyerStatus: "blocked" } }],
  ])("rejects %s before limiter or transaction", async (_case, override) => {
    const store = harness();
    install(store, { ...request(), ...override });

    await expectResult(actions().deactivate(sharedSetForm()), "shared-sets", "denied");
    expect(store.read()).toMatchObject({ rateLimitCalls: 0, transactions: 0 });
  });

  it("reports unavailable dependencies without service access", async () => {
    const store = harness();
    mocks.getRequestIdentity.mockResolvedValue(request());
    mocks.getRequestRepositories.mockReturnValue(null);

    await expectResult(actions().revoke(referralForm()), "referral-codes", "unavailable");
    expect(store.read()).toMatchObject({ rateLimitCalls: 0, transactions: 0 });
  });

  it("preserves stale and rate-limited redirect results", async () => {
    const staleStore = harness({ stale: true });
    install(staleStore);
    await expectResult(actions().revoke(referralForm()), "referral-codes", "stale");

    const limitedStore = harness({ rateCount: 31 });
    install(limitedStore);
    await expectResult(actions().deactivate(sharedSetForm()), "shared-sets", "rate-limited");
    expect(limitedStore.read()).toMatchObject({ rateLimitCalls: 1, transactions: 0 });
  });
});
