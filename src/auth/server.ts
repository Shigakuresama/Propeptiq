import "server-only";

import { cookies, headers } from "next/headers";
import { connection } from "next/server";

import type { AccountSummary, OrderDetail, OrderSummary } from "@/account/account-read";
import { loadOwnAccount, loadOwnOrder, listOwnOrders } from "@/account/account-read";
import type { AccountRepository } from "@/account/account-service";
import {
  requiredAdminReadCapability,
  type AdminReadResource,
  type AdminReadSnapshotFor,
} from "@/admin/admin-read";
import type { AdminRepository } from "@/admin/admin-service";
import type { AffiliateApplicationAdminRepository } from "@/admin/affiliate-application-admin-service";
import type { AffiliatePayoutAdminRepository } from "@/admin/affiliate-payout-admin-service";
import type { LocalTestDriver } from "@/auth/local-driver-types";
import {
  loadCheckoutSuccess,
  type CheckoutSuccessReadModel,
} from "@/commerce/checkout-success-read";
import type { ServerEnv } from "@/config/env-schema";
import type { Capability, Principal } from "@/domain/authorization";
import { createPostgresAccountRepository } from "@/db/repositories/account-repository";
import { createPostgresAdminReadRepository } from "@/db/repositories/admin-read-repository";
import { createPostgresAdminRepository } from "@/db/repositories/admin-repository";
import {
  projectPrincipalFromIdentity,
  type PrincipalQueryPort,
} from "@/db/repositories/principal-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";
import { withRuntimeTransaction, type RuntimeDatabaseClient } from "@/db/runtime";
import { readServerEnv } from "@/env";
import {
  createPostgresAffiliateAdminMutationTransaction,
  createPostgresAffiliatePayoutCreateTransaction,
  createPostgresAffiliatePayoutPaidTransaction,
} from "@/growth/affiliate-service";
import { createRuntimeStorageVerifier } from "@/security/blob-storage";
import type { StorageVerifier } from "@/security/storage";

import {
  isVerifiedIdentityAt,
  projectBetterAuthIdentity,
  resolveServerIdentity,
  type VerifiedIdentity,
} from "./identity";

export const LOCAL_ACTOR_COOKIE = "propeptiq_local_actor";

export type RequestIdentity = Readonly<{
  environment: ServerEnv;
  identity: VerifiedIdentity | null;
  principal: Principal | null;
  localDriver: LocalTestDriver | null;
}>;

export type RequestRepositories = Readonly<{
  accountRepository: AccountRepository;
  adminRepository: AdminRepository;
  affiliateApplicationAdminRepository: AffiliateApplicationAdminRepository;
  affiliatePayoutAdminRepository: AffiliatePayoutAdminRepository;
  storageVerifier: StorageVerifier;
  loadAccount: () => Promise<AccountSummary | null>;
  loadCurrentAttestation: () => Promise<Readonly<{ version: number; policyText: string }> | null>;
  listOrders: () => Promise<readonly OrderSummary[]>;
  loadOrder: (orderId: string) => Promise<OrderDetail | null>;
  loadCheckoutSuccess: (orderId: string) => Promise<CheckoutSuccessReadModel | null>;
  readAdminSnapshot: <Resource extends AdminReadResource>(
    resource: Resource,
  ) => Promise<AdminReadSnapshotFor<Resource>>;
}>;

function queryPort(client: RuntimeDatabaseClient): PrincipalQueryPort {
  return {
    query(sql, params = []) {
      return client.query(sql, params);
    },
  };
}

async function loadLocalDriver(environment: ServerEnv): Promise<LocalTestDriver> {
  if (
    environment.LOCAL_TEST_DRIVER !== "enabled" ||
    environment.APP_ENV !== "local" ||
    !environment.LOCAL_TEST_SECRET
  ) {
    throw new Error("Local test driver is unavailable");
  }
  const localDriverModule = await import("local-auth-driver");
  return localDriverModule.getLocalTestDriver();
}

