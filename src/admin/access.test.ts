import { describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import type { RequestIdentity } from "@/auth/server";
import type { Capability, Principal } from "@/domain/authorization";

import { adminGate, resourceBySlug } from "./access";

const identity: VerifiedIdentity = Object.freeze({
  clerkUserId: "clerk-admin-task-8a",
  primaryEmail: "admin@example.test",
  emailVerifiedAt: "2026-08-28T12:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
});

function requestWith(
  capabilities: readonly Capability[],
  overrides: Partial<Principal> = {},
  identityOverrides: Partial<VerifiedIdentity> = {},
): RequestIdentity {
  return {
    environment: {} as RequestIdentity["environment"],
    identity: { ...identity, ...identityOverrides },
    principal: {
      actorId: "admin-task-8a",
      clerkUserId: identity.clerkUserId,
      buyerStatus: "active",
      capabilities,
      mfaSatisfied: true,
      ...overrides,
    },
    localDriver: null,
  };
}

describe("Task 8A growth administration access", () => {
  it.each([
    ["loyalty-policies", "growth.manage", "growth:manage", ["create-draft", "activate", "retire"]],
    ["referral-policies", "growth.manage", "growth:manage", ["create-draft", "activate", "retire"]],
    ["affiliate-policies", "growth.manage", "growth:manage", ["create-draft", "activate", "retire"]],
    ["referral-codes", "growth.manage", "growth:manage", ["revoke"]],
    ["referral-conversions", "growth.manage", "growth:manage", []],
    ["affiliate-applications", "growth.manage", "growth:manage", ["decide", "suspend"]],
    ["commissions", "growth.manage", "growth:manage", []],
    ["payouts", "affiliate.payout", "affiliate:payout", ["create-batch", "record-paid"]],
    ["reward-adjustments", "growth.manage", "growth:manage", ["adjust"]],
    ["shared-sets", "growth.manage", "growth:manage", ["deactivate"]],
  ] as const)(
    "binds %s to one exact operation, capability, and closed action set",
    (slug, operation, capability, actions) => {
      const resource = resourceBySlug(slug);

      expect(resource).toMatchObject({ slug, operation, capability });
      expect(resource?.actions).toEqual(actions);
    },
  );

  it("splits growth management from affiliate payout authority", () => {
    const growth = resourceBySlug("affiliate-applications");
    const payouts = resourceBySlug("payouts");
    expect(growth).not.toBeNull();
    expect(payouts).not.toBeNull();

    expect(adminGate(requestWith(["growth:manage"]), growth!)).toEqual({ allowed: true });
    expect(adminGate(requestWith(["growth:manage"]), payouts!)).toEqual({
      allowed: false,
      code: "capability_missing",
    });
    expect(adminGate(requestWith(["affiliate:payout"]), payouts!)).toEqual({ allowed: true });
    expect(adminGate(requestWith(["affiliate:payout"]), growth!)).toEqual({
      allowed: false,
      code: "capability_missing",
    });
  });

  it.each([
    ["non-admin", requestWith([]), "capability_missing"],
    ["blocked principal", requestWith(["growth:manage"], { buyerStatus: "blocked" }), "blocked"],
    ["MFA not configured", requestWith(["growth:manage"], {}, { mfaConfigured: false }), "mfa_not_configured"],
    ["second factor missing", requestWith(["growth:manage"], { mfaSatisfied: false }, { secondFactorCompleted: false }), "second_factor_missing"],
  ] as const)("denies a %s before a growth resource is usable", (_label, request, code) => {
    const resource = resourceBySlug("loyalty-policies");
    expect(resource).not.toBeNull();
    expect(adminGate(request, resource!)).toEqual({ allowed: false, code });
  });

  it("fails closed when an action is confused with another resource", () => {
    const payouts = resourceBySlug("payouts");
    const applications = resourceBySlug("affiliate-applications");

    expect(payouts?.actions?.includes("decide") ?? false).toBe(false);
    expect(applications?.actions?.includes("record-paid") ?? false).toBe(false);
  });
});
