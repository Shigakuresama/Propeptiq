import { afterEach, describe, expect, it, vi } from "vitest";

import type { RequestIdentity, RequestRepositories } from "@/auth/server";

const authMocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  getRequestRepositories: vi.fn(),
}));

vi.mock("@/auth/server", () => authMocks);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveBuyerAccount } from "./actions";

const actorId = "10000000-0000-4000-8000-000000000001";

function repositories(): RequestRepositories {
  return {
    accountRepository: {
      async transaction(work) {
        return work({
          async upsertIdentity() {
            return { userId: actorId };
          },
          async getBuyerProfile() {
            return null;
          },
          async findCurrentAttestations() {
            return [{
              id: "10000000-0000-4000-8000-000000000002",
              version: 1,
            }];
          },
          async hasAttestationAcceptance() {
            return false;
          },
          async acceptAttestation() {},
          async saveBuyerProfile(profile) {
            return profile;
          },
          async appendAudit() {},
        });
      },
    },
    adminRepository: {
      rateLimitStore: { increment: async () => 1 },
      async transaction() {
        throw new Error("Admin transaction is not used by account updates");
      },
      async retrySerializableTransaction() {
        throw new Error("Admin transaction is not used by account updates");
      },
    },
    affiliateApplicationAdminRepository: {
      rateLimitStore: { increment: async () => 1 },
      async mutateInTransaction() {
        throw new Error("Affiliate application mutation is not used by account updates");
      },
    },
    affiliatePayoutAdminRepository: {
      rateLimitStore: { increment: async () => 1 },
      async createInTransaction() {
        throw new Error("Affiliate payout creation is not used by account updates");
      },
      async markPaidInTransaction() {
        throw new Error("Affiliate payout paid recording is not used by account updates");
      },
    },
    storageVerifier: { mode: "disabled", verify: async () => ({ exists: false, sha256: null }) },
    loadAccount: async () => null,
    loadCurrentAttestation: async () => ({ version: 1, policyText: "Research only." }),
    listOrders: async () => [],
    loadOrder: async () => null,
    loadCheckoutSuccess: async () => null,
    readAdminSnapshot: async (resource) => ({
      resource,
      limit: 100,
      truncated: false,
      items: [],
    }) as never,
  };
}

describe("saveBuyerAccount", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("captures the command time after a delayed verified identity projection", async () => {
    vi.useFakeTimers();
    const beforeProjection = new Date("2026-08-25T12:00:00.000Z");
    const projectedAt = new Date("2026-08-25T12:00:01.000Z");
    vi.setSystemTime(beforeProjection);
    authMocks.getRequestIdentity.mockImplementation(async () => {
      vi.setSystemTime(projectedAt);
      return {
        environment: {
          RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
        },
        identity: {
          clerkUserId: "clerk-delayed-customer",
          primaryEmail: "customer@example.test",
          emailVerifiedAt: projectedAt.toISOString(),
          mfaConfigured: false,
          secondFactorCompleted: false,
        },
        principal: {
          actorId,
          clerkUserId: "clerk-delayed-customer",
          buyerStatus: null,
          capabilities: [],
          mfaSatisfied: false,
        },
        localDriver: null,
      } as unknown as RequestIdentity;
    });
    authMocks.getRequestRepositories.mockReturnValue(repositories());
    const form = new FormData();
    form.set("ageConfirmed21Plus", "yes");
    form.set("researchPurpose", "analytical");
    form.set("acceptCurrentAttestation", "yes");
    form.set("organizationName", "");

    await expect(
      saveBuyerAccount(
        { state: "idle", code: "idle", message: "" },
        form,
      ),
    ).resolves.toMatchObject({ state: "success", code: "saved" });
  });
});
