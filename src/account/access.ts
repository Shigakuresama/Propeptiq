import { isVerifiedIdentityAt } from "@/auth/identity";
import type { RequestIdentity } from "@/auth/server";
import { authorizeOperation } from "@/domain/authorization";
import type { AuthorizationOperation } from "@/domain/authorization";

function selfAccessReason(
  request: RequestIdentity,
  operation: Extract<AuthorizationOperation, "account.read.self" | "order.read.self">,
): string | null {
  if (!request.identity) return "signed_out";
  if (!isVerifiedIdentityAt(request.identity, new Date())) return "email_unverified";
  if (!request.principal) return "account_unavailable";
  const decision = authorizeOperation({
    principal: request.principal,
    operation,
    resource: { relation: "owner", ownerActorId: request.principal.actorId },
  });
  return decision.allowed ? null : decision.reasonCode;
}

export function accountAccessReason(request: RequestIdentity): string | null {
  return selfAccessReason(request, "account.read.self");
}

export function orderAccessReason(request: RequestIdentity): string | null {
  return selfAccessReason(request, "order.read.self");
}
