import "server-only";

import { isCanonicalUuid, isSha256 } from "@/commerce/checkout-identity";
import { normalizeStripeProviderEventV1 } from "@/commerce/provider-events";
import {
  projectProviderEventAuthorityV1,
  verifyStripeEventDeliveryV1,
  type ProviderEventAuthorityV1,
} from "@/commerce/stripe-webhook-verifier";
import type {
  ProviderEventRepository,
  RegisterProviderEventResultV1,
} from "@/db/repositories/provider-event-repository";

export type ProviderEventIngressResultV1 =
  | RegisterProviderEventResultV1
  | Readonly<{ status: "invalid_delivery" | "unavailable" }>;

export type ProviderEventIngressV1 = Readonly<{
  verifyAndRegister: (input: Readonly<{
    exactPayload: Uint8Array;
    signature: unknown;
  }>) => Promise<ProviderEventIngressResultV1>;
}>;

type ProviderEventIngressDependenciesV1 = Readonly<{
  authority: ProviderEventAuthorityV1 | null;
  repository: Pick<ProviderEventRepository, "registerAndClaim">;
  sha256Bytes: (exactPayload: Uint8Array) => Promise<string>;
  clock: () => Date;
  uuid: () => string;
  leaseToken: () => string;
}>;

const LEASE_MILLISECONDS = 60_000;

export function createProviderEventIngressV1(
  dependencies: ProviderEventIngressDependenciesV1,
): ProviderEventIngressV1 {
  return Object.freeze({
    async verifyAndRegister(input) {
      const authorityProjection = projectProviderEventAuthorityV1(
        dependencies.authority,
      );
      if (dependencies.authority === null || authorityProjection === null) {
        return Object.freeze({ status: "unavailable" });
      }

      const now = dependencies.clock();
      if (!Number.isFinite(now.getTime())) {
        throw new Error("Provider event clock returned an invalid instant");
      }
      const verification = verifyStripeEventDeliveryV1(dependencies.authority, {
        exactPayload: input.exactPayload,
        signature: input.signature,
        receivedAtSeconds: Math.floor(now.getTime() / 1_000),
      });
      if (!verification.ok) {
        return Object.freeze({ status: "invalid_delivery" });
      }

      const normalization = normalizeStripeProviderEventV1(
        verification.rawEvent,
      );
      if (normalization.status === "invalid") {
        return Object.freeze({ status: "invalid_delivery" });
      }

      const payloadHash = await dependencies.sha256Bytes(input.exactPayload);
      const databaseEventId = dependencies.uuid();
      const conflictAuditId = dependencies.uuid();
      const leaseToken = dependencies.leaseToken();
      if (
        !isSha256(payloadHash) ||
        !isCanonicalUuid(databaseEventId) ||
        !isCanonicalUuid(conflictAuditId)
      ) {
        throw new Error("Provider event technical identity is invalid");
      }

      return dependencies.repository.registerAndClaim({
        provider: authorityProjection.provider,
        databaseEventId,
        conflictAuditId,
        payloadHash,
        normalization,
        receivedAt: now,
        claimAt: now,
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
      });
    },
  });
}

export function createProviderEventServiceV1(
  dependencies: Omit<ProviderEventIngressDependenciesV1, "repository"> &
    Readonly<{
      repository: Pick<
        ProviderEventRepository,
        "registerAndClaim" | "processClaim" | "markClaimFailed"
      >;
    }>,
): Readonly<{
  handleDelivery: (input: Readonly<{
    exactPayload: Uint8Array;
    signature: unknown;
  }>) => Promise<
    | Exclude<ProviderEventIngressResultV1, Readonly<{ status: "claimed" }>>
    | Readonly<{
        status:
          | "processed"
          | "deferred"
          | "conflict"
          | "lease_lost"
          | "retryable_failure";
      }>
  >;
}> {
  const ingress = createProviderEventIngressV1(dependencies);
  return Object.freeze({
    async handleDelivery(input) {
      const registered = await ingress.verifyAndRegister(input);
      if (registered.status !== "claimed") return registered;
      const processingNow = dependencies.clock();
      try {
        return await dependencies.repository.processClaim({
          claim: registered.claim,
          authority: dependencies.authority!,
          now: processingNow,
        });
      } catch {
        await dependencies.repository.markClaimFailed(registered.claim, {
          now: processingNow,
          reason: "provider_event_processing_failed",
        });
        return Object.freeze({ status: "retryable_failure" });
      }
    },
  });
}
