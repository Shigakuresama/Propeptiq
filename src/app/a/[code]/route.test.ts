import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyAttributionCookie } from "@/growth/attribution-cookie";

const { createAffiliateLandingRuntime, lookup, readServerEnv } = vi.hoisted(() => ({
  createAffiliateLandingRuntime: vi.fn(),
  lookup: vi.fn(),
  readServerEnv: vi.fn(),
}));

vi.mock("@/growth/affiliate-landing-runtime", () => ({
  createAffiliateLandingRuntime,
}));
vi.mock("@/env", () => ({ readServerEnv }));

import { GET, dynamic } from "./route";

const now = new Date("2026-08-28T19:00:00.000Z");
const origin = "https://shop.propeptiq.example.test";
const hostileOrigin = "https://attacker.example";
const secret = "synthetic-affiliate-attribution-secret-at-least-32-characters";
const code = "aff_6BOpaqueAttribution9";

function request(path = `/a/${code}`) {
  return new Request(`${origin}${path}`, {
    headers: {
      "user-agent": "privacy-sensitive-user-agent",
      "x-forwarded-for": "203.0.113.8",
      "x-vercel-forwarded-for": "203.0.113.8",
    },
  });
}

function hostileRequest(path = `/a/${code}`) {
  return new Request(`${hostileOrigin}${path}`, {
    headers: {
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
      "x-vercel-forwarded-for": "203.0.113.8",
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

describe("GET /a/[code]", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    readServerEnv.mockReturnValue({ APP_ENV: "production", APP_ORIGIN: origin });
    lookup.mockResolvedValue({ program: "affiliate", code, attributionDays: 30 });
    createAffiliateLandingRuntime.mockResolvedValue({
      attributionSecret: secret,
      environment: "production",
      lookup,
    });
  });

  afterEach(() => vi.useRealTimers());

  it("redirects hostile host and query input only to configured APP_ORIGIN/catalog", async () => {
    const response = await GET(
      hostileRequest(`/a/${code}?return=${encodeURIComponent(hostileOrigin)}&redirect=/account`),
      context(),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/catalog`);
    expect(response.headers.get("location")).not.toContain("attacker.example");
    expect(response.headers.has("set-cookie")).toBe(true);
  });

  it("sets the existing signed 30-day affiliate V1 envelope without PII", async () => {
    const response = await GET(request(), context());

    expect(dynamic).toBe("force-dynamic");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith({ code, now, callerAddress: "203.0.113.8" });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly/u);
    expect(setCookie).toMatch(/SameSite=lax/ui);
    expect(setCookie).toMatch(/Path=\//u);
    expect(setCookie).toMatch(/Secure/u);
    expect(setCookie).toMatch(/Max-Age=2592000/u);
    expect(setCookie).not.toMatch(
      /privacy-sensitive|203\.0\.113\.8|buyer|partner|email|address|payment|device/ui,
    );

    const signed = cookieValue(response);
    expect(signed).not.toBeNull();
    expect(verifyAttributionCookie(signed!, {
      environment: "production",
      now,
      secret,
    })).toEqual({
      schemaVersion: 1,
      program: "affiliate",
      code,
      issuedAt: now.toISOString(),
      expiresAt: "2026-09-27T19:00:00.000Z",
    });
  });

  it("returns the same no-cookie redirect for invalid, inactive, suspended, rejected, overlap, and lookup failure", async () => {
    const responses: Response[] = [];
    for (const invalidCode of [
      "short",
      "aff_short",
      "ref_AbCdEf0123456789",
      `aff_${"A".repeat(65)}`,
      "aff_has.dot123456789",
    ]) {
      responses.push(await GET(hostileRequest(`/a/${invalidCode}`), context(invalidCode)));
    }

    for (const unavailable of [null, null, null, null]) {
      lookup.mockResolvedValueOnce(unavailable);
      responses.push(await GET(hostileRequest(), context()));
    }
    lookup.mockRejectedValueOnce(new Error("sensitive persistence detail"));
    responses.push(await GET(hostileRequest(), context()));
    lookup.mockResolvedValueOnce({ program: "customer_referral", code, attributionDays: 30 });
    responses.push(await GET(hostileRequest(), context()));

    for (const response of responses) {
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}/catalog`);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });

  it("fails closed before lookup when the platform caller address is unavailable", async () => {
    const response = await GET(new Request(`${origin}/a/${code}`), context());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/catalog`);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fails closed without trusted APP_ORIGIN and never reflects the request host", async () => {
    readServerEnv.mockImplementationOnce(() => {
      throw new Error("sensitive configuration detail");
    });
    const unavailable = await GET(hostileRequest(), context());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.has("location")).toBe(false);
    expect(unavailable.headers.has("set-cookie")).toBe(false);

    readServerEnv.mockReturnValueOnce({ APP_ENV: "local" });
    const missingOrigin = await GET(hostileRequest(), context());
    expect(missingOrigin.status).toBe(503);
    expect(missingOrigin.headers.has("location")).toBe(false);
    expect(missingOrigin.headers.has("set-cookie")).toBe(false);
  });
});
