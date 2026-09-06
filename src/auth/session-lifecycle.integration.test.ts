import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createBetterAuthForEnvironment } from "./better-auth-server";
import { parseServerEnv } from "@/config/env-schema";

// Real Better Auth and real disposable SQLite. Only email delivery, scheduling
// and the unused PostgreSQL factory are test doubles. PostgreSQL contention is
// separately covered by the guarded integration lane.
describe("Better Auth persistent session HTTP lifecycle", () => {
  it("verifies signup, persists across reads/runtime restart, renews and revokes on logout", async () => {
    const db = new DatabaseSync(":memory:");
    const messages: string[] = [];
    const scheduled: Promise<void>[] = [];
    const origin = "http://localhost:4632";
    const environment = parseServerEnv({
      APP_ENV: "local", APP_ORIGIN: origin, AUTH_MODE: "test",
      DATABASE_MODE: "test", EMAIL_MODE: "test",
      TEST_DATABASE_URL: "postgresql://auth-test.invalid/disposable",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      BETTER_AUTH_SECRET: "synthetic-session-secret-material-0123456789ABCDEF",
      RATE_LIMIT_SECRET: "synthetic-session-rate-secret-material-0123456789",
      RESEND_API_KEY: "re_synthetic_test_only", RESEND_FROM: "auth@example.test",
    });
    const create = () => createBetterAuthForEnvironment(environment, {
      createPool: () => ({} as Pool),
      createResend: () => ({ emails: { async send(payload) {
        messages.push(payload.text); return { error: null };
      } } }),
      schedule: (work) => { scheduled.push(work()); },
      createAuth: (options) => betterAuth({
        ...options, database: db,
        // The PostgreSQL rate store is tested separately, not against SQLite.
        rateLimit: { enabled: false },
      }),
    })!;
    let auth = create();
    const call = (path: string, body?: object, cookie?: string) => auth.handler(
      new Request(origin + "/api/auth/" + path, {
        method: body ? "POST" : "GET",
        headers: { Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    try {
      await (await getMigrations(auth.options)).runMigrations();
      const credentials = { email: "session-fixture@example.test", password: "Synthetic-session-password-123!" };
      expect((await call("sign-up/email", { ...credentials, name: "Session test" })).status).toBe(200);
      await Promise.all(scheduled);
      const code = messages.at(-1)?.match(/\b\d{6}\b/u)?.[0];
      expect(Boolean(code)).toBe(true);
      expect((await call("email-otp/verify-email", { email: credentials.email, otp: code })).status).toBe(200);
      const signIn = await call("sign-in/email", credentials);
      expect(signIn.status).toBe(200);
      const tokenCookie = signIn.headers.getSetCookie().find((cookie) => cookie.startsWith("propeptiq.session_token="));
      expect(Boolean(tokenCookie?.includes("Max-Age=604800"))).toBe(true);
      expect(Boolean(tokenCookie?.includes("HttpOnly"))).toBe(true);
      expect(Boolean(tokenCookie?.includes("SameSite=Lax"))).toBe(true);
      const cookie = tokenCookie!.split(";")[0]!;
      for (let visit = 0; visit < 3; visit += 1) {
        const result = await (await call("get-session", undefined, cookie)).json();
        expect(result.user.emailVerified).toBe(true);
      }
      auth = create(); // A new runtime with the same database and stable secret.
      expect(Boolean((await (await call("get-session", undefined, cookie)).json())?.user)).toBe(true);
      db.prepare('UPDATE session SET "expiresAt" = ?, "updatedAt" = ?').run(
        Date.now() + 5 * 24 * 60 * 60 * 1000, Date.now() - 2 * 24 * 60 * 60 * 1000,
      );
      const refreshed = await call("get-session", undefined, cookie);
      expect(refreshed.status).toBe(200);
      expect(refreshed.headers.getSetCookie().some((entry) => entry.includes("Max-Age=604800"))).toBe(true);
      expect((await call("sign-out", {}, cookie)).status).toBe(200);
      expect(await (await call("get-session", undefined, cookie)).json()).toBeNull();
      expect((await call("sign-in/email", { ...credentials, password: "incorrect-password" })).status).toBe(401);
    } finally {
      db.close();
    }
  });
});

