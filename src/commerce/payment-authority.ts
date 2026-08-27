import { isSha256 } from "@/commerce/checkout-identity";
import type { NormalizedProviderEventV1 } from "@/commerce/provider-events";

export function hasExactProviderEventEnvelopeIdentity(
  databaseProviderEventId: unknown,
  normalized: NormalizedProviderEventV1,
): boolean {
  return (
    typeof databaseProviderEventId === "string" &&
    databaseProviderEventId === normalized.providerEventId
  );
}

export function hasExactCheckoutProviderArtifact(input: Readonly<{
  providerRequestHash: unknown;
  providerRequestSchemaVersion: unknown;
}>): boolean {
  return (
    typeof input.providerRequestHash === "string" &&
    isSha256(input.providerRequestHash) &&
    Number(input.providerRequestSchemaVersion) === 1
  );
}
