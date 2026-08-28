import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyAttributionCookie } from "@/growth/attribution-cookie";

const { createReferralLandingRuntime, lookup, readServerEnv } = vi.hoisted(() => ({
  createReferralLandingRuntime: vi.fn(),
  lookup: vi.fn(),
  readServerEnv: vi.fn(),
}));

vi.mock("@/growth/referral-landing-runtime", () => ({
  createReferralLandingRuntime,
}));
vi.mock("@/env", () => ({ readServerEnv }));

import { GET, dynamic } from "./route";

const now = new Date("2026-08-28T12:00:00.000Z");
const origin = "https://shop.propeptiq.example.test";
const hostileOrigin = "https://attacker.example";
const secret = "synthetic-route-attribution-secret-at-least-32-characters";
const code = "ref_AbCdEf0123456789";

function request(path = `/r/${code}`) {
  return new Request(`${origin}${path}`, {
    headers: {
      "user-agent": "privacy-sensitive-user-agent",
      "x-forwarded-for": "203.0.113.8",
    },
  });
}

function hostileRequest(path = `/r/${code}`) {
  return new Request(`${hostileOrigin}${path}`, {
    headers: {
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    },
  });
}

function context(value = code) {
  return { params: Promise.resolve({ code: value }) };
}

function cookieValue(response: Response): string | null {
  const header = response.headers.get("set-cookie");
  if (!header) return null;
  return header.match(/^[^=]+=([^;]+)/u)?.[1] ?? null;
}

describe("GET /r/[code]", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    readServerEnv.mockReturnValue({
      APP_ENV: "production",
      APP_ORIGIN: origin,
    });
    lookup.mockResolvedValue({
      program: "customer_referral",
      code,
      attributionDays: 30,
    });
    createReferralLandingRuntime.mockResolvedValue({
      attributionSecret: secret,
      environment: "production",
      lookup,
    });
  });

  afterEach(() => vi.useRealTimers());

  it("redirects a hostile request host only to the configured trusted catalog origin", async () => {
    const response = await GET(
      hostileRequest(`/r/${code}?return=${encodeURIComponent(hostileOrigin)}`),
      context(),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/catalog`);
    expect(response.headers.get("location")).not.toContain("attacker.example");
    expect(response.headers.has("set-cookie")).toBe(true);
  });

  it("performs one privacy-minimal lookup, sets an eligible signed cookie, and ignores redirect input", async () => {
    const response = await GET(
      request(`/r/${code}?return=https://evil.example/phish&redirect=/account`),
      context(),
    );

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/catalog`);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith({ code, now });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly/u);
    expect(setCookie).toMatch(/SameSite=lax/ui);
    expect(setCookie).toMatch(/Path=\//u);
    expect(setCookie).toMatch(/Secure/u);
    expect(setCookie).toMatch(/Max-Age=2592000/u);
    expect(setCookie).not.toMatch(/privacy-sensitive|203\.0\.113\.8|evil\.example|account/ui);

    const signed = cookieValue(response);
    expect(signed).not.toBeNull();
    expect(
      verifyAttributionCookie(signed!, {
        environment: "production",
        now,
        secret,
      }),
    ).toEqual({
      schemaVersion: 1,
      program: "customer_referral",
      code,
      issuedAt: now.toISOString(),
      expiresAt: "2026-09-27T12:00:00.000Z",
    });
  });

  it("does not resolve invalid or unbounded codes and returns the same non-enumerating redirect", async () => {
    for (const invalidCode of [
      "short",
      "ref_short",
      "aff_AbCdEf0123456789",
      `ref_${"A".repeat(65)}`,
      "ref_has.dot123456789",
    ]) {
      const response = await GET(
        hostileRequest(`/r/${invalidCode}`),
        context(invalidCode),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}/catalog`);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
    expect(createReferralLandingRuntime).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("collapses inactive, nonexistent, unavailable, and failed lookups to one no-cookie response", async () => {
    const responses: Response[] = [];

    lookup.mockResolvedValueOnce(null);
    responses.push(await GET(hostileRequest(), context()));

    createReferralLandingRuntime.mockResolvedValueOnce(null);
    responses.push(await GET(hostileRequest(), context()));

    lookup.mockRejectedValueOnce(new Error("sensitive repository detail"));
    responses.push(await GET(hostileRequest(), context()));

    lookup.mockResolvedValueOnce({
      program: "unknown",
      code,
      attributionDays: 30,
    });
    responses.push(await GET(hostileRequest(), context()));

    for (const response of responses) {
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}/catalog`);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });

  it("fails closed without a configured trusted origin and never reflects the request host", async () => {
    readServerEnv.mockImplementationOnce(() => {
      throw new Error("sensitive configuration detail");
    });
    const unavailable = await GET(hostileRequest(), context());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.has("location")).toBe(false);
    expect(unavailable.headers.has("set-cookie")).toBe(false);
    expect(createReferralLandingRuntime).not.toHaveBeenCalled();

    readServerEnv.mockReturnValueOnce({ APP_ENV: "local" });
    const missingOrigin = await GET(hostileRequest(), context());
    expect(missingOrigin.status).toBe(503);
    expect(missingOrigin.headers.has("location")).toBe(false);
    expect(missingOrigin.headers.has("set-cookie")).toBe(false);
    expect(createReferralLandingRuntime).not.toHaveBeenCalled();
  });
});