async function loadBetterAuthIdentity(
  environment: ServerEnv,
): Promise<VerifiedIdentity | null> {
  const { getBetterAuthForEnvironment } = await import(
    "@/auth/better-auth-server"
  );
  const auth = getBetterAuthForEnvironment(environment);
  if (!auth) return null;
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;
  return projectBetterAuthIdentity(session.user);
}

export async function getRequestIdentity(): Promise<RequestIdentity> {
  await connection();
  const environment = readServerEnv();
  let localDriver: LocalTestDriver | null = null;
  const identity = await resolveServerIdentity(environment, {
    loadExternalIdentity: () => loadBetterAuthIdentity(environment),
    async loadLocalIdentity() {
      localDriver = await loadLocalDriver(environment);
      const signedActor = (await cookies()).get(LOCAL_ACTOR_COOKIE)?.value;
      return localDriver.resolveIdentity(signedActor, environment.LOCAL_TEST_SECRET!);
    },
  });

  if (environment.LOCAL_TEST_DRIVER === "enabled" && localDriver === null) {
    localDriver = await loadLocalDriver(environment);
  }
  let principal: Principal | null = null;
  if (identity && localDriver) {
    principal = localDriver.loadPrincipal(identity.clerkUserId);
  } else if (identity && environment.DATABASE_MODE !== "disabled") {
    const projectionTime = new Date();
    principal = await withRuntimeTransaction(environment, (client) =>
      projectPrincipalFromIdentity(queryPort(client), identity, projectionTime),
    );
  }
  return { environment, identity, principal, localDriver };
}

function databaseQueryPort(client: RuntimeDatabaseClient) {
  return {
    query<T extends object>(sql: string, params: readonly unknown[] = []) {
      return client.query<T>(sql, params);
    },
  };
}

