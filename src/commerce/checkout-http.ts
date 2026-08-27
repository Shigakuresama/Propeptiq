import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";
import type {
  BrowserCheckoutQuote,
  CheckoutQuoteResult,
} from "@/commerce/checkout-service";
import type { ProviderCheckoutRouteResult } from "@/commerce/provider-checkout-orchestration";
import { parseCheckoutRequest } from "@/domain/checkout";
import { assertMutationOrigin } from "@/security/origin";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
  type RateLimitStore,
} from "@/security/rate-limit";

const MAX_BODY_BYTES = 32 * 1024;
const publicDenialReasons = new Set([
  "account_required",
  "buyer_blocked",
  "attestation_not_current",
  "product_inactive",
  "product_catalog_incomplete",
  "destination_blocked",
  "destination_unavailable",
  "inventory_unavailable",
  "payment_provider_unavailable",
  "review_rejected",
  "promotion_invalid",
  "promotion_inactive",
  "promotion_not_applicable",
  "promotion_currency_mismatch",
  "promotion_nonstackable",
]);

type Actor = Readonly<{ buyerUserId: string }>;

export type CheckoutHttpDependencies = Readonly<{
  environment: Readonly<{
    APP_ENV: "local" | "preview" | "production";
    APP_ORIGIN?: string;
  }>;
  resolveActor: () => Promise<Actor | null>;
  rateLimitSecret: string | null | undefined;
  rateLimitStore: RateLimitStore | null;
  now: () => Date;
  quoteCheckout: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    request: unknown;
  }>) => Promise<CheckoutQuoteResult>;
  startSession: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    request: unknown;
  }>) => Promise<ProviderCheckoutRouteResult>;
}>;

function response(status: number, body: Readonly<Record<string, unknown>>, retryAfter?: number) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  if (retryAfter !== undefined) headers.set("retry-after", String(retryAfter));
  return new Response(JSON.stringify(body), { status, headers });
}

function unavailableResponse(
  operation: "checkout.quote" | "checkout.session",
): Response {
  return operation === "checkout.quote"
    ? response(503, { status: "quote_unavailable", component: "commerce" })
    : response(503, { status: "unavailable" });
}

function exactOwnKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  const actual = (keys as string[]).toSorted();
  const wanted = [...expected].toSorted();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function boundedText(value: unknown, maximum = 240): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
}

function safeQuote(value: unknown): BrowserCheckoutQuote | null {
  try {
    if (!plainRecord(value) || !exactOwnKeys(value, [
      "status", "reviewRequired", "reasons", "currency", "subtotalMinor",
      "discountMinor", "shippingMinor", "taxMinor", "totalMinor", "lines",
    ])) return null;
    if (
      (value.status !== "ready" && value.status !== "review_required") ||
      typeof value.reviewRequired !== "boolean" ||
      value.reviewRequired !== (value.status === "review_required") ||
      value.currency !== "USD" ||
      !safeMoney(value.subtotalMinor) || !safeMoney(value.discountMinor) ||
      !safeMoney(value.shippingMinor) || !safeMoney(value.taxMinor) || !safeMoney(value.totalMinor) ||
      value.discountMinor > value.subtotalMinor ||
      value.totalMinor !== value.subtotalMinor - value.discountMinor + value.shippingMinor + value.taxMinor ||
      !Array.isArray(value.reasons) || value.reasons.length > 12 ||
      value.reasons.some((reason) => !boundedText(reason, 80)) ||
      !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 50
    ) return null;
    let lineSubtotal = 0;
    let lineDiscount = 0;
    const seen = new Set<string>();
    const lines = value.lines.map((candidate) => {
      if (!plainRecord(candidate) || !exactOwnKeys(candidate, [
        "productId", "productName", "packageForm", "quantity", "unitAmountMinor",
        "subtotalMinor", "discountMinor", "totalMinor",
      ]) || !isCanonicalUuid(candidate.productId) || seen.has(candidate.productId) ||
        !boundedText(candidate.productName) || !boundedText(candidate.packageForm) ||
        !Number.isSafeInteger(candidate.quantity) || (candidate.quantity as number) < 1 || (candidate.quantity as number) > 25 ||
        !safeMoney(candidate.unitAmountMinor) || !safeMoney(candidate.subtotalMinor) ||
        !safeMoney(candidate.discountMinor) || !safeMoney(candidate.totalMinor) ||
        candidate.subtotalMinor !== candidate.unitAmountMinor * (candidate.quantity as number) ||
        candidate.discountMinor > candidate.subtotalMinor ||
        candidate.totalMinor !== candidate.subtotalMinor - candidate.discountMinor
      ) throw new Error("unsafe quote line");
      seen.add(candidate.productId);
      lineSubtotal += candidate.subtotalMinor;
      lineDiscount += candidate.discountMinor;
      return Object.freeze({
        productId: candidate.productId,
        productName: candidate.productName,
        packageForm: candidate.packageForm,
        quantity: candidate.quantity as number,
        unitAmountMinor: candidate.unitAmountMinor,
        subtotalMinor: candidate.subtotalMinor,
        discountMinor: candidate.discountMinor,
        totalMinor: candidate.totalMinor,
      });
    });
    if (lineSubtotal !== value.subtotalMinor || lineDiscount !== value.discountMinor) return null;
    return Object.freeze({
      status: value.status,
      reviewRequired: value.reviewRequired,
      reasons: Object.freeze([...(value.reasons as string[])]),
      currency: "USD",
      subtotalMinor: value.subtotalMinor,
      discountMinor: value.discountMinor,
      shippingMinor: value.shippingMinor,
      taxMinor: value.taxMinor,
      totalMinor: value.totalMinor,
      lines: Object.freeze(lines),
    });
  } catch {
    return null;
  }
}

