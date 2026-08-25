import { describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import type { Principal } from "@/domain/authorization";

import {
  assertStaffCommandAccess,
  hashAttestationPolicyText,
  validateAttestationManifest,
  validateProductPublication,
  validatePromotionForActivation,
} from "./admin-policy";

const identity: VerifiedIdentity = {
  clerkUserId: "clerk-admin",
  primaryEmail: "admin@example.test",
  emailVerifiedAt: "2026-08-25T12:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
};
const principal: Principal = {
  actorId: "admin-user-id",
  clerkUserId: "clerk-admin",
  buyerStatus: null,
  capabilities: ["catalog:publish"],
  mfaSatisfied: true,
};

describe("Task 5 admin policy", () => {
  it.each([
    ["non-admin", { ...principal, capabilities: [] }, identity, /capability/i],
    ["MFA not configured", principal, { ...identity, mfaConfigured: false }, /MFA/i],
    ["second factor absent", principal, { ...identity, secondFactorCompleted: false }, /MFA/i],
    ["identity mismatch", principal, { ...identity, clerkUserId: "other" }, /identity/i],
    ["unverified email", principal, { ...identity, emailVerifiedAt: null }, /verified/i],
    ["malformed email", principal, { ...identity, primaryEmail: "not-an-email" }, /verified/i],
  ] as const)("denies %s before a catalog mutation", (_label, candidate, projected, error) => {
    expect(() =>
      assertStaffCommandAccess({
        principal: candidate,
        identity: projected,
        operation: "catalog.publish",
        now: new Date("2026-08-25T12:00:00.000Z"),
      }),
    ).toThrow(error);
  });

  it("allows one capable MFA session without a second actor", () => {
    expect(
      assertStaffCommandAccess({
        principal,
        identity,
        operation: "catalog.publish",
        now: new Date("2026-08-25T12:00:00.000Z"),
      }),
    ).toBe(principal);
  });

  it("computes a lowercase SHA-256 policy digest server-side and rejects a mismatched manifest", () => {
    const text = "Research-use policy version one.";
    const digest = hashAttestationPolicyText(text);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(validateAttestationManifest(text, digest)).toBe(digest);
    expect(() => validateAttestationManifest(text, "f".repeat(64))).toThrow(/digest/i);
    expect(() => hashAttestationPolicyText("   ")).toThrow(/policy/i);
  });

  it.each([
    {
      kind: "discount",
      amountMinor: null,
      basisPoints: 500,
      currency: null,
      configuration: {},
    },
    {
      kind: "discount",
      amountMinor: 500,
      basisPoints: null,
      currency: "USD",
      configuration: {},
    },
    {
      kind: "bundle",
      amountMinor: 3600,
      basisPoints: null,
      currency: "USD",
      configuration: { productIds: ["product-a", "product-b"] },
    },
    {
      kind: "subscription",
      amountMinor: null,
      basisPoints: null,
      currency: null,
      configuration: { interval: "month", intervalCount: 1 },
    },
    {
      kind: "loyalty",
      amountMinor: null,
      basisPoints: null,
      currency: null,
      configuration: { pointsPerDollar: 2 },
    },
    {
      kind: "cross_sell",
      amountMinor: null,
      basisPoints: null,
      currency: null,
      configuration: { productIds: ["product-b"] },
    },
  ] as const)("accepts canonical $kind promotion data", (candidate) => {
    expect(validatePromotionForActivation(candidate)).toEqual(candidate);
  });

  it.each([
    {
      kind: "discount",
      amountMinor: 500,
      basisPoints: 500,
      currency: "USD",
      configuration: {},
    },
    {
      kind: "bundle",
      amountMinor: null,
      basisPoints: null,
      currency: null,
      configuration: { productIds: ["product-a", "product-b"], amountMinor: 10 },
    },
    {
      kind: "cross_sell",
      amountMinor: 1,
      basisPoints: null,
      currency: "USD",
      configuration: { productIds: ["product-b"] },
    },
    {
      kind: "discount",
      amountMinor: null,
      basisPoints: 500,
      currency: null,
      configuration: {},
      browserProvider: "untrusted",
    },
  ] as const)("rejects noncanonical $kind promotion data", (candidate) => {
    expect(() => validatePromotionForActivation(candidate)).toThrow(/promotion/i);
  });

  it("requires all product activation prerequisites and safe public copy", () => {
    const facts = {
      productId: "product-a",
      name: "Reference standard A",
      packageForm: "Sealed analytical unit",
      materialIdentity: "Synthetic reference identity A",
      policyGroupActive: true,
      currentPriceMinor: 2400,
      releasedQuantity: 3,
      hasAllowDestination: true,
      activeEvidenceIds: ["coa-a"],
      claims: [
        {
          id: "claim-a",
          text: "HPLC analytical record coa",
          lotEvidenceIds: ["coa-a"],
        },
      ],
    } as const;
    expect(validateProductPublication(facts)).toBe(facts);
    expect(() =>
      validateProductPublication({ ...facts, currentPriceMinor: null }),
    ).toThrow(/price/i);
    expect(() =>
      validateProductPublication({ ...facts, releasedQuantity: 0 }),
    ).toThrow(/stock/i);
    expect(() =>
      validateProductPublication({ ...facts, hasAllowDestination: false }),
    ).toThrow(/destination/i);
    expect(() =>
      validateProductPublication({ ...facts, name: "Guaranteed treatment" }),
    ).toThrow(/content/i);
    expect(() =>
      validateProductPublication({ ...facts, activeEvidenceIds: [] }),
    ).toThrow(/content/i);
    for (const key of ["name", "packageForm", "materialIdentity"] as const) {
      expect(() => validateProductPublication({ ...facts, [key]: "   " })).toThrow(/required/i);
    }
  });
});
