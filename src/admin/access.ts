import { isVerifiedIdentityAt } from "@/auth/identity";
import type { RequestIdentity } from "@/auth/server";
import type { AdminReadResource } from "@/admin/admin-read";
import type { Capability } from "@/domain/authorization";
import { authorizeOperation, type AuthorizationOperation } from "@/domain/authorization";

export type GrowthAdminResourceSlug =
  | "loyalty-policies"
  | "referral-policies"
  | "affiliate-policies"
  | "referral-codes"
  | "referral-conversions"
  | "affiliate-applications"
  | "commissions"
  | "payouts"
  | "reward-adjustments"
  | "shared-sets";

export type AdminResourceAction =
  | "create-draft"
  | "activate"
  | "retire"
  | "revoke"
  | "decide"
  | "suspend"
  | "create-batch"
  | "record-paid"
  | "adjust"
  | "deactivate";

export type AdminResource = Readonly<{
  slug: AdminReadResource | GrowthAdminResourceSlug;
  label: string;
  description: string;
  capability: Capability;
  operation: AuthorizationOperation;
  actions?: readonly AdminResourceAction[];
}>;

export const adminResources: readonly AdminResource[] = Object.freeze([
  { slug: "products", label: "Products", description: "Publication prerequisites and lifecycle status.", capability: "catalog:publish", operation: "catalog.publish" },
  { slug: "prices", label: "Prices", description: "Immutable effective price history; no hard deletion.", capability: "catalog:publish", operation: "catalog.publish" },
  { slug: "policy-groups", label: "Policy groups", description: "Catalog policy grouping and active-state checks.", capability: "catalog:publish", operation: "catalog.publish" },
  { slug: "lots", label: "Lots", description: "Released stock evidence and analytical method metadata.", capability: "catalog:publish", operation: "catalog.publish" },
  { slug: "coas", label: "COA records", description: "Private manifest verification before public activation.", capability: "catalog:publish", operation: "catalog.publish" },
  { slug: "analytical-claims", label: "Analytical claims", description: "Same-product lot and public COA evidence binding.", capability: "catalog:publish", operation: "catalog.publish" },
  { slug: "attestations", label: "Attestations", description: "Immutable, server-hashed policy versions.", capability: "catalog:publish", operation: "catalog.publish" },
  { slug: "destination-rules", label: "Destination rules", description: "Atomic immediate version supersession.", capability: "destination:manage", operation: "destination.manage" },
  { slug: "promotions", label: "Promotions", description: "Canonical kind-specific activation.", capability: "promotion:manage", operation: "promotion.manage" },
  { slug: "buyers", label: "Buyers", description: "Status commands with current identity re-verification.", capability: "review:decide", operation: "review.decide" },
  { slug: "review-requests", label: "Review requests", description: "Pending-only immutable decisions.", capability: "review:decide", operation: "review.decide" },
  { slug: "orders", label: "Orders", description: "Redacted payment, refund, hold, release, and shipment authority with guarded hold clearing.", capability: "order:read:any", operation: "order.read.any" },
  { slug: "refunds", label: "Refund intents", description: "Verified-payment-bounded intent, submission/recovery, and signed-event readback.", capability: "refund:request", operation: "refund.request" },
  { slug: "shipments", label: "Shipments", description: "Preparation remains separate from guarded handoff, delivery, and exception transitions.", capability: "fulfillment:release:consume", operation: "fulfillment.release.consume" },
  { slug: "staff", label: "Staff capabilities", description: "Known capability grants and revocations.", capability: "staff:manage", operation: "staff.manage" },
  { slug: "audit", label: "Audit history", description: "Append-only redacted mutation records.", capability: "staff:manage", operation: "staff.manage" },
  { slug: "loyalty-policies", label: "Loyalty policies", description: "Versioned loyalty policy drafts and explicit lifecycle commands.", capability: "growth:manage", operation: "growth.manage", actions: ["create-draft", "activate", "retire"] },
  { slug: "referral-policies", label: "Referral policies", description: "Versioned customer referral policy drafts and explicit lifecycle commands.", capability: "growth:manage", operation: "growth.manage", actions: ["create-draft", "activate", "retire"] },
  { slug: "affiliate-policies", label: "Affiliate policies", description: "Versioned cash affiliate policy drafts and explicit lifecycle commands.", capability: "growth:manage", operation: "growth.manage", actions: ["create-draft", "activate", "retire"] },
  { slug: "referral-codes", label: "Referral codes", description: "Capability-scoped referral code lifecycle with revocation only.", capability: "growth:manage", operation: "growth.manage", actions: ["revoke"] },
  { slug: "referral-conversions", label: "Referral conversions", description: "Read-only redacted referral conversion records.", capability: "growth:manage", operation: "growth.manage", actions: [] },
  { slug: "affiliate-applications", label: "Affiliate applications", description: "Reviewed application decisions and active-affiliate suspension.", capability: "growth:manage", operation: "growth.manage", actions: ["decide", "suspend"] },
  { slug: "commissions", label: "Affiliate commissions", description: "Read-only redacted commission records.", capability: "growth:manage", operation: "growth.manage", actions: [] },
  { slug: "payouts", label: "Affiliate payouts", description: "Payout batch creation and external paid-state recording only.", capability: "affiliate:payout", operation: "affiliate.payout", actions: ["create-batch", "record-paid"] },
  { slug: "reward-adjustments", label: "Reward adjustments", description: "Bounded idempotent reward account adjustments.", capability: "growth:manage", operation: "growth.manage", actions: ["adjust"] },
  { slug: "shared-sets", label: "Shared sets", description: "Read-only shared-set records with soft deactivation.", capability: "growth:manage", operation: "growth.manage", actions: ["deactivate"] },
]);

export type AdminGate =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; code: "signed_out" | "email_unverified" | "identity_missing" | "blocked" | "mfa_not_configured" | "second_factor_missing" | "capability_missing" }>;

export function adminGate(request: RequestIdentity, resource?: AdminResource): AdminGate {
  if (!request.identity) return { allowed: false, code: "signed_out" };
  if (!isVerifiedIdentityAt(request.identity, new Date())) return { allowed: false, code: "email_unverified" };
  if (!request.principal) return { allowed: false, code: "identity_missing" };
  if (request.principal.buyerStatus === "blocked") return { allowed: false, code: "blocked" };
  if (!request.identity.mfaConfigured) return { allowed: false, code: "mfa_not_configured" };
  if (!request.identity.secondFactorCompleted || !request.principal.mfaSatisfied) return { allowed: false, code: "second_factor_missing" };
  if (resource) {
    const decision = authorizeOperation({
      principal: request.principal,
      operation: resource.operation,
      resource: { relation: "capability_only" },
    });
    if (!decision.allowed) return { allowed: false, code: "capability_missing" };
  } else if (request.principal.capabilities.length === 0) {
    return { allowed: false, code: "capability_missing" };
  }
  return { allowed: true };
}

export function resourceBySlug(slug: string): AdminResource | null {
  return adminResources.find((resource) => resource.slug === slug) ?? null;
}