function safeReasons(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const reasons = value.map((reason) =>
    typeof reason === "string" && publicDenialReasons.has(reason)
      ? reason
      : "checkout_not_permitted",
  );
  return Object.freeze([...new Set(reasons)]);
}

function quoteResponse(result: unknown): Response {
  try {
    if (!plainRecord(result) || typeof result.status !== "string") {
      return response(503, { status: "quote_unavailable", component: "commerce" });
    }
    if (result.status === "quoted") {
      const projected = safeQuote(result.quote);
      if (projected === null) return response(503, { status: "quote_unavailable", component: "commerce" });
      return projected.status === "ready"
        ? response(200, { status: "quoted", quote: projected })
        : response(200, { status: "review_required", quote: projected });
    }
    if (result.status === "loaded") {
      const projected = safeQuote(result.quoteSnapshot);
      if (projected === null) return response(409, { status: "conflict" });
      return projected.status === "ready"
        ? response(200, { status: "quoted", quote: projected })
        : response(200, { status: "review_required", quote: projected });
    }
    if (result.status === "review_rejected") return response(403, { status: "denied", reasons: ["review_rejected"] });
    if (result.status === "denied") {
      const reasons = safeReasons(result.reasons);
      return reasons === null
        ? response(503, { status: "quote_unavailable", component: "commerce" })
        : response(403, { status: "denied", reasons });
    }
    if (result.status === "invalid_request") return response(400, { status: "invalid_request" });
    if (result.status === "idempotency_conflict") return response(409, { status: "idempotency_conflict" });
    if (result.status === "internal_conflict") return response(409, { status: "conflict" });
    if (result.status === "quote_unavailable" || result.status === "quote_invalid") {
      return result.component === "shipping" || result.component === "tax"
        ? response(503, { status: "quote_unavailable", component: result.component })
        : response(503, { status: "quote_unavailable", component: "commerce" });
    }
  } catch {
    // Getters and hostile injected results are deliberately collapsed below.
  }
  return response(503, { status: "quote_unavailable", component: "commerce" });
}

function safeHostedUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000 || !URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.username || url.password || url.hash) return false;
  return url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()));
}

function safeIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function sessionResponse(result: unknown): Response {
  try {
    if (!plainRecord(result) || typeof result.status !== "string") return response(503, { status: "unavailable" });
    if (result.status === "open") {
      if (!exactOwnKeys(result, ["status", "orderId", "url", "expiresAt"]) ||
        !isCanonicalUuid(result.orderId) || !safeHostedUrl(result.url) || !safeIso(result.expiresAt)) {
        return response(503, { status: "unavailable" });
      }
      return response(200, { status: "open", orderId: result.orderId, hostedUrl: result.url, expiresAt: result.expiresAt });
    }
    if (result.status === "review_required" || result.status === "provider_pending" || result.status === "expired") {
      if (!exactOwnKeys(result, ["status", "orderId"]) || !isCanonicalUuid(result.orderId)) return response(503, { status: "unavailable" });
      return response(result.status === "review_required" || result.status === "provider_pending" ? 202 : 410, {
        status: result.status,
        orderId: result.orderId,
      });
    }
    if (result.status === "failed") {
      if (!exactOwnKeys(result, result.orderId === undefined ? ["status"] : ["status", "orderId"]) ||
        (result.orderId !== undefined && !isCanonicalUuid(result.orderId))) return response(503, { status: "unavailable" });
      return response(410, result.orderId === undefined ? { status: "failed" } : { status: "failed", orderId: result.orderId });
    }
    const closed = new Map<string, readonly [number, string]>([
      ["provider_unknown", [202, "provider_unknown"]],
      ["facts_changed_retry", [409, "facts_changed_retry"]],
      ["idempotency_conflict", [409, "idempotency_conflict"]],
      ["conflict", [409, "conflict"]],
      ["invalid", [400, "invalid_request"]],
      ["unavailable", [503, "unavailable"]],
    ]);
    const mapped = closed.get(result.status);
    if (mapped && exactOwnKeys(result, ["status"])) return response(mapped[0], { status: mapped[1] });
  } catch {
    // Collapse hostile injected results.
  }
  return response(503, { status: "unavailable" });
}

