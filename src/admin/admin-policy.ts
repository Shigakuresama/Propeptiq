import { createHash } from "node:crypto";
import { z } from "zod";

import {
  isVerifiedIdentityAt,
  type VerifiedIdentity,
} from "@/auth/identity";
import {
  authorizeOperation,
  type AuthorizationOperation,
  type Principal,
} from "@/domain/authorization";
import { scanPublicCopy } from "@/domain/content-policy";

const positiveMoney = z.number().int().safe().positive();
const basisPoints = z.number().int().min(1).max(10_000);
const currency = z.string().regex(/^[A-Z]{3}$/);
const productIds = z.array(z.string().trim().min(1)).min(1).refine(
  (values) => new Set(values).size === values.length,
  "Product IDs must be unique",
);

const promotionBase = z.object({
  kind: z.enum(["discount", "bundle", "subscription", "loyalty", "cross_sell"]),
  amountMinor: positiveMoney.nullable(),
  basisPoints: basisPoints.nullable(),
  currency: currency.nullable(),
  configuration: z.unknown(),
}).strict();

export type PromotionActivationCandidate = z.input<typeof promotionBase>;

export function validatePromotionForActivation<T extends PromotionActivationCandidate>(
  candidate: T,
): T {
  const parsed = promotionBase.safeParse(candidate);
  if (!parsed.success) throw new Error("Promotion shape is invalid");
  const value = parsed.data;
  let valid = false;
  switch (value.kind) {
    case "discount": {
      const configValid = z.object({}).strict().safeParse(value.configuration).success;
      const percent =
        value.amountMinor === null &&
        value.currency === null &&
        value.basisPoints !== null;
      const fixed =
        value.amountMinor !== null &&
        value.currency !== null &&
        value.basisPoints === null;
      valid = configValid && (percent || fixed);
      break;
    }
    case "bundle":
      valid =
        value.amountMinor !== null &&
        value.basisPoints === null &&
        value.currency !== null &&
        z.object({ productIds: productIds.min(2) }).strict().safeParse(value.configuration)
          .success;
      break;
    case "subscription":
      valid =
        value.amountMinor === null &&
        value.basisPoints === null &&
        value.currency === null &&
        z
          .object({
            interval: z.enum(["month", "year"]),
            intervalCount: z.number().int().positive().max(12),
          })
          .strict()
          .safeParse(value.configuration).success;
      break;
    case "loyalty":
      valid =
        value.amountMinor === null &&
        value.basisPoints === null &&
        value.currency === null &&
        z
          .object({ pointsPerDollar: z.number().int().positive().max(100) })
          .strict()
          .safeParse(value.configuration).success;
      break;
    case "cross_sell":
      valid =
        value.amountMinor === null &&
        value.basisPoints === null &&
        value.currency === null &&
        z.object({ productIds }).strict().safeParse(value.configuration).success;
      break;
  }
  if (!valid) throw new Error("Promotion is not in its canonical shape");
  return candidate;
}

export function assertStaffCommandAccess(input: Readonly<{
  principal: Principal | null;
  identity: VerifiedIdentity | null;
  operation: AuthorizationOperation;
  now: Date;
}>): Principal {
  if (
    input.principal === null ||
    input.identity === null ||
    input.principal.clerkUserId !== input.identity.clerkUserId
  ) {
    throw new Error("Staff identity is unavailable or mismatched");
  }
  if (!isVerifiedIdentityAt(input.identity, input.now)) {
    throw new Error("A currently verified staff email is required");
  }
  if (
    !input.identity.mfaConfigured ||
    !input.identity.secondFactorCompleted ||
    !input.principal.mfaSatisfied
  ) {
    throw new Error("Staff MFA is required for this session");
  }
  const decision = authorizeOperation({
    principal: input.principal,
    operation: input.operation,
    resource: { relation: "capability_only" },
  });
  if (!decision.allowed) {
    throw new Error(`Staff authorization denied: ${decision.reasonCode}`);
  }
  return input.principal;
}

export function hashAttestationPolicyText(policyText: string): string {
  if (!policyText.trim()) throw new Error("Attestation policy text is required");
  return createHash("sha256").update(policyText, "utf8").digest("hex");
}

export function validateAttestationManifest(
  policyText: string,
  suppliedDigest: string | null | undefined,
): string {
  const digest = hashAttestationPolicyText(policyText);
  if (suppliedDigest !== undefined && suppliedDigest !== null && suppliedDigest !== digest) {
    throw new Error("Attestation policy digest does not match the supplied manifest");
  }
  return digest;
}

export type ProductPublicationFacts = Readonly<{
  productId: string;
  name: string;
  packageForm: string;
  materialIdentity: string;
  policyGroupActive: boolean;
  currentPriceMinor: number | null;
  releasedQuantity: number;
  hasAllowDestination: boolean;
  activeEvidenceIds: readonly string[];
  claims: readonly Readonly<{
    id: string;
    text: string;
    lotEvidenceIds: readonly string[];
  }>[];
}>;

export function validateProductPublication<T extends ProductPublicationFacts>(facts: T): T {
  if (!facts.productId.trim()) throw new Error("Product identifier is required");
  if (!facts.name.trim()) throw new Error("Product name is required");
  if (!facts.packageForm.trim()) throw new Error("Product package form is required");
  if (!facts.materialIdentity.trim()) throw new Error("Product material identity is required");
  if (!facts.policyGroupActive) throw new Error("An active policy group is required");
  if (
    facts.currentPriceMinor === null ||
    !Number.isSafeInteger(facts.currentPriceMinor) ||
    facts.currentPriceMinor <= 0
  ) {
    throw new Error("A current positive price is required");
  }
  if (!Number.isSafeInteger(facts.releasedQuantity) || facts.releasedQuantity <= 0) {
    throw new Error("Released positive stock is required");
  }
  if (!facts.hasAllowDestination) {
    throw new Error("At least one active allow destination is required");
  }
  const claimText = facts.claims.map((claim) => claim.text).join(". ");
  const copy = [facts.name, facts.packageForm, facts.materialIdentity, claimText]
    .filter(Boolean)
    .join(". ");
  const scan = scanPublicCopy(
    {
      text: copy,
      claims: facts.claims.map((claim) => ({
        ...claim,
        kind: "analytical" as const,
      })),
    },
    {
      version: "task5-publication-policy-v1",
      activeLotEvidenceIds: facts.activeEvidenceIds,
    },
  );
  if (!scan.publishable) {
    throw new Error(
      `Public content policy rejected publication: ${scan.violations
        .map((violation) => violation.code)
        .join(", ")}`,
    );
  }
  return facts;
}
