import "server-only";

import { readAuthCallerAddress } from "@/auth/caller-address";
import type { ServerEnv } from "@/config/env-schema";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";
import type { RuntimeDatabaseSession } from "@/db/runtime";
import type { NewsletterAttemptGate } from "@/newsletter/server";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
} from "@/security/rate-limit";

export type NewsletterAttemptGateSession = RuntimeDatabaseSession;

export type NewsletterAttemptGateDependencies = Readonly<{
  appEnvironment: ServerEnv["APP_ENV"];
  connect: () => Promise<NewsletterAttemptGateSession>;
  limit: number;
  now: () => Date;
  rateLimitSecret: string;
  windowSeconds: number;
}>;

type AttemptGateConfiguration = Readonly<{
  appEnvironment: ServerEnv["APP_ENV"];
  connect: () => Promise<NewsletterAttemptGateSession>;
  limit: number;
  now: () => Date;
  rateLimitSecret: string;
  windowSeconds: number;
}>;

function snapshotConfiguration(
  input: NewsletterAttemptGateDependencies,
): AttemptGateConfiguration | null {
  try {
    const snapshot = Object.freeze({
      appEnvironment: input.appEnvironment,
      connect: input.connect,
      limit: input.limit,
      now: input.now,
      rateLimitSecret: input.rateLimitSecret,
      windowSeconds: input.windowSeconds,
    });
    if (
      !["local", "preview", "production"].includes(snapshot.appEnvironment) ||
      typeof snapshot.connect !== "function" ||
      typeof snapshot.now !== "function" ||
      typeof snapshot.rateLimitSecret !== "string" ||
      !Number.isSafeInteger(snapshot.limit) ||
      snapshot.limit < 1 ||
      snapshot.limit > 100 ||
      !Number.isSafeInteger(snapshot.windowSeconds) ||
      snapshot.windowSeconds < 60 ||
      snapshot.windowSeconds > 86_400
    ) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function databasePort(
  session: NewsletterAttemptGateSession,
): Readonly<{
  store: ReturnType<typeof createPostgresRateLimitStore> | null;
  release: () => void;
}> | null {
  let release: RuntimeDatabaseSession["release"];
  try {
    release = session.release;
  } catch {
    return null;
  }
  if (typeof release !== "function") return null;

  let store: ReturnType<typeof createPostgresRateLimitStore> | null = null;
  try {
    const query = session.query;
    if (typeof query === "function") {
      store = createPostgresRateLimitStore({
        query<T extends object>(sql: string, parameters?: unknown[]) {
          return Reflect.apply(query, session, [
            sql,
            parameters ?? [],
          ]) as Promise<Readonly<{ rows: T[] }>>;
        },
      });
    }
  } catch {
    store = null;
  }
  return Object.freeze({
    store,
    release() {
      Reflect.apply(release, session, []);
    },
  });
}

export function createNewsletterAttemptGate(
  input: NewsletterAttemptGateDependencies,
): NewsletterAttemptGate {
  const configuration = snapshotConfiguration(input);

  return Object.freeze({
    async consume(
      request: Request,
    ): Promise<"allowed" | "limited" | "unavailable"> {
      if (configuration === null) return "unavailable";

      let address: string | null;
      let now: Date;
      let scope: string;
      try {
        address = readAuthCallerAddress(
          request.headers,
          configuration.appEnvironment,
        );
        if (address === null) return "unavailable";
        now = configuration.now();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
          return "unavailable";
        }
        scope = createRateLimitScope(
          address,
          "newsletter.subscribe",
          configuration.rateLimitSecret,
        );
      } catch {
        return "unavailable";
      }

      let session: NewsletterAttemptGateSession;
      try {
        session = await configuration.connect();
      } catch {
        return "unavailable";
      }

      const port = databasePort(session);
      if (port === null) return "unavailable";

      let outcome: "allowed" | "limited" | "unavailable" = "unavailable";
      if (port.store !== null) {
        try {
          const decision = await consumeFixedWindowLimit({
            store: port.store,
            scope,
            limit: configuration.limit,
            windowMs: configuration.windowSeconds * 1_000,
            now,
          });
          outcome = decision.allowed ? "allowed" : "limited";
        } catch {
          outcome = "unavailable";
        }
      }

      try {
        port.release();
      } catch {
        return "unavailable";
      }
      return outcome;
    },
  });
}
