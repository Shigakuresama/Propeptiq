import { isVerifiedIdentityAt } from "@/auth/identity";
import type { RequestIdentity } from "@/auth/server";
import type { AdminReadResource } from "@/admin/admin-read";
import type { Capability } from "@/domain/authorization";
import { authorizeOperation, type AuthorizationOperation } from "@/domain/authorization";

export type AdminResource = Readonly<{
  slug: AdminReadResource;
  label: string;
  description: string;
  capability: Capability;
  operation: AuthorizationOperation;
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
  { slug: "orders", label: "Orders", description: "Read-only administration in this step.", capability: "order:read:any", operation: "order.read.any" },
  { slug: "refunds", label: "Refund intents", description: "Verified-payment-bounded requested intents only.", capability: "refund:request", operation: "refund.request" },
  { slug: "shipments", label: "Shipments", description: "Pending metadata only for a current issued release.", capability: "fulfillment:release:consume", operation: "fulfillment.release.consume" },
  { slug: "staff", label: "Staff capabilities", description: "Known capability grants and revocations.", capability: "staff:manage", operation: "staff.manage" },
  { slug: "audit", label: "Audit history", description: "Append-only redacted mutation records.", capability: "staff:manage", operation: "staff.manage" },
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
