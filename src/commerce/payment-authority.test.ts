import { describe, expect, it } from "vitest";

import { hasExactCheckoutProviderArtifact } from "@/commerce/payment-authority";

const validHash = "a".repeat(64);

describe("checkout provider artifact authority", () => {
  it.each([1, 2] as const)(
    "accepts an exact SHA-256 artifact with canonical schema version %s",
    (providerRequestSchemaVersion) => {
      expect(
        hasExactCheckoutProviderArtifact({
          providerRequestHash: validHash,
          providerRequestSchemaVersion,
        }),
      ).toBe(true);
    },
  );

  it.each([
    0,
    3,
    -1,
    1.5,
    "1",
    "2",
    null,
    undefined,
    {},
  ])("rejects non-canonical checkout provider schema version %p", (version) => {
    expect(
      hasExactCheckoutProviderArtifact({
        providerRequestHash: validHash,
        providerRequestSchemaVersion: version,
      }),
    ).toBe(false);
  });

  it.each([
    "",
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
    null,
    undefined,
  ])("rejects invalid checkout provider hash %p for schema 2", (hash) => {
    expect(
      hasExactCheckoutProviderArtifact({
        providerRequestHash: hash,
        providerRequestSchemaVersion: 2,
      }),
    ).toBe(false);
  });
});
