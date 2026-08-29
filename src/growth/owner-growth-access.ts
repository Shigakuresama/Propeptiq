import { authorizeOperation, type Principal } from "@/domain/authorization";

export type OwnerGrowthReadAccess =
  | Readonly<{ allowed: true; access: "owner" | "read_only_owner" | "blocked_read_capable" }>
  | Readonly<{
      allowed: false;
      reason: "unauthenticated" | "identity_mismatch" | "owner_mismatch" | "access_denied";
    }>;

export function ownerGrowthReadAccess(input: Readonly<{
  identityClerkUserId: string | null;
  principal: Principal | null;
  requestedOwnerUserId: string;
}>): OwnerGrowthReadAccess {
  if (input.identityClerkUserId === null || input.principal === null) {
    return Object.freeze({ allowed: false, reason: "unauthenticated" });
  }
  if (input.principal.clerkUserId !== input.identityClerkUserId) {
    return Object.freeze({ allowed: false, reason: "identity_mismatch" });
  }
  const decision = authorizeOperation({
    principal: input.principal,
    operation: "account.read.self",
    resource: { relation: "owner", ownerActorId: input.requestedOwnerUserId },
  });
  if (!decision.allowed) {
    return Object.freeze({
      allowed: false,
      reason: decision.reasonCode === "owner_mismatch" ? "owner_mismatch" : "access_denied",
    });
  }
  return Object.freeze({
    allowed: true,
    access: input.principal.buyerStatus === "blocked"
      ? "blocked_read_capable"
      : input.principal.buyerStatus === "active"
        ? "owner"
        : "read_only_owner",
  });
}
