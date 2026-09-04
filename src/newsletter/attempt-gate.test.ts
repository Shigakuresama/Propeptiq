import { describe, expect, it, vi } from "vitest";

import {
  createNewsletterAttemptGate,
  type NewsletterAttemptGateSession,
} from "@/newsletter/attempt-gate";

const rateLimitSecret =
  "synthetic-newsletter-rate-limit-secret-0123456789ABCDEF";
const requestUrl = "https://store.example.test/api/newsletter";

function requestWith(name?: string, value?: string): Request {
  const headers = new Headers();
  if (name !== undefined && value !== undefined) headers.set(name, value);
  return new Request(requestUrl, { method: "POST", headers });
}

function sessionReturning(count: unknown) {
  const query = vi.fn().mockResolvedValue({ rows: [{ count }] });
  const release = vi.fn();
  return {
    query,
    release,
    session: { query, release } as unknown as NewsletterAttemptGateSession,
  };
}

function configuredGate({
  appEnvironment = "preview" as const,
  count = 1,
  limit = 2,
  now = () => new Date("2026-09-03T12:34:56.789Z"),
  windowSeconds = 600,
}: {
  appEnvironment?: "local" | "preview" | "production";
  count?: unknown;
  limit?: number;
  now?: () => Date;
  windowSeconds?: number;
} = {}) {
  const database = sessionReturning(count);
  const connect = vi.fn().mockResolvedValue(database.session);
  return {
    ...database,
    connect,
    gate: createNewsletterAttemptGate({
      appEnvironment,
      connect,
      limit,
      now,
      rateLimitSecret,
      windowSeconds,
    }),
  };
}

describe("createNewsletterAttemptGate", () => {
  it("persists one HMAC scope in the existing table with the exact configured window", async () => {
    const { gate, query, release } = configuredGate();

    await expect(gate.consume(
      requestWith("x-vercel-forwarded-for", "203.0.113.9"),
    )).resolves.toBe("allowed");

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("public.rate_limit_windows");
    expect(parameters).toEqual([
      "9e564a568a140b82c36bd5ac963faebb2e7980a09e6074925811ebda3f49a65c",
      "2026-09-03T12:30:00.000Z",
      "2026-09-03T12:40:00.000Z",
    ]);
    expect(JSON.stringify(parameters)).not.toContain("203.0.113.9");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("maps a count above the exact configured limit to limited and releases", async () => {
    const { gate, query, release } = configuredGate({ count: 3, limit: 2 });

    await expect(gate.consume(
      requestWith("x-vercel-forwarded-for", "2001:db8::1"),
    )).resolves.toBe("limited");
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["preview IPv4", "preview", "x-vercel-forwarded-for", "198.51.100.7"],
    ["production IPv6", "production", "x-vercel-forwarded-for", "2001:DB8::7"],
    ["local forwarded IPv4", "local", "x-forwarded-for", "192.0.2.4"],
  ] as const)("accepts one valid %s", async (_label, appEnvironment, name, address) => {
    const { session, query, release } = sessionReturning(1);
    const connect = vi.fn().mockResolvedValue(session);
    const gate = createNewsletterAttemptGate({
      appEnvironment,
      connect,
      limit: 1,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      rateLimitSecret,
      windowSeconds: 60,
    });

    await expect(gate.consume(requestWith(name, address))).resolves.toBe("allowed");
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("uses only the local loopback fallback when x-forwarded-for is absent", async () => {
    const { gate, query } = configuredGate({ appEnvironment: "local" });

    await expect(gate.consume(requestWith())).resolves.toBe("allowed");
    const parameters = query.mock.calls[0]?.[1] as unknown[];
    expect(parameters[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(parameters)).not.toContain("127.0.0.1");
  });

  it.each([
    ["missing deployed header", "preview", undefined, undefined],
    ["wrong deployed header", "production", "x-forwarded-for", "203.0.113.8"],
    ["comma-separated chain", "preview", "x-vercel-forwarded-for", "203.0.113.8, 203.0.113.9"],
    ["invalid address", "preview", "x-vercel-forwarded-for", "not-an-ip"],
    ["oversized address", "preview", "x-vercel-forwarded-for", "1".repeat(65)],
  ] as const)("returns unavailable for %s without connecting", async (
    _label,
    appEnvironment,
    name,
    value,
  ) => {
    const connect = vi.fn();
    const gate = createNewsletterAttemptGate({
      appEnvironment,
      connect,
      limit: 2,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      rateLimitSecret,
      windowSeconds: 60,
    });

    await expect(gate.consume(requestWith(name, value))).resolves.toBe("unavailable");
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ["zero limit", 0, 60, () => new Date("2026-09-03T00:00:00.000Z")],
    ["fractional limit", 1.5, 60, () => new Date("2026-09-03T00:00:00.000Z")],
    ["short window", 1, 59, () => new Date("2026-09-03T00:00:00.000Z")],
    ["oversized window", 1, 86_401, () => new Date("2026-09-03T00:00:00.000Z")],
    ["invalid clock", 1, 60, () => new Date(Number.NaN)],
  ] as const)("fails closed for %s before connecting", async (
    _label,
    limit,
    windowSeconds,
    now,
  ) => {
    const connect = vi.fn();
    const gate = createNewsletterAttemptGate({
      appEnvironment: "preview",
      connect,
      limit,
      now,
      rateLimitSecret,
      windowSeconds,
    });

    await expect(gate.consume(
      requestWith("x-vercel-forwarded-for", "203.0.113.10"),
    )).resolves.toBe("unavailable");
    expect(connect).not.toHaveBeenCalled();
  });

  it("maps database connection failure to unavailable", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("database endpoint detail"));
    const gate = createNewsletterAttemptGate({
      appEnvironment: "preview",
      connect,
      limit: 2,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      rateLimitSecret,
      windowSeconds: 60,
    });

    await expect(gate.consume(
      requestWith("x-vercel-forwarded-for", "203.0.113.11"),
    )).resolves.toBe("unavailable");
  });

  it.each(["query failure", "malformed count", "release failure"] as const)(
    "returns unavailable and releases the acquired session after %s",
    async (failure) => {
      const { session, query, release } = sessionReturning(
        failure === "malformed count" ? 0 : 1,
      );
      if (failure === "query failure") {
        query.mockRejectedValue(new Error("query exposed detail"));
      }
      if (failure === "release failure") {
        release.mockImplementation(() => {
          throw new Error("release exposed detail");
        });
      }
      const connect = vi.fn().mockResolvedValue(session);
      const gate = createNewsletterAttemptGate({
        appEnvironment: "preview",
        connect,
        limit: 2,
        now: () => new Date("2026-09-03T00:00:00.000Z"),
        rateLimitSecret,
        windowSeconds: 60,
      });

      await expect(gate.consume(
        requestWith("x-vercel-forwarded-for", "203.0.113.12"),
      )).resolves.toBe("unavailable");
      expect(release).toHaveBeenCalledTimes(1);
    },
  );

  it("releases an acquired session whose query port is malformed", async () => {
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({ query: null, release });
    const gate = createNewsletterAttemptGate({
      appEnvironment: "preview",
      connect,
      limit: 2,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      rateLimitSecret,
      windowSeconds: 60,
    });

    await expect(gate.consume(
      requestWith("x-vercel-forwarded-for", "203.0.113.13"),
    )).resolves.toBe("unavailable");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
