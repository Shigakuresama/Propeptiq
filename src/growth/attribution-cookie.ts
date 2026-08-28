import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const ATTRIBUTION_COOKIE_NAME = "propeptiq_attribution_v1";

const MAX_ATTRIBUTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;
const MAX_TOKEN_CHARACTERS = 2_048;
const MAX_PAYLOAD_CHARACTERS = 1_024;
const ENVELOPE_KEYS = Object.freeze([
  "schemaVersion",
  "program",
  "code",
  "issuedAt",
  "expiresAt",
] as const);

export type AttributionProgram = "customer_referral" | "affiliate";
export type AttributionEnvironment = "local" | "preview" | "production";

export type AttributionEnvelopeV1 = Readonly<{
  schemaVersion: 1;
  program: AttributionProgram;
  code: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type AttributionCookie = Readonly<{
  name: typeof ATTRIBUTION_COOKIE_NAME;
  value: string;
  options: Readonly<{
    httpOnly: true;
    sameSite: "lax";
    path: "/";
    secure: boolean;
    maxAge: number;
  }>;
}>;

type AttributionCryptoContext = Readonly<{
  environment: AttributionEnvironment;
  now: Date;
  secret: string;
}>;

function isSupportedEnvironment(value: unknown): value is AttributionEnvironment {
  return value === "local" || value === "preview" || value === "production";
}

function hasValidContext(
  context: AttributionCryptoContext,
): boolean {
  return (
    isSupportedEnvironment(context.environment) &&
    typeof context.secret === "string" &&
    context.secret.length >= 32 &&
    context.now instanceof Date &&
    Number.isFinite(context.now.getTime())
  );
}

function isExactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isOpaqueCode(program: AttributionProgram, code: unknown): code is string {
  if (typeof code !== "string") return false;
  const prefix = program === "customer_referral" ? "ref_" : "aff_";
  return new RegExp(`^${prefix}[A-Za-z0-9_-]{16,64}$`, "u").test(code);
}

function parseEnvelope(
  input: unknown,
  now: Date,
): AttributionEnvelopeV1 | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  if (Object.getPrototypeOf(input) !== Object.prototype) return null;

  const record = input as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(record);
  if (
    ownKeys.length !== ENVELOPE_KEYS.length ||
    ownKeys.some((key) =>
      typeof key !== "string" ||
      !ENVELOPE_KEYS.includes(key as (typeof ENVELOPE_KEYS)[number])
    ) ||
    ENVELOPE_KEYS.some((key) => !Object.hasOwn(record, key))
  ) {
    return null;
  }

  if (
    record.schemaVersion !== 1 ||
    (record.program !== "customer_referral" && record.program !== "affiliate") ||
    !isOpaqueCode(record.program, record.code) ||
    !isExactIsoTimestamp(record.issuedAt) ||
    !isExactIsoTimestamp(record.expiresAt)
  ) {
    return null;
  }

  const issuedAt = new Date(record.issuedAt).getTime();
  const expiresAt = new Date(record.expiresAt).getTime();
  const currentTime = now.getTime();
  if (
    issuedAt > currentTime ||
    expiresAt <= currentTime ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_ATTRIBUTION_MILLISECONDS
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1,
    program: record.program,
    code: record.code,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  });
}

function signatureInput(
  environment: AttributionEnvironment,
  payload: string,
): string {
  return [
    "propeptiq-referral-attribution",
    "v1",
    environment,
    payload,
  ].join("\0");
}

function signPayload(
  payload: string,
  context: Pick<AttributionCryptoContext, "environment" | "secret">,
): Buffer {
  return createHmac("sha256", context.secret)
    .update(signatureInput(context.environment, payload), "utf8")
    .digest();
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

export function createAttributionCookie(
  input: unknown,
  context: AttributionCryptoContext,
): AttributionCookie | null {
  if (!hasValidContext(context)) return null;
  const parsed = parseEnvelope(input, context.now);
  if (!parsed) return null;

  const payload = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
  if (payload.length > MAX_PAYLOAD_CHARACTERS) return null;
  const signature = signPayload(payload, context).toString("base64url");
  const value = `v1.${payload}.${signature}`;
  if (value.length > MAX_TOKEN_CHARACTERS) return null;

  const maxAge = Math.floor(
    (new Date(parsed.expiresAt).getTime() - context.now.getTime()) / 1_000,
  );
  if (maxAge <= 0 || maxAge > MAX_ATTRIBUTION_MILLISECONDS / 1_000) {
    return null;
  }

  return Object.freeze({
    name: ATTRIBUTION_COOKIE_NAME,
    value,
    options: Object.freeze({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: context.environment !== "local",
      maxAge,
    }),
  });
}

export function verifyAttributionCookie(
  value: string,
  context: AttributionCryptoContext,
): AttributionEnvelopeV1 | null {
  if (
    !hasValidContext(context) ||
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TOKEN_CHARACTERS
  ) {
    return null;
  }

  const segments = value.split(".");
  if (segments.length !== 3 || segments[0] !== "v1") return null;
  const payload = segments[1]!;
  const encodedSignature = segments[2]!;
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_CHARACTERS) return null;

  const payloadBytes = decodeBase64Url(payload);
  const suppliedSignature = decodeBase64Url(encodedSignature);
  if (!payloadBytes || !suppliedSignature) return null;

  const expectedSignature = signPayload(payload, context);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(payloadBytes.toString("utf8")) as unknown;
    const parsed = parseEnvelope(decoded, context.now);
    if (!parsed) return null;
    if (
      Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url") !== payload
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