async function parseRequest(
  request: Request,
  dependencies: CheckoutHttpDependencies,
  operation: "checkout.quote" | "checkout.session",
  limit: number,
): Promise<Readonly<{ ok: true; actor: Actor; idempotencyKey: string; body: unknown }> | Readonly<{ ok: false; response: Response }>> {
  try {
    assertMutationOrigin(request, dependencies.environment);
  } catch {
    return { ok: false, response: response(403, { status: "origin_denied" }) };
  }
  let actor: Actor | null;
  try {
    actor = await dependencies.resolveActor();
  } catch {
    actor = null;
  }
  if (actor === null || !plainRecord(actor) || !exactOwnKeys(actor, ["buyerUserId"]) || !isCanonicalUuid(actor.buyerUserId)) {
    return { ok: false, response: response(401, { status: "authentication_required" }) };
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!isCanonicalUuid(idempotencyKey)) return { ok: false, response: response(400, { status: "invalid_request" }) };
  const now = dependencies.now();
  if (!Number.isFinite(now.getTime()) || typeof dependencies.rateLimitSecret !== "string" || dependencies.rateLimitSecret.length < 32 || dependencies.rateLimitStore === null) {
    return { ok: false, response: unavailableResponse(operation) };
  }
  try {
    const decision = await consumeFixedWindowLimit({
      store: dependencies.rateLimitStore,
      scope: createRateLimitScope(actor.buyerUserId, operation, dependencies.rateLimitSecret),
      limit,
      windowMs: 60_000,
      now,
    });
    if (!decision.allowed) {
      const seconds = Math.max(1, Math.min(60, Math.ceil((new Date(decision.retryAt).getTime() - now.getTime()) / 1_000)));
      return { ok: false, response: response(429, { status: "rate_limited", retryAfter: seconds }, seconds) };
    }
  } catch {
    return { ok: false, response: unavailableResponse(operation) };
  }
  if (request.headers.get("content-type")?.toLowerCase() !== "application/json") {
    return { ok: false, response: response(400, { status: "invalid_request" }) };
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    return { ok: false, response: response(400, { status: "invalid_request" }) };
  }
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES) return { ok: false, response: response(400, { status: "invalid_request" }) };
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body = JSON.parse(decoded) as unknown;
    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok || parsed.value.promotionIds.length > 1) return { ok: false, response: response(400, { status: "invalid_request" }) };
    return { ok: true, actor, idempotencyKey, body: parsed.value };
  } catch {
    return { ok: false, response: response(400, { status: "invalid_request" }) };
  }
}

export function createCheckoutHttpHandlers(dependencies: CheckoutHttpDependencies) {
  return Object.freeze({
    async quote(request: Request): Promise<Response> {
      const parsed = await parseRequest(request, dependencies, "checkout.quote", 20);
      if (!parsed.ok) return parsed.response;
      try {
        return quoteResponse(await dependencies.quoteCheckout({
          buyerUserId: parsed.actor.buyerUserId,
          idempotencyKey: parsed.idempotencyKey,
          request: parsed.body,
        }));
      } catch {
        return response(503, { status: "quote_unavailable", component: "commerce" });
      }
    },
    async session(request: Request): Promise<Response> {
      const parsed = await parseRequest(request, dependencies, "checkout.session", 6);
      if (!parsed.ok) return parsed.response;
      try {
        return sessionResponse(await dependencies.startSession({
          buyerUserId: parsed.actor.buyerUserId,
          idempotencyKey: parsed.idempotencyKey,
          request: parsed.body,
        }));
      } catch {
        return response(503, { status: "unavailable" });
      }
    },
  });
}
