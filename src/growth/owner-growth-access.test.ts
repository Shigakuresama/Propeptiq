import { describe, expect, it } from "vitest";

import type { Principal } from "@/domain/authorization";

const ownerId = "73000000-0000-4000-8000-000000000001";
const otherOwnerId = "73000000-0000-4000-8000-000000000002";
const clerkUserId = "clerk_owner_growth";

function principal(buyerStatus: Principal["buyerStatus"]): Principal {
  return Object.freeze({
    actorId: ownerId,
    clerkUserId,
    buyerStatus,
    capabilities: Object.freeze([]),
    mfaSatisfied: false,
  });
}

describe("owner growth access", () => {
  it("denies a read without an authenticated principal", async () => {
    const { ownerGrowthReadAccess } = await import("./owner-growth-access");

    expect(ownerGrowthReadAccess({
      identityClerkUserId: null,
      principal: null,
      requestedOwnerUserId: ownerId,
    })).toEqual({ allowed: false, reason: "unauthenticated" });
  });

  it("denies a cross-owner read", async () => {
    const { ownerGrowthReadAccess } = await import("./owner-growth-access");

    expect(ownerGrowthReadAccess({
      identityClerkUserId: clerkUserId,
      principal: principal("active"),
      requestedOwnerUserId: otherOwnerId,
    })).toEqual({ allowed: false, reason: "owner_mismatch" });
  });

  it("keeps blocked owners read-capable for their own growth history", async () => {
    const { ownerGrowthReadAccess } = await import("./owner-growth-access");

    expect(ownerGrowthReadAccess({
      identityClerkUserId: clerkUserId,
      principal: principal("blocked"),
      requestedOwnerUserId: ownerId,
    })).toEqual({ allowed: true, access: "blocked_read_capable" });
  });

  it("keeps review owners read-only without treating them as active buyers", async () => {
    const { ownerGrowthReadAccess } = await import("./owner-growth-access");

    expect(ownerGrowthReadAccess({
      identityClerkUserId: clerkUserId,
      principal: principal("review"),
      requestedOwnerUserId: ownerId,
    })).toEqual({ allowed: true, access: "read_only_owner" });
  });
});