export function getRequestRepositories(
  request: RequestIdentity,
): RequestRepositories | null {
  if (request.localDriver) {
    const driver = request.localDriver;
    const ownerId = request.principal?.actorId ?? null;
    const requireLocalCapability = (capability: Capability) => {
      const now = new Date();
      const principal = request.identity
        ? driver.loadPrincipal(request.identity.clerkUserId)
        : null;
      if (
        !request.identity ||
        !isVerifiedIdentityAt(request.identity, now) ||
        !request.identity.mfaConfigured ||
        !request.identity.secondFactorCompleted ||
        !principal ||
        principal.clerkUserId !== request.identity.clerkUserId ||
        principal.buyerStatus === "blocked" ||
        !principal.mfaSatisfied ||
        !principal.capabilities.includes(capability)
      ) {
        throw new Error(`Persisted ${capability} capability is required for this read`);
      }
    };
    return {
      accountRepository: driver.accountRepository,
      adminRepository: driver.adminRepository,
      affiliateApplicationAdminRepository: driver.growth.affiliateApplicationAdminRepository,
      affiliatePayoutAdminRepository: driver.growth.affiliatePayoutAdminRepository,
      storageVerifier: driver.storageVerifier,
      loadAccount: async () => (ownerId ? driver.loadAccount(ownerId) : null),
      loadCurrentAttestation: async () => driver.loadCurrentAttestation(),
      listOrders: async () => (ownerId ? driver.listOrders(ownerId) : []),
      loadOrder: async (orderId) => (ownerId ? driver.loadOrder(ownerId, orderId) : null),
      loadCheckoutSuccess: async (orderId) =>
        ownerId ? driver.commerce.loadSuccess(ownerId, orderId) : null,
      readAdminSnapshot: async (resource) => {
        requireLocalCapability(requiredAdminReadCapability(resource));
        return driver.readAdminSnapshot(resource);
      },
    };
  }
  if (request.environment.DATABASE_MODE === "disabled") return null;
  const ownerId = request.principal?.actorId ?? null;
  const requireOwner = () => {
    if (!ownerId) throw new Error("Owner identity is unavailable");
    return ownerId;
  };
  const run = <T>(
    work: (client: ReturnType<typeof databaseQueryPort>) => Promise<T>,
    options: Readonly<{ isolationLevel: "serializable" }>,
  ) =>
    withRuntimeTransaction(
      request.environment,
      (client) => work(databaseQueryPort(client)),
      options,
    );
  const rateLimitStore = {
    increment: (window: Parameters<ReturnType<typeof createPostgresRateLimitStore>["increment"]>[0]) =>
      withRuntimeTransaction(request.environment, (client) =>
        createPostgresRateLimitStore(databaseQueryPort(client)).increment(window),
      ),
  };
  const adminReadRepository = createPostgresAdminReadRepository(
    (work, options) =>
      withRuntimeTransaction(
        request.environment,
        (client) => work(client),
        { isolationLevel: options.isolationLevel },
      ),
  );
  const affiliateApplicationAdminRepository = Object.freeze({
    rateLimitStore,
    mutateInTransaction: createPostgresAffiliateAdminMutationTransaction({
      runSerializableTransaction: (work, options) =>
        withRuntimeTransaction(
          request.environment,
          (client) => work(databaseQueryPort(client)),
          { isolationLevel: options.isolationLevel },
        ),
    }),
  });
  const payoutTransactionRunner = {
    runSerializableTransaction: <Value>(
      work: (client: ReturnType<typeof databaseQueryPort>) => Promise<Value>,
      options: Readonly<{ isolationLevel: "serializable" }>,
    ) => withRuntimeTransaction(
      request.environment,
      (client) => work(databaseQueryPort(client)),
      { isolationLevel: options.isolationLevel },
    ),
  };
  const affiliatePayoutAdminRepository = Object.freeze({
    rateLimitStore,
    createInTransaction: createPostgresAffiliatePayoutCreateTransaction(
      payoutTransactionRunner,
    ),
    markPaidInTransaction: createPostgresAffiliatePayoutPaidTransaction(
      payoutTransactionRunner,
    ),
  });
  return {
    accountRepository: createPostgresAccountRepository(run),
    adminRepository: createPostgresAdminRepository(run, rateLimitStore),
    affiliateApplicationAdminRepository,
    affiliatePayoutAdminRepository,
    storageVerifier: createRuntimeStorageVerifier(request.environment),
    loadAccount: () =>
      withRuntimeTransaction(request.environment, (client) =>
        loadOwnAccount(databaseQueryPort(client), requireOwner()),
      ),
    loadCurrentAttestation: () =>
      withRuntimeTransaction(request.environment, async (client) => {
        const result = await client.query<{ version: number; policyText: string }>(
          `
            SELECT version, policy_text AS "policyText"
            FROM attestation_versions
            WHERE effective_at <= CURRENT_TIMESTAMP
              AND (superseded_at IS NULL OR superseded_at > CURRENT_TIMESTAMP)
            ORDER BY version DESC
          `,
        );
        return result.rows.length === 1 ? result.rows[0]! : null;
      }),
    listOrders: () =>
      withRuntimeTransaction(request.environment, (client) =>
        listOwnOrders(databaseQueryPort(client), requireOwner()),
      ),
    loadOrder: (orderId) =>
      withRuntimeTransaction(request.environment, (client) =>
        loadOwnOrder(databaseQueryPort(client), requireOwner(), orderId),
      ),
    loadCheckoutSuccess: (orderId) =>
      withRuntimeTransaction(request.environment, (client) =>
        loadCheckoutSuccess(databaseQueryPort(client), requireOwner(), orderId),
      ),
    readAdminSnapshot(resource) {
      if (!request.identity || !request.principal) {
        throw new Error("Verified staff identity is required for this read");
      }
      return adminReadRepository.readSnapshot({
        userId: request.principal.actorId,
        identity: request.identity,
        now: new Date(),
        resource,
      });
    },
  };
}

export async function loadTargetVerifiedIdentity(
  request: RequestIdentity,
  _clerkUserId: string,
  _referenceTime: Date,
): Promise<VerifiedIdentity | null> {
  if (request.localDriver) {
    return request.localDriver.loadIdentityByClerkId(_clerkUserId);
  }
  void _referenceTime;
  // Do not map an identity-provider role onto application staff authority.
  // The current Better Auth configuration does not expose server-verifiable MFA
  // evidence this application requires for staff target-identity operations.
  return null;
}
