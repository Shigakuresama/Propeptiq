import type { CheckoutRequest } from "@/domain/checkout";
import type { BuyerStatus } from "@/domain/eligibility";

export type Sha256Hasher = (
  canonicalValue: string,
) => string | Promise<string>;

export type KeyedUuidGenerator = (key: string) => string;

export type CheckoutIdentity = Readonly<{
  orderId: string;
  attemptId: string;
  providerIdempotencyKey: string;
  keyedUuid: KeyedUuidGenerator;
}>;

export type ReviewSnapshotHashInput = Readonly<{
  orderId: string;
  buyerUserId: string;
  buyerStatus: BuyerStatus;
  attestationVersionId: string;
  items: readonly Readonly<{ productId: string; quantity: number }>[];
  promotionIds: readonly string[];
  destination: CheckoutRequest["destination"];
  reviewPolicies: readonly Readonly<{ id: string; version: string }>[];
}>;

export function canonicalReviewPolicies(
  policies: ReviewSnapshotHashInput["reviewPolicies"],
): readonly Readonly<{ id: string; version: string }>[] {
  const byId = new Map<string, string>();
  for (const policy of policies) {
    const existing = byId.get(policy.id);
    if (existing !== undefined && existing !== policy.version) {
      throw new Error("One review policy cannot have conflicting versions");
    }
    byId.set(policy.id, policy.version);
  }
  return Object.freeze(
    [...byId.entries()]
      .map(([id, version]) => Object.freeze({ id, version }))
      .toSorted(
        (left, right) =>
          left.id.localeCompare(right.id) ||
          left.version.localeCompare(right.version),
      ),
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function assertCanonicalValue(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Canonical value at ${path} must be a safe integer`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new Error(`Canonical value at ${path} must be a dense array`);
      }
      assertCanonicalValue(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`Canonical value at ${path} must be a plain object`);
    }
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (nested === undefined) {
        throw new Error(`Canonical value at ${path}.${key} is undefined`);
      }
      assertCanonicalValue(nested, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`Unsupported canonical value at ${path}`);
}

export function canonicalJson(value: unknown): string {
  assertCanonicalValue(value, "value");
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function hashCanonicalEnvelope(
  envelope: unknown,
  sha256: Sha256Hasher,
): Promise<string> {
  const hash = await sha256(canonicalJson(envelope));
  if (!isSha256(hash)) {
    throw new Error("SHA-256 hasher returned a non-canonical digest");
  }
  return hash;
}

export function createCheckoutIdentity(input: Readonly<{
  buyerUserId: string;
  idempotencyKey: string;
  keyedUuid: KeyedUuidGenerator;
}>): CheckoutIdentity {
  if (!isCanonicalUuid(input.buyerUserId)) {
    throw new Error("buyerUserId must be a lowercase UUID");
  }
  if (!isCanonicalUuid(input.idempotencyKey)) {
    throw new Error("idempotencyKey must be a lowercase UUID");
  }
  const prefix = `${input.buyerUserId}:${input.idempotencyKey}`;
  const generate = (label: string): string => {
    if (typeof label !== "string" || label.trim() !== label || label === "") {
      throw new Error("Stable UUID label must be nonblank and canonical");
    }
    const generated = input.keyedUuid(`${prefix}:${label}`);
    if (!isCanonicalUuid(generated)) {
      throw new Error(`Keyed UUID generator returned an invalid UUID for ${label}`);
    }
    return generated;
  };
  const orderId = generate("order");
  const attemptId = generate("attempt");
  return Object.freeze({
    orderId,
    attemptId,
    providerIdempotencyKey: `checkout_attempt:${attemptId}`,
    keyedUuid: generate,
  });
}

export function hashCheckoutRequest(
  request: CheckoutRequest,
  sha256: Sha256Hasher,
): Promise<string> {
  return hashCanonicalEnvelope(
    { schemaVersion: 1, kind: "checkout_request", request },
    sha256,
  );
}

export function hashReviewSnapshot(
  input: ReviewSnapshotHashInput,
  sha256: Sha256Hasher,
): Promise<string> {
  return hashCanonicalEnvelope(
    {
      schemaVersion: 1,
      kind: "checkout_review",
      orderId: input.orderId,
      buyerUserId: input.buyerUserId,
      buyerStatus: input.buyerStatus,
      attestationVersionId: input.attestationVersionId,
      items: input.items.toSorted((left, right) =>
        left.productId.localeCompare(right.productId),
      ),
      promotionIds: input.promotionIds.toSorted(),
      destination: input.destination,
      reviewPolicies: canonicalReviewPolicies(input.reviewPolicies),
    },
    sha256,
  );
}
