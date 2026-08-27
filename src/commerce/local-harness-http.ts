import "server-only";

import type { RequestIdentity } from "@/auth/server";
import { isVerifiedIdentityAt } from "@/auth/identity";
import type { LocalTestDriver } from "@/auth/local-driver-types";
import { isSyntheticLocalCommerceEnvironmentConfigured } from "@/config/commerce-capability";

export type LocalCommerceHarnessAuthorization = Readonly<{
  driver: LocalTestDriver;
  ownerUserId: string | null;
  origin: string;
  secret: string;
}>;

function exactLocalEnvironment(
  requestIdentity: RequestIdentity,
): Readonly<{ origin: string; secret: string; driver: LocalTestDriver }> | null {
  const environment = requestIdentity.environment;
  if (
    !isSyntheticLocalCommerceEnvironmentConfigured(environment) ||
    requestIdentity.localDriver === null
  ) {
    return null;
  }
  return Object.freeze({
    origin: environment.APP_ORIGIN!,
    secret: environment.LOCAL_TEST_SECRET!,
    driver: requestIdentity.localDriver,
  });
}

function ownerFor(requestIdentity: RequestIdentity): string | null {
  const identity = requestIdentity.identity;
  const principal = requestIdentity.principal;
  if (
    identity === null ||
    principal === null ||
    !isVerifiedIdentityAt(identity, new Date()) ||
    identity.clerkUserId !== principal.clerkUserId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(principal.actorId)
  ) {
    return null;
  }
  return principal.actorId;
}

export function authorizeLocalCommerceHarness(input: Readonly<{
  request: Request;
  requestIdentity: RequestIdentity;
  requireOriginHeader: boolean;
  requireOwner: boolean;
}>): LocalCommerceHarnessAuthorization | null {
  const local = exactLocalEnvironment(input.requestIdentity);
  if (local === null) return null;
  let requestUrl: URL;
  try {
    requestUrl = new URL(input.request.url);
  } catch {
    return null;
  }
  const configuredOrigin = new URL(local.origin);
  const requestHost = input.request.headers.get("host");
  const exactRequestOrigin = requestUrl.origin === local.origin || (
    requestUrl.protocol === configuredOrigin.protocol &&
    requestUrl.hostname === "localhost" &&
    requestUrl.port === configuredOrigin.port &&
    requestHost?.toLowerCase() === configuredOrigin.host.toLowerCase()
  );
  if (
    !exactRequestOrigin ||
    (input.requireOriginHeader && input.request.headers.get("origin") !== local.origin)
  ) {
    return null;
  }
  const ownerUserId = ownerFor(input.requestIdentity);
  if (input.requireOwner && ownerUserId === null) return null;
  return Object.freeze({ ...local, ownerUserId });
}

export function authorizeLocalCommerceHostedPage(input: Readonly<{
  requestIdentity: RequestIdentity;
  host: string | null;
}>): LocalCommerceHarnessAuthorization | null {
  const local = exactLocalEnvironment(input.requestIdentity);
  if (local === null || input.host === null) return null;
  const expected = new URL(local.origin);
  if (input.host.toLowerCase() !== expected.host.toLowerCase()) return null;
  const ownerUserId = ownerFor(input.requestIdentity);
  return ownerUserId === null ? null : Object.freeze({ ...local, ownerUserId });
}

export function localHarnessNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export function localHarnessJson(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
