import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";
import type {
  BrowserCheckoutQuote,
  CheckoutQuoteResult,
} from "@/commerce/checkout-service";
import type { ProviderCheckoutRouteResult } from "@/commerce/provider-checkout-orchestration";
import {
  parseCheckoutQuoteRequest,
  parseCheckoutRequest,
} from "@/domain/checkout";
import { ATTRIBUTION_COOKIE_NAME } from "@/growth/attribution-cookie";
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
    attributionCookie: string | null;
  }>) => Promise<CheckoutQuoteResult>;
  startSession: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    request: unknown;
    attributionCookie: string | null;
  }>) => Promise<ProviderCheckoutRouteResult>;
}>;

function attributionCookieFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (header === null || header.length > 8_192) return null;
  const values = header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 1 || part.slice(0, separator).trim() !== ATTRIBUTION_COOKIE_NAME) {
      return [];
    }
    return [part.slice(separator + 1).trim()];
  });
  if (
    values.length !== 1 ||
    values[0]!.length === 0 ||
    values[0]!.length > 2_048 ||
    !/^[A-Za-z0-9_.-]+$/u.test(values[0]!)
  ) return null;
  return values[0]!;
}

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

type PublicCheckoutQuote = Omit<BrowserCheckoutQuote, "lines"> & Readonly<{
  lines: readonly Readonly<{
    productId?: string;
    variantId?: string;
    sku?: string;
    variantLabel?: string;
    productName: string;
    packageForm?: string;
    quantity: number;
    unitAmountMinor: number;
    subtotalMinor: number;
    discountMinor: number;
    totalMinor: number;
  }>[];
}>;

