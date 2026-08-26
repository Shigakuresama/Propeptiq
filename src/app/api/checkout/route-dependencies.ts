import "server-only";

import { getRequestIdentity } from "@/auth/server";
import { isVerifiedIdentityAt } from "@/auth/identity";
import { createCheckoutHttpHandlers } from "@/commerce/checkout-http";
import { createCheckoutServerRuntime } from "@/commerce/server-runtime";
import { readServerEnv } from "@/env";
import { assertMutationOrigin } from "@/security/origin";

type CheckoutOperation = "quote" | "session";

export function checkoutRouteResponse(
  operation: CheckoutOperation,
  kind: "origin_denied" | "unavailable",
): Response {
  const body = kind === "origin_denied"
    ? { status: "origin_denied" }
    : operation === "quote"
      ? { status: "quote_unavailable", component: "commerce" }
      : { status: "unavailable" };
  return new Response(JSON.stringify(body), {
    status: kind === "origin_denied" ? 403 : 503,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function preflightCheckoutRoute(
  request: Request,
  operation: CheckoutOperation,
): Response | null {
  let environment: ReturnType<typeof readServerEnv>;
  try {
    environment = readServerEnv();
  } catch {
    return checkoutRouteResponse(operation, "unavailable");
  }
  try {
    assertMutationOrigin(
      request,
      environment.APP_ORIGIN === undefined
        ? { APP_ENV: environment.APP_ENV }
        : { APP_ENV: environment.APP_ENV, APP_ORIGIN: environment.APP_ORIGIN },
    );
    return null;
  } catch {
    return checkoutRouteResponse(operation, "origin_denied");
  }
}

export async function createCheckoutRouteHandlers() {
  const requestIdentity = await getRequestIdentity();
  const runtime = await createCheckoutServerRuntime(requestIdentity);
  const identity = requestIdentity.identity;
  const principal = requestIdentity.principal;
  const ownerBindingIsCurrent =
    identity !== null &&
    principal !== null &&
    isVerifiedIdentityAt(identity, new Date()) &&
    principal.clerkUserId === identity.clerkUserId &&
    (runtime === null || runtime.buyerUserId === principal.actorId);

  const controllerEnvironment = requestIdentity.environment.APP_ORIGIN === undefined
    ? { APP_ENV: requestIdentity.environment.APP_ENV }
    : {
        APP_ENV: requestIdentity.environment.APP_ENV,
        APP_ORIGIN: requestIdentity.environment.APP_ORIGIN,
      };

  return createCheckoutHttpHandlers({
    environment: controllerEnvironment,
    resolveActor: async () =>
      ownerBindingIsCurrent && principal !== null
        ? Object.freeze({ buyerUserId: principal.actorId })
        : null,
    rateLimitSecret: requestIdentity.environment.RATE_LIMIT_SECRET,
    rateLimitStore: runtime?.rateLimitStore ?? null,
    now: () => new Date(),
    quoteCheckout: runtime?.quoteCheckout ?? (async () => {
      throw new Error("Checkout runtime is unavailable");
    }),
    startSession: runtime?.startSession ?? (async () => {
      throw new Error("Checkout runtime is unavailable");
    }),
  });
}
