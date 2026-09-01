import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerEnv } from "@/config/env-schema";
import type { RuntimeDatabaseClient } from "@/db/runtime";
import type { RequestIdentity } from "@/auth/server";

const mocks = vi.hoisted(() => ({
  withRuntimeTransaction: vi.fn(),
}));

vi.mock("@/db/runtime", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/runtime")>(),
  withRuntimeTransaction: mocks.withRuntimeTransaction,
}));

import { getRequestRepositories } from "./server";

const actorUserId = "8f000000-0000-4000-8000-000000000001";
const profileId = "8f000000-0000-4000-8000-000000000002";
const mutatedAt = new Date("2026-08-29T23:30:00.000Z");

function environment(): ServerEnv {
  return {
    APP_ENV: "production",
    APP_ORIGIN: "https://admin.example.test",
    CATALOG_DEMO_MODE: "disabled",
    RECONSTITUTION_CALCULATOR_MODE: "disabled",
    LOCAL_TEST_DRIVER: "disabled",
    AUTH_MODE: "live",
    DATABASE_MODE: "live",
    PAYMENTS_MODE: "disabled",
    STORAGE_MODE: "disabled",
    EMAIL_MODE: "disabled",
    COMMERCE_LIVE_CAPABILITY: "disabled",
    PAYMENTS_LIVE_CAPABILITY: "disabled",
    TAX_MODE: "disabled",
    SHIPPING_MODE: "disabled",
    FULFILLMENT_MODE: "disabled",
    RATE_LIMIT_SECRET: "task-8-server-composition-secret-32-characters",
    DATABASE_URL: "postgresql://test:test@db.example.test/test",
    OTEL_SERVICE_NAME: "propeptiq-labs",
  };
}

function request(overrides: Partial<RequestIdentity> = {}): RequestIdentity {
  return {
    environment: environment(),
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

describe("affiliate application request repository composition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the real PostgreSQL affiliate transaction through a serializable runtime transaction", async () => {
    const queries: string[] = [];
    const client: RuntimeDatabaseClient = {
      async query<Row extends object>(sql: string) {
        queries.push(sql);
        if (sql.includes("AS authorized")) return { rows: [{ authorized: true }] as Row[] };
        if (sql.includes("FROM affiliate_profiles")) {
          return { rows: [{ id: profileId, status: "pending", version: 1 }] as Row[] };
        }
        if (sql.includes("UPDATE affiliate_profiles")) {
          return {
            rows: [{
              id: profileId,
              status: "active",
              version: 2,
              updatedAt: mutatedAt.toISOString(),
            }] as Row[],
          };
        }
        if (sql.includes("INSERT INTO admin_audit")) {
          return { rows: [{ id: "8f000000-0000-4000-8000-000000000003" }] as Row[] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
    mocks.withRuntimeTransaction.mockImplementation(async (
      _environment: ServerEnv,
      work: (port: RuntimeDatabaseClient) => Promise<unknown>,
      options?: Readonly<{ isolationLevel?: string }>,
    ) => {
      expect(options).toEqual({ isolationLevel: "serializable" });
      return work(client);
    });

    const repositories = getRequestRepositories(request());
    await expect(repositories?.affiliateApplicationAdminRepository.mutateInTransaction({
      actorUserId,
      actorClerkUserId: "clerk-task8-affiliate-admin",
      requiredCapability: "growth:manage",
      profileId,
      expectedVersion: 1,
      targetStatus: "active",
      correlationId: "task-8-server-composition-correlation",
      mutatedAt,
    })).resolves.toEqual({
      profile: { id: profileId, status: "active", version: 2, updatedAt: mutatedAt.toISOString() },
    });
    expect(mocks.withRuntimeTransaction).toHaveBeenCalledTimes(1);
    expect(queries).toHaveLength(4);
  });

  it("composes the local growth driver's mutation repositories in local deterministic mode", async () => {
    // Local deterministic mode no longer hardcodes fail-closed stubs here: the
    // browser harness needs working affiliate admin mutations, so the driver's
    // own growth repositories are what must be composed. This asserts the
    // wiring, not the driver's behaviour, and that no database transaction is
    // opened in local mode.
    const growth = {
      affiliateApplicationAdminRepository: {
        rateLimitStore: { increment: async () => undefined },
        mutateInTransaction: async () => undefined,
      },
      affiliatePayoutAdminRepository: {
        rateLimitStore: { increment: async () => undefined },
        createInTransaction: async () => undefined,
        markPaidInTransaction: async () => undefined,
      },
    };
    const localDriver = {
      accountRepository: {},
      adminRepository: {},
      storageVerifier: {},
      storageWriter: {},
      growth,
      loadPrincipal: () => request().principal,
      loadAccount: () => null,
      loadCurrentAttestation: () => null,
      listOrders: () => [],
      loadOrder: () => null,
      readAdminSnapshot: () => ({ resource: "affiliate-applications", items: [], truncated: false }),
      commerce: { loadSuccess: () => null },
    } as unknown as NonNullable<RequestIdentity["localDriver"]>;

    const repositories = getRequestRepositories(request({ localDriver }));

    expect(repositories?.affiliateApplicationAdminRepository).toBe(
      growth.affiliateApplicationAdminRepository,
    );
    expect(repositories?.affiliatePayoutAdminRepository).toBe(
      growth.affiliatePayoutAdminRepository,
    );
    expect(mocks.withRuntimeTransaction).not.toHaveBeenCalled();
  });
});
