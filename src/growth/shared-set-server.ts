import "server-only";

import { getRequestIdentity } from "@/auth/server";
import { getPublicCatalog } from "@/catalog/server";
import type { ServerEnv } from "@/config/env-schema";
import { authorizeOperation } from "@/domain/authorization";
import { withRuntimeTransaction } from "@/db/runtime";
import { readServerEnv } from "@/env";

import {
  createPostgresSharedSetReadPort,
  createSharedSetService,
  type SharedSetReadTransactionRunner,
} from "./shared-set-service";

async function loadCurrentPublicProducts(productIds: readonly string[]) {
  const requested = new Set(productIds);
  const catalog = await getPublicCatalog();
  if (catalog.source !== "production") return Object.freeze([]);
  return Object.freeze(
    catalog.products
      .filter(({ id }) => requested.has(id))
      .map(({ id, slug, name, packageForm }) =>
        Object.freeze({ id, slug, name, packageForm }),
      ),
  );
}

function readService(environment: ServerEnv) {
  const runReadTransaction: SharedSetReadTransactionRunner = (work, options) =>
    withRuntimeTransaction(
      environment,
      work,
      { isolationLevel: options.isolationLevel },
    );
  return createSharedSetService({
    clock: () => new Date(),
    reads: createPostgresSharedSetReadPort({
      runReadTransaction,
      loadCurrentPublicProducts,
    }),
  });
}

export async function loadPublicSharedSet(code: string) {
  try {
    const environment = readServerEnv();
    if (environment.DATABASE_MODE === "disabled") {
      return Object.freeze({ status: "unavailable" as const });
    }
    return await readService(environment).resolvePublicSet(code);
  } catch {
    return Object.freeze({ status: "unavailable" as const });
  }
}

export async function loadOwnerSharedSetWorkspace() {
  try {
    const request = await getRequestIdentity();
    const principal = request.principal;
    if (
      request.identity === null ||
      principal === null ||
      principal.clerkUserId !== request.identity.clerkUserId ||
      principal.buyerStatus !== "active" ||
      request.environment.DATABASE_MODE === "disabled"
    ) {
      return Object.freeze({ status: "unavailable" as const });
    }
    const authorization = authorizeOperation({
      principal,
      operation: "referrals.read.self",
      resource: { relation: "owner", ownerActorId: principal.actorId },
    });
    if (!authorization.allowed) {
      return Object.freeze({ status: "unavailable" as const });
    }
    const [sets, catalog] = await Promise.all([
      readService(request.environment).listOwnerSets({
        authenticatedOwnerUserId: principal.actorId,
        requestedOwnerUserId: principal.actorId,
        buyerStatus: principal.buyerStatus,
        limit: 50,
        offset: 0,
      }),
      getPublicCatalog(),
    ]);
    if (catalog.source !== "production") {
      return Object.freeze({ status: "unavailable" as const });
    }
    return Object.freeze({
      status: "available" as const,
      products: Object.freeze(
        catalog.products.map(({ id, name, packageForm }) =>
          Object.freeze({ id, name, packageForm }),
        ),
      ),
      sets: sets.items,
    });
  } catch {
    return Object.freeze({ status: "unavailable" as const });
  }
}
