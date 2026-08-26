import { describe, expect, it } from "vitest";

import { assertMutationOrigin } from "./origin";
import {
  createRateLimitScope,
  consumeFixedWindowLimit,
  type RateLimitStore,
} from "./rate-limit";
import { verifyCoaForPublication } from "./storage";

describe("mutation safeguards", () => {
  it("accepts only the exact configured request origin and rejects missing or cross-origin requests", () => {
    const allowed = new Request("https://research.example.test/api/admin", {
      method: "POST",
      headers: { origin: "https://research.example.test" },
    });
    expect(() =>
      assertMutationOrigin(allowed, {
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test",
      }),
    ).not.toThrow();

    for (const origin of [null, "https://attacker.example.test"]) {
      const headers = origin ? { origin } : undefined;
      const request = new Request(
        "https://research.example.test/api/admin",
        headers ? { method: "POST", headers } : { method: "POST" },
      );
      expect(() =>
        assertMutationOrigin(request, {
          APP_ENV: "production",
          APP_ORIGIN: "https://research.example.test",
        }),
      ).toThrow(/origin/i);
    }
  });

  it("normalizes equivalent URL origins before exact comparison", () => {
    const request = new Request("https://research.example.test/api/admin", {
      method: "POST",
      headers: { origin: "https://research.example.test:443" },
    });
    expect(() =>
      assertMutationOrigin(request, {
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test/",
      }),
    ).not.toThrow();
  });

  it("accepts the local Next development URL canonicalization only with the exact trusted Host and Origin", () => {
    const environment = { APP_ENV: "local" as const, APP_ORIGIN: "http://127.0.0.1:4631" };
    const canonicalized = new Request("http://localhost:4631/api/checkout/quote", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:4631", host: "127.0.0.1:4631" },
    });
    expect(() => assertMutationOrigin(canonicalized, environment)).not.toThrow();
    const wrongHost = new Request("http://localhost:4631/api/checkout/quote", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:4631", host: "localhost:4631" },
    });
    expect(() => assertMutationOrigin(wrongHost, environment)).toThrow(/origin/i);
  });

  it("hashes actor and operation into isolated fixed-window limiter scopes", async () => {
    const counts = new Map<string, number>();
    const store: RateLimitStore = {
      async increment(window) {
        expect(window.scopeHash).toMatch(/^[a-f0-9]{64}$/);
        const key = `${window.scopeHash}:${window.windowStart.toISOString()}`;
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return count;
      },
    };
    const firstScope = createRateLimitScope(
      "actor-raw-identity",
      "account.update",
      "rate-limit-secret-at-least-32-characters",
    );
    const secondOperation = createRateLimitScope(
      "actor-raw-identity",
      "admin.publish",
      "rate-limit-secret-at-least-32-characters",
    );
    expect(firstScope).not.toContain("actor-raw-identity");
    expect(firstScope).not.toBe(secondOperation);

    const input = {
      store,
      scope: firstScope,
      limit: 2,
      windowMs: 60_000,
      now: new Date("2026-08-25T12:00:00.000Z"),
    };
    await expect(consumeFixedWindowLimit(input)).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(consumeFixedWindowLimit(input)).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(consumeFixedWindowLimit(input)).resolves.toMatchObject({ allowed: false, remaining: 0 });

    await expect(
      consumeFixedWindowLimit({ ...input, scope: secondOperation }),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(
      consumeFixedWindowLimit({
        ...input,
        now: new Date("2026-08-25T12:01:00.000Z"),
      }),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });
  });

  it.each([
    ["disabled", { exists: true, sha256: "a".repeat(64) }],
    ["test", { exists: false, sha256: null }],
    ["test", { exists: true, sha256: "b".repeat(64) }],
  ] as const)("fails COA publication closed for storage mode %s and invalid evidence", async (mode, object) => {
    await expect(
      verifyCoaForPublication(
        { mode, verify: async () => object },
        { storageKey: "private/coa.pdf", expectedSha256: "a".repeat(64) },
      ),
    ).rejects.toThrow();
  });

  it("permits COA publication only after an exact private-object digest match", async () => {
    await expect(
      verifyCoaForPublication(
        {
          mode: "test",
          verify: async () => ({ exists: true, sha256: "a".repeat(64) }),
        },
        { storageKey: "private/coa.pdf", expectedSha256: "a".repeat(64) },
      ),
    ).resolves.toBe(true);
  });
});
