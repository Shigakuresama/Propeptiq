import "server-only";

import type { VerifiedIdentity } from "@/auth/identity";
import { getRequestIdentity } from "@/auth/server";
import { createPostgresGrowthReadRepository } from "@/db/repositories/growth-read-repository";
import { withRuntimeTransaction } from "@/db/runtime";
import type { Principal } from "@/domain/authorization";
import { ownerGrowthReadAccess, type OwnerGrowthReadAccess } from "@/growth/owner-growth-access";
import {
  getPublicGrowthProjection,
  type PublicGrowthProjection,
  type PublicGrowthReadResult,
} from "@/growth/public-growth-server";
import type { OwnerGrowthSnapshot } from "@/growth/read-model";

type RequestOwner = Readonly<{
  identity: VerifiedIdentity | null;
  principal: Principal | null;
}>;

type Dependencies = Readonly<{
  loadProjection: () => Promise<PublicGrowthReadResult>;
  loadSnapshot: (ownerUserId: string) => Promise<OwnerGrowthSnapshot>;
}>;

type OwnerAccess = Extract<OwnerGrowthReadAccess, { allowed: true }>["access"];

type OwnerGrowthPolicyProjection = Readonly<{
  loyalty: PublicGrowthProjection["loyalty"];
  referral: PublicGrowthProjection["referral"];
  affiliate: PublicGrowthProjection["affiliate"];
  terms: Readonly<{
    rewards: Readonly<{ id: string; version: number }> | null;
    partner: Readonly<{ id: string; version: number }> | null;
  }>;
}>;

export type OwnerGrowthReadResult =
  | Readonly<{ status: "denied" }>
  | Readonly<{ status: "read_error" }>
  | Readonly<{ status: "inactive"; access: OwnerAccess; verifiedEmail: string }>
  | Readonly<{
      status: "empty" | "data";
      access: OwnerAccess;
      verifiedEmail: string;
      snapshot: OwnerGrowthSnapshot;
      projection: OwnerGrowthPolicyProjection;
    }>;

function hasOwnerData(snapshot: OwnerGrowthSnapshot): boolean {
  return (
    snapshot.rewards !== null ||
    snapshot.referrals.code !== null ||
    snapshot.referrals.counts.attributed !== 0 ||
    snapshot.referrals.conversions.totalCount !== 0 ||
    snapshot.referrals.rewardPointsTotal !== 0 ||
    snapshot.affiliate !== null
  );
}

function redactPolicyProjection(projection: PublicGrowthProjection): OwnerGrowthPolicyProjection {
  const termsRecord = (terms: PublicGrowthProjection["terms"]["rewards"]) =>
    terms === null ? null : Object.freeze({ id: terms.id, version: terms.version });
  return Object.freeze({
    loyalty: projection.loyalty,
    referral: projection.referral,
    affiliate: projection.affiliate,
    terms: Object.freeze({
      rewards: termsRecord(projection.terms.rewards),
      partner: termsRecord(projection.terms.partner),
    }),
  });
}

export function createOwnerGrowthReader(dependencies: Dependencies) {
  return async function readOwnerGrowth(
    request: RequestOwner,
    requestedOwnerUserId: string,
  ): Promise<OwnerGrowthReadResult> {
    const access = ownerGrowthReadAccess({
      identityClerkUserId: request.identity?.clerkUserId ?? null,
      principal: request.principal,
      requestedOwnerUserId,
    });
    const verifiedEmail = request.identity?.primaryEmail;
    if (!access.allowed || !verifiedEmail) {
      return Object.freeze({ status: "denied" });
    }
    try {
      const projection = await dependencies.loadProjection();
      if (projection.status === "read_error") {
        return Object.freeze({ status: "read_error" });
      }
      if (projection.status === "inactive") {
        return Object.freeze({
          status: "inactive",
          access: access.access,
          verifiedEmail,
        });
      }
      const snapshot = await dependencies.loadSnapshot(requestedOwnerUserId);
      return Object.freeze({
        status: hasOwnerData(snapshot) ? "data" : "empty",
        access: access.access,
        verifiedEmail,
        snapshot,
        projection: redactPolicyProjection(projection.projection),
      });
    } catch {
      return Object.freeze({ status: "read_error" });
    }
  };
}

export async function loadOwnerGrowthDashboard(): Promise<OwnerGrowthReadResult> {
  try {
    const request = await getRequestIdentity();
    const ownerUserId = request.principal?.actorId ?? "";
    const now = new Date();
    const repository = createPostgresGrowthReadRepository((work, options) =>
      withRuntimeTransaction(
        request.environment,
        work,
        { isolationLevel: options.isolationLevel },
      ),
    );
    return await createOwnerGrowthReader({
      loadProjection: getPublicGrowthProjection,
      loadSnapshot: (requestedOwnerUserId) => repository.readOwnerSnapshot({
        ownerUserId: requestedOwnerUserId,
        now: new Date(now),
      }),
    })(request, ownerUserId);
  } catch {
    return Object.freeze({ status: "read_error" });
  }
}
