import "server-only";

import {
  createNeonAuth,
  type NeonAuth,
} from "@neondatabase/auth/next/server";

import {
  resolveNeonAuthBaseUrl,
  type ServerEnv,
} from "@/config/env-schema";
import { readServerEnv } from "@/env";

type CachedAuth = Readonly<{
  baseUrl: string;
  cookieSecret: string;
  auth: NeonAuth;
}>;

let cachedAuth: CachedAuth | null = null;

export function getNeonAuthForEnvironment(
  environment: ServerEnv,
): NeonAuth | null {
  if (
    environment.AUTH_MODE === "disabled" ||
    environment.LOCAL_TEST_DRIVER === "enabled"
  ) {
    return null;
  }

  const baseUrl = resolveNeonAuthBaseUrl(environment);
  const cookieSecret = environment.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !cookieSecret) {
    // parseServerEnv normally prevents this. Keep this boundary fail-closed for
    // explicitly constructed ServerEnv test doubles and future callers.
    throw new Error("Managed Neon Auth is enabled without complete configuration");
  }

  if (
    cachedAuth?.baseUrl === baseUrl &&
    cachedAuth.cookieSecret === cookieSecret
  ) {
    return cachedAuth.auth;
  }

  const auth = createNeonAuth({
    baseUrl,
    cookies: { secret: cookieSecret },
  });
  cachedAuth = Object.freeze({ baseUrl, cookieSecret, auth });
  return auth;
}

export function getNeonAuth(): NeonAuth | null {
  return getNeonAuthForEnvironment(readServerEnv());
}
