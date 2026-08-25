import { describe, expect, it } from "vitest";

import {
  authorizeOperation,
  type AuthorizationOperation,
  type Capability,
  type Principal,
} from "@/domain/authorization";

const buyer: Principal = {
  actorId: "actor-1",
  clerkUserId: "clerk-user-1",
  buyerStatus: "active",
  capabilities: [],
  mfaSatisfied: false,
};

function ownerResource(ownerActorId = "actor-1") {
  return { relation: "owner" as const, ownerActorId };
}

const staffCases = [
  ["review.decide", "review:decide"],
  ["catalog.publish", "catalog:publish"],
  ["destination.manage", "destination:manage"],
  ["promotion.manage", "promotion:manage"],
  ["order.read.any", "order:read:any"],
  ["payment.reconcile", "payment:reconcile"],
  ["refund.request", "refund:request"],
  ["fulfillment.release.consume", "fulfillment:release:consume"],
  ["staff.manage", "staff:manage"],
] as const satisfies readonly (readonly [AuthorizationOperation, Capability])[];

describe("authorizeOperation", () => {
  it.each([
    "account.read.self",
    "account.update.self",
    "checkout.request",
    "order.read.self",
  ] as const)(
    "allows authenticated buyers to perform %s on their own resource without MFA",
    (operation) => {
      expect(
        authorizeOperation({
          principal: buyer,
          operation,
          resource: ownerResource(),
        }),
      ).toEqual({
        allowed: true,
        operation,
        capability: null,
        relation: "owner",
      });
    },
  );

  it("allows a buyer in review to access own resources while eligibility stays separate", () => {
    expect(
      authorizeOperation({
        principal: { ...buyer, buyerStatus: "review" },
        operation: "checkout.request",
        resource: ownerResource(),
      }),
    ).toMatchObject({ allowed: true });
  });

  it.each(staffCases)(
    "requires the matching capability and MFA for %s",
    (operation, capability) => {
      const resource = { relation: "capability_only" as const };
      const capable = { ...buyer, capabilities: [capability] };

      expect(
        authorizeOperation({
          principal: capable,
          operation,
          resource,
        }),
      ).toEqual({ allowed: false, operation, reasonCode: "mfa_required" });

      expect(
        authorizeOperation({
          principal: { ...capable, mfaSatisfied: true },
          operation,
          resource,
        }),
      ).toEqual({
        allowed: true,
        operation,
        capability,
        relation: "capability_only",
      });

      expect(
        authorizeOperation({
          principal: { ...buyer, mfaSatisfied: true },
          operation,
          resource,
        }),
      ).toEqual({
        allowed: false,
        operation,
        reasonCode: "missing_capability",
      });
    },
  );

  it("allows one MFA-authenticated administrator to publish its own prepared record", () => {
    expect(
      authorizeOperation({
        principal: {
          ...buyer,
          capabilities: ["catalog:publish"],
          mfaSatisfied: true,
        },
        operation: "catalog.publish",
        resource: { relation: "capability_only" },
      }),
    ).toEqual({
      allowed: true,
      operation: "catalog.publish",
      capability: "catalog:publish",
      relation: "capability_only",
    });
  });

  it("denies unauthenticated, blocked, malformed, and owner-mismatched requests", () => {
    expect(
      authorizeOperation({
        principal: null,
        operation: "order.read.self",
        resource: ownerResource(),
      }),
    ).toEqual({
      allowed: false,
      operation: "order.read.self",
      reasonCode: "unauthenticated",
    });

    expect(
      authorizeOperation({
        principal: { ...buyer, buyerStatus: "blocked" },
        operation: "account.read.self",
        resource: ownerResource(),
      }),
    ).toEqual({
      allowed: false,
      operation: "account.read.self",
      reasonCode: "principal_blocked",
    });

    expect(
      authorizeOperation({
        principal: buyer,
        operation: "order.read.self",
        resource: ownerResource("actor-2"),
      }),
    ).toEqual({
      allowed: false,
      operation: "order.read.self",
      reasonCode: "owner_mismatch",
    });

    expect(authorizeOperation(null as never)).toEqual({
      allowed: false,
      operation: "unknown",
      reasonCode: "identity_incomplete",
    });
  });

  it("rejects legacy organization, application, membership, and launch operations", () => {
    for (const operation of [
      "application.review",
      "order.read.organization",
      "membership.manage.organization",
      "launch_gate.manage",
    ]) {
      expect(
        authorizeOperation({
          principal: { ...buyer, mfaSatisfied: true },
          operation,
          resource: { relation: "capability_only" },
        } as never),
      ).toEqual({
        allowed: false,
        operation: "unknown",
        reasonCode: "operation_policy_missing",
      });
    }
  });

  it("fails closed for malformed principal and resource projections", () => {
    expect(
      authorizeOperation({
        principal: { ...buyer, mfaSatisfied: "false" } as never,
        operation: "account.read.self",
        resource: ownerResource(),
      }),
    ).toMatchObject({ allowed: false, reasonCode: "identity_incomplete" });

    expect(
      authorizeOperation({
        principal: buyer,
        operation: "account.read.self",
        resource: { relation: "organization", organizationId: "org-1" },
      } as never),
    ).toMatchObject({ allowed: false, reasonCode: "relation_not_permitted" });
  });

  it("returns frozen structured decisions", () => {
    const allowed = authorizeOperation({
      principal: buyer,
      operation: "account.read.self",
      resource: ownerResource(),
    });
    const denied = authorizeOperation({
      principal: null,
      operation: "account.read.self",
      resource: ownerResource(),
    });

    expect(Object.isFrozen(allowed)).toBe(true);
    expect(Object.isFrozen(denied)).toBe(true);
  });
});
