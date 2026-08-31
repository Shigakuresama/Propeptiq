import { isIP } from "node:net";

import { headers } from "next/headers";

import { createAuthPostgresRateLimitStore } from "@/auth/auth-rate-limit-store";
import { readAuthCallerAddress } from "@/auth/caller-address";
import type { ServerEnv } from "@/config/env-schema";
import { connectRuntimeDatabaseSession } from "@/db/runtime";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
  type RateLimitStore,
} from "@/security/rate-limit";

export type AuthActionOperation =
  | "signUp"
  | "signIn"
  | "resendVerification"
  | "verifyEmail"
  | "requestPasswordReset"
  | "resetPassword";

const AUTH_ACTION_WINDOW_MS = 60_000;
const defaultLimits: Readonly<Record<AuthActionOperation, number>> = {
  signUp: 3,
  signIn: 5,
  resendVerification: 3,
  verifyEmail: 5,
  requestPasswordReset: 3,
  resetPassword: 5,
};

export function createAuthActionRateLimiter(input: Readonly<{
  store: RateLimitStore;
  secret: string;
  limits?: Partial<Readonly<Record<AuthActionOperation, number>>>;
}>): (request: Readonly<{
  callerAddress: string;
  operation: AuthActionOperation;
  now: Date;
}>) => Promise<boolean> {
  return async (request) => {
    const limit = input.limits?.[request.operation] ?? defaultLimits[request.operation];
    if (isIP(request.callerAddress) === 0) return false;
    try {
      const decision = await consumeFixedWindowLimit({
        store: input.store,
        scope: createRateLimitScope(
          request.callerAddress,
          `better-auth.action.${request.operation}`,
          input.secret,
        ),
        limit,
        windowMs: AUTH_ACTION_WINDOW_MS,
        now: request.now,
      });
      return decision.allowed;
    } catch {
      return false;
    }
  };
}

export async function consumeAuthActionRateLimit(
  environment: ServerEnv,
  operation: AuthActionOperation,
): Promise<boolean> {
  if (!environment.RATE_LIMIT_SECRET) return false;
  const callerAddress = readAuthCallerAddress(
    await headers(),
    environment.APP_ENV,
  );
  if (!callerAddress) return false;

  let session: Awaited<ReturnType<typeof connectRuntimeDatabaseSession>>;
  try {
    session = await connectRuntimeDatabaseSession(environment);
  } catch {
    return false;
  }

  try {
    return await createAuthActionRateLimiter({
      store: createAuthPostgresRateLimitStore(session),
      secret: environment.RATE_LIMIT_SECRET,
    })({ callerAddress, operation, now: new Date() });
  } finally {
    session.release();
  }
}
