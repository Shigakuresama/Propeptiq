import "server-only";

import Stripe from "stripe";

import type { ServerEnv } from "@/config/env-schema";

export type ProviderEventAuthorityV1 = Readonly<{
  toJSON: () => never;
}>;

export type ProviderEventAuthorityProjectionV1 = Readonly<{
  provider: "stripe";
  expectedLivemode: boolean;
  providerScope: string;
}>;

export type StripeEventVerificationResultV1 =
  | Readonly<{ ok: true; rawEvent: unknown }>
  | Readonly<{ ok: false }>;

type PrivateAuthority = Readonly<{
  projection: ProviderEventAuthorityProjectionV1;
  verify: (
    exactPayload: Uint8Array,
    signature: string,
    receivedAtSeconds: number,
  ) => unknown;
}>;

const authorities = new WeakMap<object, PrivateAuthority>();
const DEFAULT_TOLERANCE_SECONDS = 300;

export function createProviderEventAuthorityV1(
  environment: ServerEnv,
): ProviderEventAuthorityV1 | null {
  if (
    environment.PAYMENTS_MODE === "disabled" ||
    environment.STRIPE_ACCOUNT_ID === undefined ||
    environment.STRIPE_WEBHOOK_SECRET === undefined
  ) {
    return null;
  }

  const projection = Object.freeze({
    provider: "stripe" as const,
    expectedLivemode: environment.PAYMENTS_MODE === "live",
    providerScope: `stripe:${environment.STRIPE_ACCOUNT_ID}`,
  });
  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET;
  const cryptoProvider = Stripe.createNodeCryptoProvider();
  const authority = Object.freeze({
    toJSON(): never {
      throw new Error("Provider event authority must never be serialized");
    },
  });
  authorities.set(authority, {
    projection,
    verify(exactPayload, signature, receivedAtSeconds) {
      return Stripe.webhooks.constructEvent(
        exactPayload,
        signature,
        webhookSecret,
        DEFAULT_TOLERANCE_SECONDS,
        cryptoProvider,
        receivedAtSeconds * 1_000,
      );
    },
  });
  return authority;
}

export function projectProviderEventAuthorityV1(
  authority: unknown,
): ProviderEventAuthorityProjectionV1 | null {
  if (typeof authority !== "object" || authority === null) return null;
  return authorities.get(authority)?.projection ?? null;
}

export function verifyStripeEventDeliveryV1(
  authority: ProviderEventAuthorityV1,
  input: Readonly<{
    exactPayload: Uint8Array;
    signature: unknown;
    receivedAtSeconds: number;
  }>,
): StripeEventVerificationResultV1 {
  const privateAuthority = authorities.get(authority);
  if (
    privateAuthority === undefined ||
    !(input.exactPayload instanceof Uint8Array) ||
    typeof input.signature !== "string" ||
    input.signature.length === 0 ||
    !Number.isSafeInteger(input.receivedAtSeconds) ||
    input.receivedAtSeconds < 0
  ) {
    return Object.freeze({ ok: false });
  }

  try {
    return Object.freeze({
      ok: true,
      rawEvent: privateAuthority.verify(
        input.exactPayload,
        input.signature,
        input.receivedAtSeconds,
      ),
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      return Object.freeze({ ok: false });
    }
    throw error;
  }
}