function safeQuote(value: unknown): PublicCheckoutQuote | null {
  try {
    const baseKeys = [
      "status", "reviewRequired", "reasons", "currency", "subtotalMinor",
      "discountMinor", "shippingMinor", "taxMinor", "totalMinor", "lines",
    ] as const;
    const acquisitionKeys = ["promotionDiscountMinor", "referralDiscountMinor"] as const;
    const rewardKeys = [
      "rewardRedemptionPoints", "rewardRedemptionMinor", "pendingBaseEarnPoints",
      "rewardsBenefitAvailable", "rewardsUnavailableReason",
    ] as const;
    const allowedKeys = new Set<string>([...baseKeys, ...acquisitionKeys, ...rewardKeys]);
    if (!plainRecord(value) ||
      baseKeys.some((key) => !Object.hasOwn(value, key)) ||
      Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowedKeys.has(key))) {
      return null;
    }
    const hasAcquisition = acquisitionKeys.map((key) => Object.hasOwn(value, key));
    const hasRewards = rewardKeys.map((key) => Object.hasOwn(value, key));
    if (!hasAcquisition.every(Boolean) || !hasRewards.every(Boolean)) return null;
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
    if (!safeMoney(value.promotionDiscountMinor) ||
      !safeMoney(value.referralDiscountMinor)) return null;
    if (!safeMoney(value.rewardRedemptionPoints) ||
      !safeMoney(value.rewardRedemptionMinor) ||
      !safeMoney(value.pendingBaseEarnPoints) ||
      typeof value.rewardsBenefitAvailable !== "boolean" ||
      (value.rewardsUnavailableReason !== null &&
       !boundedText(value.rewardsUnavailableReason, 80))) return null;
    if ((value.promotionDiscountMinor as number) +
      (value.referralDiscountMinor as number) +
      (value.rewardRedemptionMinor as number) !== value.discountMinor) return null;
    let lineSubtotal = 0;
    let lineDiscount = 0;
    const seen = new Set<string>();
    const lines = value.lines.map((candidate) => {
      if (!plainRecord(candidate)) throw new Error("unsafe quote line");
      const isVariant = Object.hasOwn(candidate, "variantId");
      const allowedLineKeys = new Set(isVariant
        ? ["productId", "variantId", "sku", "variantLabel", "productName", "packageForm",
            "quantity", "unitAmountMinor", "subtotalMinor", "discountMinor", "totalMinor"]
        : ["productId", "productName", "packageForm", "quantity", "unitAmountMinor",
            "subtotalMinor", "discountMinor", "totalMinor"]);
      const requiredLineKeys = isVariant
        ? ["variantId", "sku", "variantLabel", "productName", "quantity", "unitAmountMinor",
            "subtotalMinor", "discountMinor", "totalMinor"]
        : [...allowedLineKeys];
      const identifier = isVariant ? candidate.variantId : candidate.productId;
      if (requiredLineKeys.some((key) => !Object.hasOwn(candidate, key)) ||
        Reflect.ownKeys(candidate).some((key) => typeof key !== "string" || !allowedLineKeys.has(key)) ||
        !isCanonicalUuid(identifier) || seen.has(identifier) ||
        (!isVariant && !isCanonicalUuid(candidate.productId)) ||
        (Object.hasOwn(candidate, "productId") && !isCanonicalUuid(candidate.productId)) ||
        !boundedText(candidate.productName) ||
        (Object.hasOwn(candidate, "packageForm") && !boundedText(candidate.packageForm)) ||
        (isVariant && (!boundedText(candidate.sku, 120) || !boundedText(candidate.variantLabel))) ||
        !Number.isSafeInteger(candidate.quantity) || (candidate.quantity as number) < 1 || (candidate.quantity as number) > 25 ||
        !safeMoney(candidate.unitAmountMinor) || !safeMoney(candidate.subtotalMinor) ||
        !safeMoney(candidate.discountMinor) || !safeMoney(candidate.totalMinor) ||
        candidate.subtotalMinor !== candidate.unitAmountMinor * (candidate.quantity as number) ||
        candidate.discountMinor > candidate.subtotalMinor ||
        candidate.totalMinor !== candidate.subtotalMinor - candidate.discountMinor
      ) throw new Error("unsafe quote line");
      seen.add(identifier as string);
      lineSubtotal += candidate.subtotalMinor;
      lineDiscount += candidate.discountMinor;
      return Object.freeze({
        ...(isVariant
          ? {
              variantId: candidate.variantId as string,
              sku: candidate.sku as string,
              variantLabel: candidate.variantLabel as string,
            }
          : { productId: candidate.productId as string }),
        productName: candidate.productName as string,
        ...(Object.hasOwn(candidate, "packageForm")
          ? { packageForm: candidate.packageForm as string }
          : {}),
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
      promotionDiscountMinor: value.promotionDiscountMinor,
      referralDiscountMinor: value.referralDiscountMinor,
      rewardRedemptionPoints: value.rewardRedemptionPoints,
      rewardRedemptionMinor: value.rewardRedemptionMinor,
      pendingBaseEarnPoints: value.pendingBaseEarnPoints,
      rewardsBenefitAvailable: value.rewardsBenefitAvailable,
      rewardsUnavailableReason: value.rewardsUnavailableReason,
      lines: Object.freeze(lines),
    });
  } catch {
    return null;
  }
}

const unavailableCodes = new Set([
  "pricing_coming_soon",
  "payment_mapping_missing",
  "unavailable",
  "invalid_currency",
]);

function safeUnavailableReasons(value: unknown): readonly Readonly<{
  variantId: string;
  code: "pricing_coming_soon" | "payment_mapping_missing" | "unavailable" | "invalid_currency";
}>[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const seen = new Set<string>();
  const reasons = value.map((candidate) => {
    if (!plainRecord(candidate) || !exactOwnKeys(candidate, ["variantId", "code"]) ||
      !isCanonicalUuid(candidate.variantId) || seen.has(candidate.variantId) ||
      typeof candidate.code !== "string" || !unavailableCodes.has(candidate.code)) {
      throw new Error("unsafe checkout-unavailable reason");
    }
    seen.add(candidate.variantId);
    return Object.freeze({
      variantId: candidate.variantId,
      code: candidate.code as "pricing_coming_soon" | "payment_mapping_missing" | "unavailable" | "invalid_currency",
    });
  });
  return Object.freeze(reasons);
}

function safePricingRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function safeCartCurrency(value: unknown): value is string | null {
  return value === null ||
    (typeof value === "string" && /^[A-Z]{3,8}$/u.test(value));
}

function safeCart(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!plainRecord(value) || !exactOwnKeys(value, [
    "items", "subtotalMinor", "currency", "taxMinor", "shippingMinor", "finalDiscountMinor",
  ]) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 50 ||
    !safeMoney(value.subtotalMinor) ||
    !safeCartCurrency(value.currency) ||
    value.taxMinor !== null || value.shippingMinor !== null || value.finalDiscountMinor !== null) return null;
  const seen = new Set<string>();
  let subtotal = 0;
  const items = value.items.map((candidate) => {
    if (!plainRecord(candidate)) throw new Error("unsafe cart item");
    const allowed = new Set([
      "variantId", "quantity", "available", "name", "packageForm", "variantLabel", "sku",
      "unitAmountMinor", "lineSubtotalMinor", "currency",
    ]);
    const required = [
      "variantId", "quantity", "available", "name", "variantLabel", "unitAmountMinor",
      "lineSubtotalMinor", "currency",
    ];
    if (required.some((key) => !Object.hasOwn(candidate, key)) ||
      Reflect.ownKeys(candidate).some((key) => typeof key !== "string" || !allowed.has(key)) ||
      !isCanonicalUuid(candidate.variantId) || seen.has(candidate.variantId) ||
      !Number.isSafeInteger(candidate.quantity) || (candidate.quantity as number) < 1 || (candidate.quantity as number) > 25 ||
      typeof candidate.available !== "boolean" ||
      (candidate.name !== null && !boundedText(candidate.name)) ||
      (Object.hasOwn(candidate, "packageForm") && candidate.packageForm !== null && !boundedText(candidate.packageForm)) ||
      (candidate.variantLabel !== null && !boundedText(candidate.variantLabel)) ||
      (Object.hasOwn(candidate, "sku") && candidate.sku !== null && !boundedText(candidate.sku, 120)) ||
      (candidate.unitAmountMinor !== null && !safeMoney(candidate.unitAmountMinor)) ||
      (candidate.lineSubtotalMinor !== null && !safeMoney(candidate.lineSubtotalMinor)) ||
      !safeCartCurrency(candidate.currency) ||
      (candidate.unitAmountMinor !== null && candidate.lineSubtotalMinor !== null &&
        candidate.lineSubtotalMinor !== candidate.unitAmountMinor * (candidate.quantity as number))) {
      throw new Error("unsafe cart item");
    }
    seen.add(candidate.variantId);
    subtotal += candidate.lineSubtotalMinor ?? 0;
    return Object.freeze({
      variantId: candidate.variantId,
      quantity: candidate.quantity,
      available: candidate.available,
      name: candidate.name,
      packageForm: Object.hasOwn(candidate, "packageForm") ? candidate.packageForm : null,
      variantLabel: candidate.variantLabel,
      sku: Object.hasOwn(candidate, "sku") ? candidate.sku : null,
      unitAmountMinor: candidate.unitAmountMinor,
      lineSubtotalMinor: candidate.lineSubtotalMinor,
      currency: candidate.currency,
    });
  });
  if (subtotal !== value.subtotalMinor) return null;
  const currencies = new Set(items.flatMap((item) =>
    item.currency === null ? [] : [item.currency as string]));
  const coherentCurrency = currencies.size === 1 ? [...currencies][0]! : null;
  if (value.currency !== coherentCurrency) return null;
  return Object.freeze({
    items: Object.freeze(items),
    subtotalMinor: value.subtotalMinor,
    currency: value.currency,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
  });
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
      const canonical = projected.lines.some((line) => line.variantId !== undefined);
      if (canonical && !safePricingRevision(result.pricingRevision)) {
        return response(503, { status: "quote_unavailable", component: "commerce" });
      }
      return projected.status === "ready"
        ? response(200, {
            status: "quoted",
            ...(canonical ? { pricingRevision: result.pricingRevision } : {}),
            quote: projected,
          })
        : response(200, {
            status: "review_required",
            ...(canonical ? { pricingRevision: result.pricingRevision } : {}),
            quote: projected,
          });
    }
    if (result.status === "loaded") {
      const projected = safeQuote(result.quoteSnapshot);
      if (projected === null) return response(409, { status: "conflict" });
      return projected.status === "ready"
        ? response(200, { status: "quoted", quote: projected })
        : response(200, { status: "review_required", quote: projected });
    }
    if (result.status === "review_rejected") return response(403, { status: "denied", reasons: ["review_rejected"] });
    if (result.status === "CHECKOUT_UNAVAILABLE") {
      const reasons = safeUnavailableReasons(result.reasons);
      return reasons === null
        ? response(503, { status: "quote_unavailable", component: "commerce" })
        : response(409, { status: "CHECKOUT_UNAVAILABLE", reasons });
    }
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
    if (result.status === "PRICE_CHANGED") {
      const cart = safeCart(result.cart);
      return safePricingRevision(result.pricingRevision) && cart !== null
        ? response(409, { status: "PRICE_CHANGED", pricingRevision: result.pricingRevision, cart })
        : response(503, { status: "unavailable" });
    }
    if (result.status === "CHECKOUT_UNAVAILABLE") {
      const reasons = safeUnavailableReasons(result.reasons);
      return reasons === null
        ? response(503, { status: "unavailable" })
        : response(409, { status: "CHECKOUT_UNAVAILABLE", reasons });
    }
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
): Promise<Readonly<{ ok: true; actor: Actor; idempotencyKey: string; body: unknown; attributionCookie: string | null }> | Readonly<{ ok: false; response: Response }>> {
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
    const parsed = operation === "checkout.quote"
      ? parseCheckoutQuoteRequest(body)
      : parseCheckoutRequest(body);
    if (!parsed.ok) return { ok: false, response: response(400, { status: "invalid_request" }) };
    return {
      ok: true,
      actor,
      idempotencyKey,
      body: parsed.value,
      attributionCookie: attributionCookieFromRequest(request),
    };
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
          attributionCookie: parsed.attributionCookie,
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
          attributionCookie: parsed.attributionCookie,
        }));
      } catch {
        return response(503, { status: "unavailable" });
      }
    },
  });
}
