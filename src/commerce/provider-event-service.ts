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

type VerifiedRegistrationV1 = Readonly<{
  result: ProviderEventIngressResultV1;
  providerEventId: string | null;
  provider: "stripe" | null;
}>;

async function verifyAndRegisterWithContextV1(
  dependencies: ProviderEventIngressDependenciesV1,
  input: Readonly<{ exactPayload: Uint8Array; signature: unknown }>,
): Promise<VerifiedRegistrationV1> {
  const authorityProjection = projectProviderEventAuthorityV1(
    dependencies.authority,
  );
  if (dependencies.authority === null || authorityProjection === null) {
    return Object.freeze({
      result: Object.freeze({ status: "unavailable" as const }),
      providerEventId: null,
      provider: null,
    });
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
    return Object.freeze({
      result: Object.freeze({ status: "invalid_delivery" as const }),
      providerEventId: null,
      provider: null,
    });
  }

  const normalization = normalizeStripeProviderEventV1(verification.rawEvent);
  if (normalization.status === "invalid") {
    return Object.freeze({
      result: Object.freeze({ status: "invalid_delivery" as const }),
      providerEventId: null,
      provider: null,
    });
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

  const result = await dependencies.repository.registerAndClaim({
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
  return Object.freeze({
    result,
    providerEventId: normalization.event.providerEventId,
    provider: authorityProjection.provider,
  });
}

export function createProviderEventIngressV1(
  dependencies: ProviderEventIngressDependenciesV1,
): ProviderEventIngressV1 {
  return Object.freeze({
    async verifyAndRegister(input) {
      return (await verifyAndRegisterWithContextV1(dependencies, input)).result;
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
      rewardsLifecycle?: Readonly<{
        reconcileProcessedProviderEvent: (input: Readonly<{
          provider: "stripe";
          providerEventId: string;
          now: Date;
        }>) => Promise<Readonly<{ status: "applied" | "idempotent" }>>;
      }>;
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
  return Object.freeze({
    async handleDelivery(input) {
      const registration = await verifyAndRegisterWithContextV1(dependencies, input);
      const registered = registration.result;
      const reconcile = async () => {
        if (
          dependencies.rewardsLifecycle === undefined ||
          registration.provider === null ||
          registration.providerEventId === null
        ) {
          return true;
        }
        try {
          await dependencies.rewardsLifecycle.reconcileProcessedProviderEvent({
            provider: registration.provider,
            providerEventId: registration.providerEventId,
            now: dependencies.clock(),
          });
          return true;
        } catch {
          return false;
        }
      };
      if (registered.status !== "claimed") {
        if (registered.status !== "processed") return registered;
        return (await reconcile())
          ? registered
          : Object.freeze({ status: "retryable_failure" as const });
      }
      const processingNow = dependencies.clock();
      try {
        const processed = await dependencies.repository.processClaim({
          claim: registered.claim,
          authority: dependencies.authority!,
          now: processingNow,
        });
        if (processed.status !== "processed") return processed;
        return (await reconcile())
          ? processed
          : Object.freeze({ status: "retryable_failure" as const });
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
