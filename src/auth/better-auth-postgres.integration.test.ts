import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createBetterAuthForEnvironment } from "@/auth/better-auth-server";
import { parseServerEnv } from "@/config/env-schema";
import { resolveTestDatabase } from "../../tests/integration/helpers/database";

type DeliveredEmail = Readonly<{
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}>;

const integrationEnabled =
  Boolean(process.env.TEST_DATABASE_URL) &&
  process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const managedCompatibilityEnabled =
  integrationEnabled && Boolean(process.env.MANAGED_NEON_AUTH_BASE_URL);

let pool: Pool | null = null;
let fixtureEmail: string | null = null;

async function applyAuthSupportMigration(database: Pool): Promise<void> {
  const sql = await readFile(
    new URL("./migrations/0001_rate_limit_windows.sql", import.meta.url),
    "utf8",
  );
  await database.query(sql);
}

async function cleanupSyntheticIdentity(
  database: Pool,
  email: string,
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query<{ id: string }>(
      'SELECT id::text AS id FROM neon_auth."user" WHERE email = $1',
      [email],
    );
    const userIds = users.rows.map((row) => row.id);
    if (userIds.length > 0) {
      await client.query(
        'DELETE FROM neon_auth."session" WHERE "userId" = ANY($1::uuid[])',
        [userIds],
      );
      await client.query(
        'DELETE FROM neon_auth.account WHERE "userId" = ANY($1::uuid[])',
        [userIds],
      );
      await client.query(
        'DELETE FROM neon_auth."user" WHERE id = ANY($1::uuid[])',
        [userIds],
      );
    }
    await client.query(
      "DELETE FROM neon_auth.verification WHERE identifier LIKE '%' || $1",
      [email],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function extractOtp(messages: readonly DeliveredEmail[]): string {
  const message = [...messages]
    .reverse()
    .find((candidate) => candidate.subject === "Verify your PROPEPTIQ email");
  const otp = message?.text.match(/verification code is (\d{6})/u)?.[1];
  if (!otp) throw new Error("Verification OTP was not captured by the test sink");
  return otp;
}

function extractResetUrl(messages: readonly DeliveredEmail[]): URL {
  const message = [...messages]
    .reverse()
    .find((candidate) => candidate.subject === "Reset your PROPEPTIQ password");
  const resetUrl = message?.text.match(/Reset your password: (https:\/\/\S+)/u)?.[1];
  if (!resetUrl) throw new Error("Password-reset URL was not captured by the test sink");
  return new URL(resetUrl);
}

function extractSessionCookie(headers: Headers | undefined): string {
  const setCookie = headers?.get("set-cookie");
  const match = setCookie?.match(
    /(?:^|,\s*)((?:__Secure-)?propeptiq\.session_token=[^;,\s]+)/u,
  );
  if (!match?.[1]) throw new Error("Session cookie was not returned");
  return match[1];
}

function resolveManagedNeonAuthBaseUrl(value: string | undefined): URL {
  if (!value) throw new Error("Managed Neon Auth compatibility URL is absent");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !/\.neonauth\.[a-z0-9.-]+\.neon\.tech$/u.test(url.hostname) ||
    !url.pathname.endsWith("/auth")
  ) {
    throw new Error("Managed Neon Auth compatibility URL is not allowlisted");
  }
  return url;
}

describe.skipIf(!integrationEnabled)(
  "Better Auth lifecycle on an isolated Neon branch",
  () => {
    afterAll(async () => {
      if (pool && fixtureEmail) {
        await cleanupSyntheticIdentity(pool, fixtureEmail);
      }
      await pool?.end();
    });

    it("revokes two old sessions, consumes one reset token, and accepts only the new password", async () => {
      const target = resolveTestDatabase(process.env);
      const messages: DeliveredEmail[] = [];
      const pendingDeliveries = new Set<Promise<void>>();
      fixtureEmail = `codex-auth-${randomUUID()}@example.test`;
      const originalPassword = "Synthetic-old-password-1!";
      const replacementPassword = "Synthetic-new-password-2!";
      const environment = parseServerEnv({
        APP_ENV: "preview",
        APP_ORIGIN: "https://auth-test.propeptiq.example.invalid",
        AUTH_MODE: "test",
        BETTER_AUTH_SECRET:
          "synthetic-integration-better-auth-secret-0123456789ABCDEF",
        RATE_LIMIT_SECRET:
          "synthetic-integration-rate-limit-secret-0123456789ABCDEF",
        DATABASE_MODE: "test",
        TEST_DATABASE_URL: target.url,
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
        EMAIL_MODE: "test",
        RESEND_API_KEY: "re_synthetic_integration_only",
        RESEND_FROM: "accounts@example.test",
      });
      const flushDeliveries = async () => {
        while (pendingDeliveries.size > 0) {
          await Promise.all([...pendingDeliveries]);
        }
      };

      const auth = createBetterAuthForEnvironment(environment, {
        createPool(configuration) {
          pool = new Pool(configuration);
          return pool;
        },
        createAuth: (options) => betterAuth(options),
        createResend: () => ({
          emails: {
            async send(message) {
              messages.push(message);
              return { error: null };
            },
          },
        }),
        schedule(work) {
          const delivery = work();
          pendingDeliveries.add(delivery);
          void delivery.finally(() => pendingDeliveries.delete(delivery));
        },
      });
      if (!auth || !pool) throw new Error("Better Auth test runtime was not created");

      await applyAuthSupportMigration(pool);
      await pool.query("DELETE FROM propeptiq_auth.rate_limit_windows");
      await pool.query(
        `INSERT INTO propeptiq_auth.rate_limit_windows
           (scope_hash, window_start, count, expires_at)
         VALUES ($1, now() - interval '2 minutes', 1, now() - interval '1 minute')`,
        ["f".repeat(64)],
      );
      await cleanupSyntheticIdentity(pool, fixtureEmail);
      await auth.api.signUpEmail({
        body: {
          name: "Synthetic Auth Lifecycle",
          email: fixtureEmail,
          password: originalPassword,
        },
      });
      await flushDeliveries();

      const verification = await auth.api.verifyEmailOTP({
        body: { email: fixtureEmail, otp: extractOtp(messages) },
        returnHeaders: true,
      });
      expect(verification.response).toMatchObject({
        status: true,
        user: { email: fixtureEmail, emailVerified: true },
      });

      const signIn = async (password: string): Promise<string> => {
        const result = await auth.api.signInEmail({
          body: { email: fixtureEmail!, password },
          returnHeaders: true,
        });
        expect(result.response.user.email).toBe(fixtureEmail);
        return extractSessionCookie(result.headers);
      };
      const firstSession = await signIn(originalPassword);
      const secondSession = await signIn(originalPassword);
      expect(firstSession).not.toBe(secondSession);

      await auth.api.requestPasswordReset({
        body: {
          email: fixtureEmail,
          redirectTo:
            "https://auth-test.propeptiq.example.invalid/reset-password",
        },
      });
      await flushDeliveries();
      const resetCallback = await auth.handler(
        new Request(extractResetUrl(messages)),
      );
      expect(resetCallback.status).toBe(302);
      const expiredRateLimitRows = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM propeptiq_auth.rate_limit_windows
          WHERE scope_hash = $1`,
        ["f".repeat(64)],
      );
      expect(expiredRateLimitRows.rows[0]?.count).toBe("0");
      const resetLocation = resetCallback.headers.get("location");
      if (!resetLocation) throw new Error("Password-reset callback did not redirect");
      const resetDestination = new URL(resetLocation);
      expect(resetDestination.origin).toBe(
        "https://auth-test.propeptiq.example.invalid",
      );
      expect(resetDestination.pathname).toBe("/reset-password");
      const resetToken = resetDestination.searchParams.get("token");
      if (!resetToken) throw new Error("Password-reset callback returned no token");

      await expect(
        auth.api.resetPassword({
          body: { newPassword: replacementPassword, token: resetToken },
        }),
      ).resolves.toMatchObject({ status: true });

      for (const cookie of [firstSession, secondSession]) {
        await expect(
          auth.api.getSession({ headers: new Headers({ cookie }) }),
        ).resolves.toBeNull();
      }
      await expect(
        auth.api.resetPassword({
          body: { newPassword: "Synthetic-reused-password-3!", token: resetToken },
        }),
      ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
      await expect(
        auth.api.signInEmail({
          body: { email: fixtureEmail, password: originalPassword },
        }),
      ).rejects.toMatchObject({ body: { code: "INVALID_EMAIL_OR_PASSWORD" } });

      const replacementSession = await signIn(replacementPassword);
      await expect(
        auth.api.getSession({
          headers: new Headers({ cookie: replacementSession }),
        }),
      ).resolves.toMatchObject({
        user: { email: fixtureEmail, emailVerified: true },
      });

      await cleanupSyntheticIdentity(pool, fixtureEmail);
      const remaining = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM neon_auth."user"
          WHERE email = $1`,
        [fixtureEmail],
      );
      expect(remaining.rows[0]?.count).toBe("0");
      await pool.query(
        "DELETE FROM propeptiq_auth.rate_limit_windows",
      );
      fixtureEmail = null;
    });

    it.skipIf(!managedCompatibilityEnabled)(
      "signs in an unchanged credential created by the branch's Managed Neon endpoint",
      async () => {
        const target = resolveTestDatabase(process.env);
        const managedBaseUrl = resolveManagedNeonAuthBaseUrl(
          process.env.MANAGED_NEON_AUTH_BASE_URL,
        );
        const email = `codex-managed-compat-${randomUUID()}@example.test`;
        const password = "Synthetic-managed-password-4!";
        const compatibilityPools: Pool[] = [];
        try {
          const environment = parseServerEnv({
            APP_ENV: "preview",
            APP_ORIGIN: "https://auth-test.propeptiq.example.invalid",
            AUTH_MODE: "test",
            BETTER_AUTH_SECRET:
              "synthetic-compat-better-auth-secret-0123456789ABCDEF",
            RATE_LIMIT_SECRET:
              "synthetic-compat-rate-limit-secret-0123456789ABCDEF",
            DATABASE_MODE: "test",
            TEST_DATABASE_URL: target.url,
            TEST_DATABASE_CONFIRMATION: "isolated-test-database",
            EMAIL_MODE: "test",
            RESEND_API_KEY: "re_synthetic_compatibility_only",
            RESEND_FROM: "accounts@example.test",
          });
          const appAuth = createBetterAuthForEnvironment(environment, {
            createPool(configuration) {
              const database = new Pool(configuration);
              compatibilityPools.push(database);
              return database;
            },
            createAuth: (options) => betterAuth(options),
            createResend: () => ({
              emails: { send: async () => ({ error: null }) },
            }),
            schedule(work) {
              void work();
            },
          });
          const database = compatibilityPools[0];
          if (!appAuth || !database) {
            throw new Error("Better Auth compatibility runtime was not created");
          }
          await cleanupSyntheticIdentity(database, email);

          const signUpUrl = new URL(
            `${managedBaseUrl.pathname.replace(/\/$/u, "")}/sign-up/email`,
            managedBaseUrl.origin,
          );
          const managedResponse = await fetch(signUpUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: managedBaseUrl.origin,
            },
            body: JSON.stringify({
              name: "Synthetic Managed Compatibility",
              email,
              password,
            }),
          });
          if (!managedResponse.ok) {
            throw new Error(
              `Managed Neon Auth synthetic signup failed with status ${managedResponse.status}`,
            );
          }
          const managedResult = (await managedResponse.json()) as Readonly<{
            user?: Readonly<{ id?: string }>;
          }>;
          if (!managedResult.user?.id) {
            throw new Error("Managed Neon Auth synthetic signup returned no user");
          }

          const managedCredential = await database.query<{
            id: string;
            password: string;
          }>(
            `UPDATE neon_auth."user" AS u
                SET "emailVerified" = true,
                    "updatedAt" = now()
               FROM neon_auth.account AS a
              WHERE u.email = $1
                AND a."userId" = u.id
                AND a."providerId" = 'credential'
          RETURNING u.id::text AS id, a.password`,
            [email],
          );
          expect(managedCredential.rows).toHaveLength(1);
          const before = managedCredential.rows[0]!;
          expect(before.id).toBe(managedResult.user.id);
          expect(before.password).toBeTruthy();

          const signedIn = await appAuth.api.signInEmail({
            body: { email, password },
          });
          expect(signedIn.user.id).toBe(before.id);

          const after = await database.query<{
            id: string;
            password: string;
          }>(
            `SELECT u.id::text AS id, a.password
               FROM neon_auth."user" AS u
               JOIN neon_auth.account AS a ON a."userId" = u.id
              WHERE u.email = $1
                AND a."providerId" = 'credential'`,
            [email],
          );
          expect(after.rows).toEqual([before]);
        } finally {
          const database = compatibilityPools[0];
          if (database) {
            try {
              await cleanupSyntheticIdentity(database, email);
            } finally {
              await database.end();
            }
          }
        }
      },
    );
  },
);
