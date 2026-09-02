import "server-only";

import type { ApprovedNewsletterPrivacyHref } from "@/lib/site-content";
import { isApprovedNewsletterPrivacyHref } from "@/lib/site-content";
import {
  parseNewsletterResult,
  parseNewsletterSubscriptionInput,
  type NewsletterResult,
  type NewsletterSubscriptionInput,
} from "@/newsletter/contracts";

export interface NewsletterGateway {
  subscribe(input: NewsletterSubscriptionInput): Promise<"subscribed" | "duplicate">;
}

export interface NewsletterAttemptGate {
  consume(request: Request): Promise<"allowed" | "limited" | "unavailable">;
}

export type NewsletterServerDependencies = Readonly<{
  gateway?: NewsletterGateway | null;
  attemptGate?: NewsletterAttemptGate | null;
  privacyHref?: ApprovedNewsletterPrivacyHref | null;
}>;

const maximumRequestBytes = 1_024;

function fixedResult(value: NewsletterResult): NewsletterResult {
  const parsed = parseNewsletterResult(value);
  if (parsed === null) throw new TypeError("Invalid internal newsletter result.");
  return parsed;
}

const notConfiguredResult = fixedResult({ status: "NEWSLETTER_NOT_CONFIGURED" });
const providerErrorResult = fixedResult({ status: "PROVIDER_ERROR" });

function invalidResult(
  field: "email" | "consent" | "request",
): NewsletterResult {
  return fixedResult({ status: "INVALID", field });
}

function jsonResponse(result: NewsletterResult, status: number): Response {
  return new Response(JSON.stringify(result), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function hasExactOrigin(request: Request): boolean {
  const suppliedOrigin = request.headers.get("Origin");
  if (suppliedOrigin === null) return false;
  try {
    const parsedOrigin = new URL(suppliedOrigin);
    return suppliedOrigin === parsedOrigin.origin &&
      parsedOrigin.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function declaredBodyLength(request: Request):
  | Readonly<{ valid: true; length: number | null }>
  | Readonly<{ valid: false }> {
  const header = request.headers.get("Content-Length");
  if (header === null) return Object.freeze({ valid: true, length: null });
  if (!/^\d+$/u.test(header)) return Object.freeze({ valid: false });
  const length = Number(header);
  if (!Number.isSafeInteger(length)) return Object.freeze({ valid: false });
  return Object.freeze({ valid: true, length });
}

function configuredRuntime(
  dependencies: NewsletterServerDependencies,
): Readonly<{
  gateway: NewsletterGateway;
  attemptGate: NewsletterAttemptGate;
}> | null {
  try {
    const gateway = dependencies.gateway;
    const attemptGate = dependencies.attemptGate;
    const privacyHref = dependencies.privacyHref;
    if (
      gateway === null ||
      gateway === undefined ||
      typeof gateway.subscribe !== "function" ||
      attemptGate === null ||
      attemptGate === undefined ||
      typeof attemptGate.consume !== "function" ||
      !isApprovedNewsletterPrivacyHref(privacyHref)
    ) {
      return null;
    }
    return Object.freeze({ gateway, attemptGate });
  } catch {
    return null;
  }
}

export function createNewsletterPostHandler(
  dependencies: NewsletterServerDependencies = {},
): (request: Request) => Promise<Response> {
  const runtime = configuredRuntime(dependencies);

  return async function newsletterPOST(request: Request): Promise<Response> {
    if (runtime === null) {
      return jsonResponse(notConfiguredResult, 503);
    }
    if (!hasExactOrigin(request)) {
      return jsonResponse(providerErrorResult, 403);
    }
    if (request.headers.get("Content-Type")?.trim().toLowerCase() !== "application/json") {
      return jsonResponse(invalidResult("request"), 415);
    }

    const declaredLength = declaredBodyLength(request);
    if (!declaredLength.valid) {
      return jsonResponse(invalidResult("request"), 400);
    }
    if (declaredLength.length !== null && declaredLength.length > maximumRequestBytes) {
      return jsonResponse(invalidResult("request"), 413);
    }

    let attempt: "allowed" | "limited" | "unavailable";
    try {
      attempt = await Reflect.apply(runtime.attemptGate.consume, runtime.attemptGate, [request]);
    } catch {
      return jsonResponse(providerErrorResult, 503);
    }
    if (attempt === "limited") return jsonResponse(providerErrorResult, 429);
    if (attempt !== "allowed") return jsonResponse(providerErrorResult, 503);

    let body: string;
    try {
      body = await request.text();
    } catch {
      return jsonResponse(invalidResult("request"), 400);
    }
    if (new TextEncoder().encode(body).byteLength > maximumRequestBytes) {
      return jsonResponse(invalidResult("request"), 413);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(body) as unknown;
    } catch {
      return jsonResponse(invalidResult("request"), 400);
    }
    const parsed = parseNewsletterSubscriptionInput(decoded);
    if (!parsed.success) {
      return jsonResponse(parsed.result, 400);
    }

    let gatewayResult: "subscribed" | "duplicate";
    try {
      gatewayResult = await Reflect.apply(runtime.gateway.subscribe, runtime.gateway, [parsed.data]);
    } catch {
      return jsonResponse(providerErrorResult, 503);
    }
    if (gatewayResult === "subscribed") {
      return jsonResponse(fixedResult({ status: "SUBSCRIBED" }), 200);
    }
    if (gatewayResult === "duplicate") {
      return jsonResponse(fixedResult({ status: "DUPLICATE" }), 200);
    }
    return jsonResponse(providerErrorResult, 503);
  };
}
