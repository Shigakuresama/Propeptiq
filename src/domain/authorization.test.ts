import { describe, expect, it } from "vitest";

import {
  authorizeOperation,
  type Principal,
  type ResourceScope,
  type StrongAuthPolicy,
} from "@/domain/authorization";

const activePrincipal: Principal = {
  actorId: "synthetic-actor-1",
  clerkUserId: "synthetic-clerk-user-1",
  organizationId: null,
  clerkOrganizationId: null,
  status: "active",
  capabilities: ["application:read:self"],
  authentication: {
    authenticatedAt: new Date("2026-08-24T11:00:00.000Z"),
    mfaSatisfied: true,
    reverificationAt: new Date("2026-08-24T11:58:00.000Z"),
  },
};

const validStrongAuthPolicy: StrongAuthPolicy = {
  version: "synthetic-test-policy-v1",
  approvalId: "synthetic-approval-1",
  approvalVersion: "test-v1",
  effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
  expiresAt: new Date("2026-09-01T00:00:00.000Z"),
  integrityVerified: true,
  maximumAgeMs: 5 * 60 * 1000,
};
const syntheticStrongAuthMaximumAgeCeilingMs = 10 * 60 * 1000;

describe("authorizeOperation", () => {
  it("allows the exact self-read operation for its owning actor", () => {
    const result = authorizeOperation({
      principal: activePrincipal,
      operation: "application.read.self",
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      },
      now: new Date("2026-08-24T12:00:00.000Z"),
      strongAuthPolicy: null,
    });

    expect(result).toEqual({
      allowed: true,
      operation: "application.read.self",
      capability: "application:read:self",
      relation: "owner",
    });
  });

  it.each([
    {
      name: "an unauthenticated request",
      principal: null,
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      } as const,
      reasonCode: "unauthenticated",
    },
    {
      name: "an incomplete principal",
      principal: { ...activePrincipal, status: "incomplete" } as const,
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      } as const,
      reasonCode: "identity_incomplete",
    },
    {
      name: "a suspended principal",
      principal: { ...activePrincipal, status: "suspended" } as const,
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      } as const,
      reasonCode: "principal_suspended",
    },
    {
      name: "a missing exact capability",
      principal: { ...activePrincipal, capabilities: [] } as const,
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      } as const,
      reasonCode: "missing_capability",
    },
    {
      name: "a different resource owner",
      principal: activePrincipal,
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-other-actor",
      } as const,
      reasonCode: "owner_mismatch",
    },
    {
      name: "caller-selected cross-organization scope on a self operation",
      principal: activePrincipal,
      resource: {
        relation: "capability_only",
        subjectActorId: null,
        subjectOrganizationId: null,
        createdByActorId: null,
      } as const,
      reasonCode: "relation_not_permitted",
    },
  ] as const)("denies $name", ({ principal, resource, reasonCode }) => {
    const result = authorizeOperation({
      principal,
      operation: "application.read.self",
      resource,
      now: new Date("2026-08-24T12:00:00.000Z"),
      strongAuthPolicy: null,
    });

    expect(result).toEqual({
      allowed: false,
      operation: "application.read.self",
      reasonCode,
    });
  });

  it("enforces the operation-owned organization and staff relation matrix", () => {
    const organizationPrincipal: Principal = {
      ...activePrincipal,
      organizationId: "synthetic-org-1",
      clerkOrganizationId: "synthetic-clerk-org-1",
      capabilities: ["application:read:organization"],
    };

    expect(
      authorizeOperation({
        principal: organizationPrincipal,
        operation: "application.read.organization",
        resource: {
          relation: "organization",
          organizationId: "synthetic-org-1",
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: validStrongAuthPolicy,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      }),
    ).toMatchObject({ allowed: true, relation: "organization" });

    for (const [principal, reasonCode] of [
      [
        {
          ...organizationPrincipal,
          organizationId: null,
          clerkOrganizationId: null,
        },
        "organization_scope_required",
      ],
      [organizationPrincipal, "organization_mismatch"],
    ] as const) {
      const result = authorizeOperation({
        principal,
        operation: "application.read.organization",
        resource: {
          relation: "organization",
          organizationId: "synthetic-other-org",
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: null,
      });
      expect(result).toMatchObject({ allowed: false, reasonCode });
    }

    const reviewer: Principal = {
      ...activePrincipal,
      capabilities: ["application:review"],
    };
    expect(
      authorizeOperation({
        principal: reviewer,
        operation: "application.review",
        resource: {
          relation: "capability_only",
          subjectActorId: "synthetic-applicant-2",
          subjectOrganizationId: null,
          createdByActorId: null,
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: validStrongAuthPolicy,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      }),
    ).toMatchObject({ allowed: true, relation: "capability_only" });
    expect(
      authorizeOperation({
        principal: reviewer,
        operation: "application.review",
        resource: {
          relation: "owner",
          ownerActorId: "synthetic-actor-1",
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: null,
      }),
    ).toMatchObject({ allowed: false, reasonCode: "relation_not_permitted" });
  });

  it.each([
    ["application.read.self", "application:read:self", "owner"],
    [
      "application.read.organization",
      "application:read:organization",
      "organization",
    ],
    ["application.submit.self", "application:submit:self", "owner"],
    ["application.review", "application:review", "capability_only"],
    ["compliance.hold.place", "compliance:decide", "capability_only"],
    ["compliance.hold.release", "compliance:decide", "capability_only"],
    ["compliance.case.decide", "compliance:decide", "capability_only"],
    ["catalog.draft", "catalog:draft", "capability_only"],
    ["catalog.publish", "catalog:publish", "capability_only"],
    ["jurisdiction.manage", "jurisdiction:manage", "capability_only"],
    ["order.read.self", "order:read:self", "owner"],
    ["order.read.organization", "order:read:organization", "organization"],
    ["order.read.any", "order:read:any", "capability_only"],
    ["payment.reconcile", "payment:reconcile", "capability_only"],
    ["refund.request", "refund:request", "capability_only"],
    [
      "fulfillment.release.consume",
      "fulfillment:release:consume",
      "capability_only",
    ],
    [
      "membership.manage.organization",
      "membership:manage:organization",
      "organization",
    ],
    ["staff.manage", "staff:manage", "capability_only"],
    ["launch_gate.manage", "launch-gate:manage", "capability_only"],
  ] as const)(
    "uses the fixed policy for %s",
    (operation, capability, relation) => {
      const principal: Principal = {
        ...activePrincipal,
        organizationId: "synthetic-org-1",
        clerkOrganizationId: "synthetic-clerk-org-1",
        capabilities: [capability],
      };
      const resource: ResourceScope =
        relation === "owner"
          ? { relation, ownerActorId: "synthetic-actor-1" }
          : relation === "organization"
            ? { relation, organizationId: "synthetic-org-1" }
            : {
                relation,
                subjectActorId:
                  operation === "application.review"
                    ? "synthetic-other-actor"
                    : null,
                subjectOrganizationId: null,
                createdByActorId:
                  operation === "catalog.publish" ||
                  operation === "jurisdiction.manage"
                    ? "synthetic-other-actor"
                    : null,
              };

      const result = authorizeOperation({
        principal,
        operation,
        resource,
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: validStrongAuthPolicy,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      });

      expect(result).toEqual({
        allowed: true,
        operation,
        capability,
        relation,
      });
    },
  );

  it("denies any protected operation when MFA is incomplete", () => {
    const result = authorizeOperation({
      principal: {
        ...activePrincipal,
        authentication: {
          ...activePrincipal.authentication,
          mfaSatisfied: false,
        },
      },
      operation: "application.read.self",
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      },
      now: new Date("2026-08-24T12:00:00.000Z"),
      strongAuthPolicy: null,
    });

    expect(result).toMatchObject({ allowed: false, reasonCode: "mfa_required" });
  });

  it.each([
    [
      "application.review",
      "application:review",
      {
        relation: "capability_only",
        subjectActorId: "synthetic-other-actor",
        subjectOrganizationId: null,
        createdByActorId: null,
      },
    ],
    [
      "payment.reconcile",
      "payment:reconcile",
      {
        relation: "capability_only",
        subjectActorId: null,
        subjectOrganizationId: null,
        createdByActorId: null,
      },
    ],
  ] as const)("requires server step-up policy for %s", (operation, capability, resource) => {
    expect(
      authorizeOperation({
        principal: { ...activePrincipal, capabilities: [capability] },
        operation,
        resource,
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: null,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: "strong_auth_policy_unavailable",
    });
  });

  it("requires reverification from the active authenticated session", () => {
    expect(
      authorizeOperation({
        principal: {
          ...activePrincipal,
          capabilities: ["refund:request"],
          authentication: {
            authenticatedAt: new Date("2026-08-24T11:59:00.000Z"),
            mfaSatisfied: true,
            reverificationAt: new Date("2026-08-24T11:58:00.000Z"),
          },
        },
        operation: "refund.request",
        resource: {
          relation: "capability_only",
          subjectActorId: null,
          subjectOrganizationId: null,
          createdByActorId: null,
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: validStrongAuthPolicy,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: "reverification_invalid",
    });
  });

  it.each([
    {
      name: "missing server policy",
      policy: null,
      reverificationAt: new Date("2026-08-24T11:58:00.000Z"),
      reasonCode: "strong_auth_policy_unavailable",
    },
    {
      name: "unverified server policy",
      policy: { ...validStrongAuthPolicy, integrityVerified: false },
      reverificationAt: new Date("2026-08-24T11:58:00.000Z"),
      reasonCode: "strong_auth_policy_invalid",
    },
    {
      name: "maximum age above the platform ceiling",
      policy: {
        ...validStrongAuthPolicy,
        maximumAgeMs: syntheticStrongAuthMaximumAgeCeilingMs + 1,
      },
      reverificationAt: new Date("2026-08-24T11:58:00.000Z"),
      reasonCode: "strong_auth_policy_invalid",
    },
    {
      name: "expired server policy",
      policy: {
        ...validStrongAuthPolicy,
        expiresAt: new Date("2026-08-24T12:00:00.000Z"),
      },
      reverificationAt: new Date("2026-08-24T11:58:00.000Z"),
      reasonCode: "strong_auth_policy_invalid",
    },
    {
      name: "non-positive maximum age",
      policy: { ...validStrongAuthPolicy, maximumAgeMs: 0 },
      reverificationAt: new Date("2026-08-24T11:58:00.000Z"),
      reasonCode: "strong_auth_policy_invalid",
    },
    {
      name: "missing reverification",
      policy: validStrongAuthPolicy,
      reverificationAt: null,
      reasonCode: "reverification_required",
    },
    {
      name: "future reverification",
      policy: validStrongAuthPolicy,
      reverificationAt: new Date("2026-08-24T12:01:00.000Z"),
      reasonCode: "reverification_invalid",
    },
    {
      name: "expired reverification",
      policy: validStrongAuthPolicy,
      reverificationAt: new Date("2026-08-24T11:54:59.999Z"),
      reasonCode: "reverification_expired",
    },
  ] as const)(
    "fails closed for sensitive actions with $name",
    ({ policy, reverificationAt, reasonCode }) => {
      const result = authorizeOperation({
        principal: {
          ...activePrincipal,
          capabilities: ["compliance:decide"],
          authentication: {
            ...activePrincipal.authentication,
            reverificationAt,
          },
        },
        operation: "compliance.case.decide",
        resource: {
          relation: "capability_only",
          subjectActorId: null,
          subjectOrganizationId: null,
          createdByActorId: null,
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: policy,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      });

      expect(result).toMatchObject({ allowed: false, reasonCode });
    },
  );

  it("enforces applicant/reviewer and drafter/publisher separation", () => {
    const reviewer: Principal = {
      ...activePrincipal,
      capabilities: ["application:review"],
    };
    for (const [resource, reasonCode] of [
      [
        {
          relation: "capability_only",
          subjectActorId: "synthetic-actor-1",
          subjectOrganizationId: null,
          createdByActorId: null,
        },
        "separation_of_duties_violation",
      ],
      [
        {
          relation: "capability_only",
          subjectActorId: null,
          subjectOrganizationId: null,
          createdByActorId: null,
        },
        "separation_context_required",
      ],
    ] as const) {
      expect(
        authorizeOperation({
          principal: reviewer,
          operation: "application.review",
          resource,
          now: new Date("2026-08-24T12:00:00.000Z"),
          strongAuthPolicy: null,
        }),
      ).toMatchObject({ allowed: false, reasonCode });
    }

    const organizationReviewer: Principal = {
      ...reviewer,
      organizationId: "synthetic-org-1",
      clerkOrganizationId: "synthetic-clerk-org-1",
    };
    expect(
      authorizeOperation({
        principal: organizationReviewer,
        operation: "application.review",
        resource: {
          relation: "capability_only",
          subjectActorId: "synthetic-other-actor",
          subjectOrganizationId: "synthetic-org-1",
          createdByActorId: null,
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: null,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: "separation_of_duties_violation",
    });

    const publisher: Principal = {
      ...activePrincipal,
      capabilities: ["catalog:publish"],
    };
    expect(
      authorizeOperation({
        principal: publisher,
        operation: "catalog.publish",
        resource: {
          relation: "capability_only",
          subjectActorId: null,
          subjectOrganizationId: null,
          createdByActorId: "synthetic-actor-1",
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: validStrongAuthPolicy,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: "separation_of_duties_violation",
    });
  });

  it.each([
    {
      name: "string MFA projection",
      principal: {
        ...activePrincipal,
        authentication: {
          ...activePrincipal.authentication,
          mfaSatisfied: "false",
        },
      } as unknown as Principal,
    },
    {
      name: "scalar capability projection",
      principal: {
        ...activePrincipal,
        capabilities: "application:read:self",
      } as unknown as Principal,
    },
  ] as const)("denies a malformed $name", ({ principal }) => {
    expect(
      authorizeOperation({
        principal,
        operation: "application.read.self",
        resource: {
          relation: "owner",
          ownerActorId: "synthetic-actor-1",
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: null,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: "identity_incomplete",
    });
  });

  it("denies a sparse capability projection", () => {
    const sparseCapabilities = new Array<
      Principal["capabilities"][number]
    >(2);
    sparseCapabilities[1] = "application:read:self";

    const result = authorizeOperation({
      principal: {
        ...activePrincipal,
        capabilities: sparseCapabilities,
      },
      operation: "application.read.self",
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      },
      now: new Date("2026-08-24T12:00:00.000Z"),
      strongAuthPolicy: null,
    });

    expect(result).toEqual({
      allowed: false,
      operation: "application.read.self",
      reasonCode: "identity_incomplete",
    });
  });

  it("does not accept a string-valued policy integrity projection", () => {
    const malformedPolicy = {
      ...validStrongAuthPolicy,
      integrityVerified: "false",
    } as unknown as StrongAuthPolicy;

    expect(
      authorizeOperation({
        principal: {
          ...activePrincipal,
          capabilities: ["refund:request"],
        },
        operation: "refund.request",
        resource: {
          relation: "capability_only",
          subjectActorId: null,
          subjectOrganizationId: null,
          createdByActorId: null,
        },
        now: new Date("2026-08-24T12:00:00.000Z"),
        strongAuthPolicy: malformedPolicy,
        strongAuthMaximumAgeCeilingMs:
          syntheticStrongAuthMaximumAgeCeilingMs,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCode: "strong_auth_policy_invalid",
    });
  });

  it.each([
    {
      name: "unknown lifecycle status",
      principal: {
        ...activePrincipal,
        status: "deleted",
      } as unknown as Principal,
    },
    {
      name: "blank actor identity",
      principal: { ...activePrincipal, actorId: "   " },
    },
    {
      name: "blank provider identity",
      principal: { ...activePrincipal, clerkUserId: "   " },
    },
    {
      name: "invalid authentication time",
      principal: {
        ...activePrincipal,
        authentication: {
          ...activePrincipal.authentication,
          authenticatedAt: new Date(Number.NaN),
        },
      },
    },
  ] as const)("denies a malformed principal with $name", ({ principal }) => {
    const result = authorizeOperation({
      principal,
      operation: "application.read.self",
      resource: {
        relation: "owner",
        ownerActorId: principal.actorId,
      },
      now: new Date("2026-08-24T12:00:00.000Z"),
      strongAuthPolicy: null,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "identity_incomplete",
    });
  });

  it("returns frozen structured decisions", () => {
    const allowed = authorizeOperation({
      principal: activePrincipal,
      operation: "application.read.self",
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      },
      now: new Date("2026-08-24T12:00:00.000Z"),
      strongAuthPolicy: null,
    });
    const denied = authorizeOperation({
      principal: null,
      operation: "application.read.self",
      resource: {
        relation: "owner",
        ownerActorId: "synthetic-actor-1",
      },
      now: new Date("2026-08-24T12:00:00.000Z"),
      strongAuthPolicy: null,
    });

    expect(Object.isFrozen(allowed)).toBe(true);
    expect(Object.isFrozen(denied)).toBe(true);
  });

  it("returns a typed denial for a malformed top-level input", () => {
    expect(authorizeOperation(null as never)).toEqual({
      allowed: false,
      operation: "unknown",
      reasonCode: "identity_incomplete",
    });
  });
});
