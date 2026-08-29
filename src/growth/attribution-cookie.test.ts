import { describe, expect, it } from "vitest";

import {
  ATTRIBUTION_COOKIE_NAME,
  createAttributionCookie,
  verifyAttributionCookie,
} from "./attribution-cookie";

const now = new Date("2026-08-28T12:00:00.000Z");
const expiresAt = new Date("2026-09-27T12:00:00.000Z");
const secret = "synthetic-attribution-secret-at-least-32-characters";
const code = "ref_AbCdEf0123456789";

const envelope = Object.freeze({
  schemaVersion: 1 as const,
  program: "customer_referral" as const,
  code,
  issuedAt: now.toISOString(),
  expiresAt: expiresAt.toISOString(),
});

function create(
  input: unknown = envelope,
  environment: "local" | "preview" | "production" = "production",
) {
  return createAttributionCookie(input, { environment, now, secret });
}

describe("signed referral attribution cookie", () => {
  it("issues the exact V1 privacy-minimal envelope with bounded hardened cookie options", () => {
    const result = create();

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      name: ATTRIBUTION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        maxAge: 30 * 24 * 60 * 60,
      },
    });

    const [, payload] = result!.value.split(".");
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"))).toEqual({
      schemaVersion: 1,
      program: "customer_referral",
      code,
      issuedAt: "2026-08-28T12:00:00.000Z",
      expiresAt: "2026-09-27T12:00:00.000Z",
    });
    expect(result!.value).not.toMatch(
      /email|clerk|address|product|order|payment|ip|user.?agent|device/i,
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result!.options)).toBe(true);
  });

  it("omits Secure only for the local environment", () => {
    expect(create(envelope, "local")?.options.secure).toBe(false);
    expect(create(envelope, "preview")?.options.secure).toBe(true);
    expect(create(envelope, "production")?.options.secure).toBe(true);
  });

  it("verifies an authentic token only in the environment that signed it", () => {
    const issued = create(envelope, "preview");
    expect(issued).not.toBeNull();

    const verified = verifyAttributionCookie(issued!.value, {
      environment: "preview",
      now,
      secret,
    });
    expect(verified).toEqual(envelope);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(
      verifyAttributionCookie(issued!.value, {
        environment: "production",
        now,
        secret,
      }),
    ).toBeNull();
  });

  it("rejects sparse, extra-key, inherited, and prototype-bearing payloads", () => {
    const sparse = { ...envelope } as Record<string, unknown>;
    delete sparse.expiresAt;
    expect(create(sparse)).toBeNull();
    expect(create({ ...envelope, email: "person@example.test" })).toBeNull();

    const inherited = Object.create(envelope) as unknown;
    expect(create(inherited)).toBeNull();

    const prototypeBearing = Object.assign(Object.create({ owner: "hidden" }), envelope);
    expect(create(prototypeBearing)).toBeNull();
  });

  it("rejects unknown programs, unbounded codes, invalid times, and secrets shorter than 32 characters", () => {
    expect(create({ ...envelope, program: "unknown" })).toBeNull();
    expect(create({ ...envelope, code: "ref_short" })).toBeNull();
    expect(create({ ...envelope, code: `ref_${"A".repeat(65)}` })).toBeNull();
    expect(create({ ...envelope, issuedAt: "not-a-date" })).toBeNull();
    expect(
      createAttributionCookie(envelope, {
        environment: "production",
        now,
        secret: "x".repeat(31),
      }),
    ).toBeNull();
  });

  it("rejects future-issued, expired, zero-length, and over-30-day envelopes", () => {
    expect(
      create({ ...envelope, issuedAt: "2026-08-28T12:00:00.001Z" }),
    ).toBeNull();
    expect(
      create({ ...envelope, expiresAt: "2026-08-28T12:00:00.000Z" }),
    ).toBeNull();
    expect(
      create({
        ...envelope,
        issuedAt: "2026-08-28T11:59:59.000Z",
        expiresAt: "2026-08-28T11:59:59.000Z",
      }),
    ).toBeNull();
    expect(
      create({ ...envelope, expiresAt: "2026-09-27T12:00:00.001Z" }),
    ).toBeNull();

    const issued = create();
    expect(issued).not.toBeNull();
    expect(
      verifyAttributionCookie(issued!.value, {
        environment: "production",
        now: expiresAt,
        secret,
      }),
    ).toBeNull();
  });

  it("rejects malformed, invalid-base64, oversized, truncated-signature, and tampered tokens", () => {
    const issued = create();
    expect(issued).not.toBeNull();
    const [version, payload, signature] = issued!.value.split(".");

    expect(verifyAttributionCookie("not-an-envelope", { environment: "production", now, secret })).toBeNull();
    expect(verifyAttributionCookie("v1.***.***", { environment: "production", now, secret })).toBeNull();
    expect(
      verifyAttributionCookie(`v1.${"A".repeat(2_049)}.AA`, {
        environment: "production",
        now,
        secret,
      }),
    ).toBeNull();
    expect(
      verifyAttributionCookie(`${version}.${payload}.${signature!.slice(1)}`, {
        environment: "production",
        now,
        secret,
      }),
    ).toBeNull();

    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    decoded.code = "ref_ZyXwVu9876543210";
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    expect(
      verifyAttributionCookie(`${version}.${tamperedPayload}.${signature}`, {
        environment: "production",
        now,
        secret,
      }),
    ).toBeNull();
  });
});
