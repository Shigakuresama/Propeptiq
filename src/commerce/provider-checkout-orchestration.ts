import "server-only";

import {
  projectAuthoritativeCheckoutPlan,
  type AuthoritativeCheckoutPlan,
  type AuthoritativeCheckoutPlanData,
  type CheckoutPrepareResult,
  type CheckoutQuoteResult,
  type CheckoutSessionQuoteResult,
  type DefiniteFailureReleaseInput,
  type DefiniteFailureReleaseResult,
} from "@/commerce/checkout-service";
import type { ProviderPreparation } from "@/commerce/checkout-ports";
import { projectProviderExecutionContextV1, type ProviderExecutionContextV1 } from "@/commerce/provider-context";
import {
  buildStripeCheckoutRequestV1,
  buildStripeCheckoutRequestV2,
  createStripeProviderBindingSnapshotV2,
  hashProviderCheckoutRequest,
  type StripeCheckoutRequest,
  type StripeProviderBindingSnapshotV2,
} from "@/commerce/provider-contracts";
import type { CheckoutProviderResult } from "@/commerce/payment-provider";
import type { StripeBindingVerifier } from "@/commerce/stripe-payment-provider";
import type {
  DurableCheckoutRequest,
  ProviderSessionCasResult,
  ProviderSessionRepository,
} from "@/db/repositories/provider-session-repository";
import {
  isCanonicalUuid,
  isSha256,
  type Sha256Hasher,
} from "@/commerce/checkout-identity";
import { parseCheckoutRequest } from "@/domain/checkout";

type CheckoutServicePort = Readonly<{
  quote: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    paymentProviderAvailable: boolean;
    request: unknown;
    attributionCookie?: string | null;
  }>) => Promise<CheckoutQuoteResult>;
  quoteForSession?: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    paymentProviderAvailable: boolean;
    request: unknown;
    attributionCookie?: string | null;
  }>) => Promise<CheckoutSessionQuoteResult>;
  revalidateCanonicalForProviderCreate?: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    paymentProviderAvailable: boolean;
    request: unknown;
    expectedStoredPricingRevision: string;
    attributionCookie?: string | null;
  }>) => Promise<CheckoutSessionQuoteResult>;
  prepare: (
    plan: AuthoritativeCheckoutPlan,
    providerPreparation: unknown,
  ) => Promise<
    | CheckoutPrepareResult
    | Readonly<{ status: "invalid_plan" | "invalid_provider_preparation" }>
  >;
}>;

export type ProviderCheckoutSessionRepository = Pick<
  ProviderSessionRepository,
  "load" | "recordOpen" | "recordUnknown"
>;

export type ProviderCheckoutRouteResult =
  | Readonly<{ status: "open"; orderId: string; url: string; expiresAt: string }>
  | Readonly<{ status: "review_required"; orderId: string }>
  | Readonly<{ status: "provider_pending"; orderId: string }>
  | Readonly<{ status: "provider_unknown" }>
  | Readonly<{ status: "failed"; orderId?: string }>
  | Readonly<{ status: "expired"; orderId: string }>
  | Readonly<{ status: "facts_changed_retry" }>
  | Readonly<{ status: "idempotency_conflict" }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "conflict" }>
  | Extract<CheckoutSessionQuoteResult,
      Readonly<{ status: "PRICE_CHANGED" | "CHECKOUT_UNAVAILABLE" }>>;

type ExactProviderCheckoutRequest = Readonly<{
  request: StripeCheckoutRequest;
  providerBindingSnapshot: StripeProviderBindingSnapshotV2 | null;
}>;

function requestFromPlan(
  plan: AuthoritativeCheckoutPlanData,
  replay: Readonly<{
    provider: "stripe" | "local_test";
    providerCustomerEmail: string;
    providerOrigin: string;
    providerExpiresAt: string;
  }>,
): ExactProviderCheckoutRequest | null {
  if (plan.totals === null) return null;
  if (plan.kind === "canonical_variant") {
    const totalByVariant = new Map(
      plan.totals.lines.map((line) => [line.productId, line] as const),
    );
    const factByVariant = new Map(
      plan.facts.items.map((line) => [line.variantId, line] as const),
    );
    if (
      totalByVariant.size !== plan.effectiveLines.length ||
      factByVariant.size !== plan.effectiveLines.length
    ) return null;
    const snapshot = createStripeProviderBindingSnapshotV2(
      plan.effectiveLines.map((line) => {
        const total = totalByVariant.get(line.variantId);
        const fact = factByVariant.get(line.variantId);
        if (total === undefined || fact === undefined) return null;
        return {
          variantId: line.variantId,
          productId: line.productId,
          sku: line.sku,
          productName: fact.productName,
          variantLabel: line.variantLabel,
          requestedQuantity: line.quantity,
          netLineMinor: total.totalMinor,
          baseUnitMinor: line.baseUnitMinor,
          currency: "USD" as const,
          priceBookId: line.priceId,
          priceVersion: line.priceVersion,
          stripeProductId: line.stripeProductId,
          stripePriceId: line.stripePriceId,
        };
      }),
    );
    if (!snapshot.ok) return null;
    const result = buildStripeCheckoutRequestV2({
      provider: replay.provider,
      providerRequestSchemaVersion: 2,
      orderId: plan.identity.orderId,
      attemptId: plan.identity.attemptId,
      providerCustomerEmail: replay.providerCustomerEmail,
      providerOrigin: replay.providerOrigin,
      providerExpiresAt: replay.providerExpiresAt,
      currency: "USD",
      destination: plan.request.destination,
      lines: snapshot.value.lines,
      shippingMinor: plan.totals.shippingMinor,
      taxMinor: plan.totals.taxMinor,
      totalMinor: plan.totals.totalMinor,
    });
    return result.ok
      ? Object.freeze({
          request: result.value,
          providerBindingSnapshot: snapshot.value,
        })
      : null;
  }
  const result = buildStripeCheckoutRequestV1({
    provider: replay.provider,
    providerRequestSchemaVersion: 1,
    orderId: plan.identity.orderId,
    attemptId: plan.identity.attemptId,
    providerCustomerEmail: replay.providerCustomerEmail,
    providerOrigin: replay.providerOrigin,
    providerExpiresAt: replay.providerExpiresAt,
    currency: "USD",
    destination: plan.request.destination,
    lines: plan.browserQuote.lines.map((line) => ({
      productId: line.productId ?? line.variantId!,
      productName: line.productName,
      packageForm: line.packageForm,
      purchasedQuantity: line.quantity,
      postDiscountTotalMinor: line.totalMinor,
    })),
    shippingMinor: plan.totals.shippingMinor,
    taxMinor: plan.totals.taxMinor,
    totalMinor: plan.totals.totalMinor,
  });
  return result.ok
    ? Object.freeze({ request: result.value, providerBindingSnapshot: null })
    : null;
}

function requestFromDurable(
  durable: DurableCheckoutRequest,
): ExactProviderCheckoutRequest | null {
  const common = {
    provider: durable.provider,
    orderId: durable.orderId,
    attemptId: durable.attemptId,
    providerCustomerEmail: durable.providerCustomerEmail,
    providerOrigin: durable.providerOrigin,
    providerExpiresAt: durable.providerExpiresAt,
    currency: durable.currency,
    destination: durable.destination,
    shippingMinor: durable.shippingMinor,
    taxMinor: durable.taxMinor,
    totalMinor: durable.totalMinor,
  };
  if (durable.providerRequestSchemaVersion === 1) {
    const result = buildStripeCheckoutRequestV1({
      ...common,
      providerRequestSchemaVersion: 1,
      lines: durable.lines,
    });
    return result.ok
      ? Object.freeze({ request: result.value, providerBindingSnapshot: null })
      : null;
  }
  const result = buildStripeCheckoutRequestV2({
    ...common,
    providerRequestSchemaVersion: 2,
    lines: durable.providerBindingSnapshot.lines,
  });
  return result.ok
    ? Object.freeze({
        request: result.value,
        providerBindingSnapshot: durable.providerBindingSnapshot,
      })
    : null;
}

function preparationExpiry(authoritativeAt: Date): string | null {
  const timestamp = authoritativeAt.getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(Math.floor(timestamp / 1000) * 1000 + 60 * 60 * 1000).toISOString();
}

function terminalLoaded(
  quote: CheckoutQuoteResult,
): ProviderCheckoutRouteResult | null {
  if (quote.status !== "loaded") return null;
  if (quote.attemptStatus === "completed") {
    return Object.freeze({ status: "provider_pending", orderId: quote.orderId });
  }
  if (quote.attemptStatus === "expired") {
    return Object.freeze({ status: "expired", orderId: quote.orderId });
  }
  if (quote.attemptStatus === "failed") {
    return Object.freeze({ status: "failed", orderId: quote.orderId });
  }
  if (
    quote.attemptStatus === "created" &&
    quote.orderState === "eligibility_review"
  ) {
    return Object.freeze({ status: "review_required", orderId: quote.orderId });
  }
  return null;
}

function casPermitsSafeResult(result: ProviderSessionCasResult): boolean {
  return result.status === "applied" || result.status === "idempotent";
}

export function createProviderCheckoutOrchestrator(input: Readonly<{
  checkoutService: CheckoutServicePort;
  providerSessionRepository: ProviderCheckoutSessionRepository;
  releaseDefiniteFailure: (
    evidence: DefiniteFailureReleaseInput,
  ) => Promise<DefiniteFailureReleaseResult>;
  bindingVerifier?: StripeBindingVerifier | null;
  sha256: Sha256Hasher;
}>) {
  async function verifyBindings(
    provider: "stripe" | "local_test",
    snapshot: StripeProviderBindingSnapshotV2 | null,
  ): Promise<boolean> {
    if (provider === "local_test") return snapshot !== null;
    if (snapshot === null || input.bindingVerifier == null) return false;
    try {
      return (await input.bindingVerifier.verifyBindings(snapshot)).status === "verified";
    } catch {
      return false;
    }
  }

  async function markUnknown(
    durable: DurableCheckoutRequest,
    knownProviderSessionId: string | null,
    integrityFailure: boolean,
  ): Promise<void> {
    try {
      await input.providerSessionRepository.recordUnknown(durable, {
        knownProviderSessionId,
        integrityFailure,
      });
    } catch {
      // A persistence failure after provider work remains unknown and is retried
      // from the same durable request/key on the next invocation.
    }
  }

  async function verifiedDurableRequest(
    durable: DurableCheckoutRequest,
  ): Promise<ExactProviderCheckoutRequest | null> {
    try {
      const exact = requestFromDurable(durable);
      if (exact === null) return null;
      const rebuiltHash = await hashProviderCheckoutRequest(
        {
          provider: durable.provider,
          providerRequestSchemaVersion: durable.providerRequestSchemaVersion,
          request: exact.request,
          ...(durable.providerRequestSchemaVersion === 2
            ? { providerBindingSnapshot: durable.providerBindingSnapshot }
            : {}),
        },
        input.sha256,
      );
      return rebuiltHash === durable.providerRequestHash ? exact : null;
    } catch {
      return null;
    }
  }

  async function processDurable(
    durable: DurableCheckoutRequest,
    contextValue: ProviderExecutionContextV1,
  ): Promise<ProviderCheckoutRouteResult> {
    if (durable.attemptStatus === "completed") {
      return Object.freeze({ status: "provider_pending", orderId: durable.orderId });
    }
    if (durable.attemptStatus === "expired") {
      return Object.freeze({ status: "expired", orderId: durable.orderId });
    }
    if (durable.attemptStatus === "failed") {
      return Object.freeze({ status: "failed", orderId: durable.orderId });
    }
    const context = projectProviderExecutionContextV1(contextValue);
    if (context === null) return Object.freeze({ status: "invalid" });
    const exact = await verifiedDurableRequest(durable);
    const adapter = context.adapter;
    if (
      exact === null ||
      !context.sessionRecoveryAvailable ||
      adapter === null ||
      adapter.context.provider !== durable.provider ||
      adapter.context.livemode !== durable.providerLivemode ||
      adapter.context.scope !== durable.providerScope
    ) {
      await markUnknown(durable, durable.providerSessionId, true);
      return Object.freeze({ status: "provider_unknown" });
    }
    const expectedContext = Object.freeze({
      provider: durable.provider,
      livemode: durable.providerLivemode,
      scope: durable.providerScope,
    });
    const operation =
      durable.providerSessionId === null &&
      (durable.attemptStatus === "created" || durable.attemptStatus === "provider_unknown")
        ? "create"
        : durable.providerSessionId !== null &&
            (durable.attemptStatus === "open" || durable.attemptStatus === "provider_unknown")
          ? "retrieve"
          : null;
    if (operation === null) {
      await markUnknown(durable, durable.providerSessionId, true);
      return Object.freeze({ status: "provider_unknown" });
    }
    if (
      operation === "create" &&
      durable.providerRequestSchemaVersion === 2 &&
      !(await verifyBindings(durable.provider, durable.providerBindingSnapshot))
    ) {
      await markUnknown(durable, durable.providerSessionId, false);
      return Object.freeze({ status: "provider_unknown" });
    }
    let providerResult: CheckoutProviderResult;
    try {
      providerResult = operation === "create"
        ? await adapter.createCheckoutSession(
            exact.request,
            durable.providerIdempotencyKey,
          )
        : await adapter.retrieveCheckoutSession({
            knownProviderSessionId: durable.providerSessionId!,
            expectedRequest: exact.request,
            expectedProviderContext: expectedContext,
          });
    } catch {
      await markUnknown(durable, durable.providerSessionId, false);
      return Object.freeze({ status: "provider_unknown" });
    }

    if (providerResult.status === "open") {
      try {
        const cas = await input.providerSessionRepository.recordOpen(
          durable,
          providerResult.session.providerSessionId,
        );
        return casPermitsSafeResult(cas) && providerResult.session.hostedUrl !== null
          ? Object.freeze({
              status: "open" as const,
              orderId: durable.orderId,
              url: providerResult.session.hostedUrl,
              expiresAt: durable.providerExpiresAt,
            })
          : Object.freeze({ status: "provider_unknown" as const });
      } catch {
        return Object.freeze({ status: "provider_unknown" });
      }
    }
    if (providerResult.status === "provider_pending") {
      try {
        const cas = await input.providerSessionRepository.recordUnknown(durable, {
          knownProviderSessionId: providerResult.session.providerSessionId,
          integrityFailure: false,
        });
        return cas.status === "conflict" || cas.status === "nonpayable"
          ? Object.freeze({ status: "provider_unknown" as const })
          : Object.freeze({
              status: "provider_pending" as const,
              orderId: durable.orderId,
            });
      } catch {
        return Object.freeze({ status: "provider_unknown" });
      }
    }
    if (providerResult.status === "verified_expired") {
      if (operation !== "retrieve") {
        await markUnknown(durable, providerResult.session.providerSessionId, true);
        return Object.freeze({ status: "provider_unknown" });
      }
      try {
        const released = await input.releaseDefiniteFailure({
          authority: "authoritative_provider_terminal",
          cause: "verified_expiry",
          providerEvidenceId: providerResult.session.providerSessionId,
          providerSessionId: providerResult.session.providerSessionId,
          providerLivemode: durable.providerLivemode,
          providerScope: durable.providerScope,
          amountMinor: durable.totalMinor,
          currency: durable.currency,
          attemptId: durable.attemptId,
          orderId: durable.orderId,
          provider: durable.provider,
          providerIdempotencyKey: durable.providerIdempotencyKey,
          targetAttemptStatus: "expired",
        });
        if (released.status === "released" || released.status === "already_released") {
          return Object.freeze({ status: "expired", orderId: durable.orderId });
        }
        return released.status === "payment_verified"
          ? Object.freeze({ status: "provider_pending", orderId: durable.orderId })
          : Object.freeze({ status: "provider_unknown" });
      } catch {
        return Object.freeze({ status: "provider_unknown" });
      }
    }
    if (providerResult.status === "definite_rejection") {
      if (operation !== "create") {
        await markUnknown(durable, durable.providerSessionId, true);
        return Object.freeze({ status: "provider_unknown" });
      }
      try {
        const released = await input.releaseDefiniteFailure({
          authority: "authoritative_provider_terminal",
          cause: "definite_rejection",
          providerEvidenceId:
            providerResult.providerRequestId ?? providerResult.evidenceCode,
          attemptId: durable.attemptId,
          orderId: durable.orderId,
          provider: durable.provider,
          providerIdempotencyKey: durable.providerIdempotencyKey,
          targetAttemptStatus: "failed",
        });
        return released.status === "released" || released.status === "already_released"
          ? Object.freeze({ status: "failed", orderId: durable.orderId })
          : released.status === "payment_verified"
            ? Object.freeze({ status: "provider_pending", orderId: durable.orderId })
            : Object.freeze({ status: "provider_unknown" });
      } catch {
        return Object.freeze({ status: "provider_unknown" });
      }
    }
    await markUnknown(
      durable,
      providerResult.knownProviderSessionId,
      providerResult.evidenceCode === "provider_context_mismatch" ||
        providerResult.evidenceCode === "provider_response_mismatch",
    );
    return Object.freeze({ status: "provider_unknown" });
  }

  function sameJson(left: unknown, right: unknown): boolean {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  function exactReplayRecord(
    value: unknown,
    keys: readonly string[],
  ): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const own = Reflect.ownKeys(value);
    return own.length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)) &&
      own.every((key) => typeof key === "string" && keys.includes(key));
  }

  function replayMoney(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
  }

  function replayText(value: unknown, maximum: number): value is string {
    return typeof value === "string" && value.length > 0 &&
      value.length <= maximum && value.trim() === value &&
      !/[\u0000-\u001f\u007f]/u.test(value);
  }

  function safePriceChangedCart(value: unknown): boolean {
    try {
      if (!exactReplayRecord(value, [
        "items", "subtotalMinor", "currency", "taxMinor", "shippingMinor",
        "finalDiscountMinor",
      ]) || !Array.isArray(value.items) || value.items.length < 1 ||
        value.items.length > 50 || !replayMoney(value.subtotalMinor) ||
        (value.currency !== null &&
          (typeof value.currency !== "string" ||
            !/^[A-Z]{3}$/u.test(value.currency))) ||
        value.taxMinor !== null || value.shippingMinor !== null ||
        value.finalDiscountMinor !== null) return false;
      const seen = new Set<string>();
      const currencies = new Set<string>();
      let subtotalMinor = 0;
      for (let index = 0; index < value.items.length; index += 1) {
        if (!Object.hasOwn(value.items, index)) return false;
        const line = value.items[index];
        if (!exactReplayRecord(line, [
          "variantId", "quantity", "available", "name", "packageForm",
          "variantLabel", "sku", "unitAmountMinor", "lineSubtotalMinor",
          "currency",
        ]) || !isCanonicalUuid(line.variantId) || seen.has(line.variantId) ||
          !Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 ||
          (line.quantity as number) > 25 || typeof line.available !== "boolean" ||
          (line.name !== null && !replayText(line.name, 240)) ||
          (line.packageForm !== null && !replayText(line.packageForm, 240)) ||
          (line.variantLabel !== null && !replayText(line.variantLabel, 240)) ||
          (line.sku !== null && !replayText(line.sku, 120)) ||
          (line.unitAmountMinor !== null && !replayMoney(line.unitAmountMinor)) ||
          (line.lineSubtotalMinor !== null && !replayMoney(line.lineSubtotalMinor)) ||
          (line.currency !== null &&
            (typeof line.currency !== "string" ||
              !/^[A-Z]{3}$/u.test(line.currency))) ||
          (line.unitAmountMinor !== null && line.lineSubtotalMinor !== null &&
            line.lineSubtotalMinor !==
              line.unitAmountMinor * (line.quantity as number))) return false;
        const nextSubtotal = subtotalMinor + (line.lineSubtotalMinor ?? 0);
        if (!Number.isSafeInteger(nextSubtotal)) return false;
        subtotalMinor = nextSubtotal;
        if (line.currency !== null) currencies.add(line.currency);
        seen.add(line.variantId);
      }
      const coherentCurrency = currencies.size === 1
        ? [...currencies][0]!
        : null;
      return subtotalMinor === value.subtotalMinor &&
        value.currency === coherentCurrency;
    } catch {
      return false;
    }
  }

  function safeCheckoutUnavailableReasons(value: unknown): boolean {
    try {
      if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
        return false;
      }
      const seen = new Set<string>();
      const allowed = new Set([
        "pricing_coming_soon",
        "payment_mapping_missing",
        "unavailable",
        "invalid_currency",
      ]);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) return false;
        const reason = value[index];
        if (!exactReplayRecord(reason, ["variantId", "code"]) ||
          !isCanonicalUuid(reason.variantId) || seen.has(reason.variantId) ||
          typeof reason.code !== "string" || !allowed.has(reason.code)) {
          return false;
        }
        seen.add(reason.variantId);
      }
      return true;
    } catch {
      return false;
    }
  }

  function immutableReplayMatches(
    initial: DurableCheckoutRequest,
    reloaded: DurableCheckoutRequest,
    initialExact: ExactProviderCheckoutRequest,
    reloadedExact: ExactProviderCheckoutRequest,
  ): boolean {
    return initial.buyerUserId === reloaded.buyerUserId &&
      initial.idempotencyKey === reloaded.idempotencyKey &&
      initial.orderId === reloaded.orderId &&
      initial.attemptId === reloaded.attemptId &&
      initial.requestHash === reloaded.requestHash &&
      initial.provider === reloaded.provider &&
      initial.providerIdempotencyKey === reloaded.providerIdempotencyKey &&
      initial.providerRequestHash === reloaded.providerRequestHash &&
      initial.providerExpiresAt === reloaded.providerExpiresAt &&
      initial.providerCustomerEmail === reloaded.providerCustomerEmail &&
      initial.providerOrigin === reloaded.providerOrigin &&
      initial.providerRequestSchemaVersion === reloaded.providerRequestSchemaVersion &&
      initial.providerLivemode === reloaded.providerLivemode &&
      initial.providerScope === reloaded.providerScope &&
      initial.currency === reloaded.currency &&
      sameJson(initialExact, reloadedExact);
  }

  async function guardProviderlessCanonicalCreate(
    durable: DurableCheckoutRequest,
    contextValue: ProviderExecutionContextV1,
    startInput: Readonly<{
      idempotencyKey: string;
      request: unknown;
      attributionCookie?: string | null;
    }>,
    expectedStoredPricingRevision: unknown,
  ): Promise<ProviderCheckoutRouteResult> {
    const providerlessV2 = durable.providerRequestSchemaVersion === 2 &&
      durable.providerSessionId === null &&
      (durable.attemptStatus === "created" ||
        durable.attemptStatus === "provider_unknown");
    if (!providerlessV2) return processDurable(durable, contextValue);
    if (durable.orderState !== "checkout_pending") {
      return Object.freeze({ status: "conflict" });
    }

    const context = projectProviderExecutionContextV1(contextValue);
    const exactDurable = await verifiedDurableRequest(durable);
    if (
      context === null ||
      !context.checkoutCreationAvailable ||
      !context.sessionRecoveryAvailable ||
      context.adapter === null ||
      context.provider === null ||
      context.expectedLivemode === null ||
      context.providerScope === null ||
      context.buyerUserId !== durable.buyerUserId ||
      startInput.idempotencyKey !== durable.idempotencyKey ||
      !isCanonicalUuid(durable.orderId) ||
      !isCanonicalUuid(durable.attemptId) ||
      !isSha256(durable.requestHash) ||
      !isSha256(durable.providerRequestHash) ||
      durable.providerIdempotencyKey !== `checkout_attempt:${durable.attemptId}` ||
      durable.provider !== context.provider ||
      durable.providerLivemode !== context.expectedLivemode ||
      durable.providerScope !== context.providerScope ||
      context.adapter.context.provider !== durable.provider ||
      context.adapter.context.livemode !== durable.providerLivemode ||
      context.adapter.context.scope !== durable.providerScope ||
      exactDurable === null ||
      !isSha256(expectedStoredPricingRevision) ||
      input.checkoutService.revalidateCanonicalForProviderCreate === undefined
    ) {
      return Object.freeze({ status: "conflict" });
    }

    let guarded: CheckoutSessionQuoteResult;
    try {
      guarded = await input.checkoutService.revalidateCanonicalForProviderCreate({
        buyerUserId: context.buyerUserId,
        idempotencyKey: startInput.idempotencyKey,
        paymentProviderAvailable: context.checkoutCreationAvailable,
        request: startInput.request,
        expectedStoredPricingRevision,
        ...(startInput.attributionCookie === undefined
          ? {}
          : { attributionCookie: startInput.attributionCookie }),
      });
    } catch {
      return Object.freeze({ status: "conflict" });
    }

    if (guarded.status === "PRICE_CHANGED") {
      return isSha256(guarded.pricingRevision) &&
        safePriceChangedCart(guarded.cart)
        ? guarded
        : Object.freeze({ status: "conflict" });
    }
    if (guarded.status === "CHECKOUT_UNAVAILABLE") {
      return safeCheckoutUnavailableReasons(guarded.reasons)
        ? guarded
        : Object.freeze({ status: "conflict" });
    }
    if (guarded.status === "invalid_request") {
      return Object.freeze({ status: "invalid" });
    }
    if (
      guarded.status === "internal_conflict" ||
      guarded.status === "idempotency_conflict" ||
      guarded.status === "loaded" ||
      guarded.status === "review_rejected"
    ) return Object.freeze({ status: "conflict" });
    if (guarded.status === "denied") {
      return Object.freeze({
        status: guarded.reasons.includes("payment_provider_unavailable")
          ? ("unavailable" as const)
          : ("invalid" as const),
      });
    }
    if (
      guarded.status === "quote_invalid" ||
      guarded.status === "quote_unavailable"
    ) return Object.freeze({ status: "unavailable" });
    if (guarded.status !== "quoted") {
      return Object.freeze({ status: "conflict" });
    }

    const plan = projectAuthoritativeCheckoutPlan(guarded.plan);
    if (
      plan === null ||
      plan.kind !== "canonical_variant" ||
      !isSha256(guarded.pricingRevision) ||
      guarded.cart === undefined ||
      !safePriceChangedCart(guarded.cart)
    ) return Object.freeze({ status: "conflict" });
    const priceChanged = Object.freeze({
      status: "PRICE_CHANGED" as const,
      pricingRevision: guarded.pricingRevision,
      cart: guarded.cart,
    });
    if (
      !plan.decision.permitted ||
      plan.decision.reviewRequired ||
      guarded.quote.status !== "ready" ||
      plan.totals === null
    ) return priceChanged;

    let freshExact: ExactProviderCheckoutRequest | null = null;
    let freshHash: string | null = null;
    try {
      freshExact = requestFromPlan(plan, {
        provider: durable.provider,
        providerCustomerEmail: durable.providerCustomerEmail,
        providerOrigin: durable.providerOrigin,
        providerExpiresAt: durable.providerExpiresAt,
      });
      freshHash = freshExact === null
        ? null
        : await hashProviderCheckoutRequest(
            {
              provider: durable.provider,
              providerRequestSchemaVersion: 2,
              request: freshExact.request,
              providerBindingSnapshot: freshExact.providerBindingSnapshot!,
            },
            input.sha256,
          );
    } catch {
      return Object.freeze({ status: "conflict" });
    }
    if (
      freshExact === null ||
      freshExact.providerBindingSnapshot === null ||
      freshHash !== durable.providerRequestHash ||
      plan.identity.orderId !== durable.orderId ||
      plan.identity.attemptId !== durable.attemptId ||
      plan.buyerUserId !== durable.buyerUserId ||
      plan.idempotencyKey !== durable.idempotencyKey ||
      plan.requestHash !== durable.requestHash ||
      !sameJson(freshExact.request, exactDurable.request) ||
      !sameJson(
        freshExact.providerBindingSnapshot,
        durable.providerBindingSnapshot,
      )
    ) return priceChanged;

    let reloaded: DurableCheckoutRequest | null;
    try {
      reloaded = await input.providerSessionRepository.load({
        buyerUserId: context.buyerUserId,
        idempotencyKey: startInput.idempotencyKey,
      });
    } catch {
      return Object.freeze({ status: "conflict" });
    }
    if (reloaded === null) return Object.freeze({ status: "conflict" });
    const reloadedExact = await verifiedDurableRequest(reloaded);
    if (
      reloadedExact === null ||
      !immutableReplayMatches(durable, reloaded, exactDurable, reloadedExact)
    ) return Object.freeze({ status: "conflict" });
    const terminal = reloaded.attemptStatus === "completed" ||
      reloaded.attemptStatus === "expired" ||
      reloaded.attemptStatus === "failed";
    const knownSession = reloaded.providerSessionId !== null &&
      (reloaded.attemptStatus === "open" ||
        reloaded.attemptStatus === "provider_unknown");
    const stillProviderless = reloaded.providerSessionId === null &&
      reloaded.orderState === "checkout_pending" &&
      (reloaded.attemptStatus === "created" ||
        reloaded.attemptStatus === "provider_unknown");
    return terminal || knownSession || stillProviderless
      ? processDurable(reloaded, contextValue)
      : Object.freeze({ status: "conflict" });
  }

  return Object.freeze({
    async start(startInput: Readonly<{
      context: ProviderExecutionContextV1;
      idempotencyKey: string;
      request: unknown;
      attributionCookie?: string | null;
    }>): Promise<ProviderCheckoutRouteResult> {
      const context = projectProviderExecutionContextV1(startInput.context);
      if (context === null) return Object.freeze({ status: "invalid" });
      for (let quoteAttempt = 0; quoteAttempt < 3; quoteAttempt += 1) {
        const canonicalSessionRequest = parseCheckoutRequest(startInput.request).ok;
        const quoteOperation = canonicalSessionRequest &&
          input.checkoutService.quoteForSession !== undefined
          ? input.checkoutService.quoteForSession
          : input.checkoutService.quote;
        const quote = await quoteOperation({
          buyerUserId: context.buyerUserId,
          idempotencyKey: startInput.idempotencyKey,
          paymentProviderAvailable: context.checkoutCreationAvailable,
          request: startInput.request,
          ...(startInput.attributionCookie === undefined
            ? {}
            : { attributionCookie: startInput.attributionCookie }),
        });
        if (quote.status === "invalid_request") return Object.freeze({ status: "invalid" });
        if (quote.status === "PRICE_CHANGED" || quote.status === "CHECKOUT_UNAVAILABLE") {
          return quote;
        }
        const terminal = terminalLoaded(quote);
        if (terminal !== null) return terminal;
        if (quote.status === "idempotency_conflict") {
          return Object.freeze({ status: "idempotency_conflict" });
        }
        if (quote.status === "internal_conflict") return Object.freeze({ status: "conflict" });
        if (quote.status === "denied") {
          return Object.freeze({
            status: quote.reasons.includes("payment_provider_unavailable")
              ? ("unavailable" as const)
              : ("invalid" as const),
          });
        }
        if (quote.status === "quote_unavailable" || quote.status === "quote_invalid") {
          return Object.freeze({ status: "unavailable" });
        }
        if (quote.status === "loaded") {
          const durable = await input.providerSessionRepository.load({
            buyerUserId: context.buyerUserId,
            idempotencyKey: startInput.idempotencyKey,
          });
          return durable === null
            ? Object.freeze({ status: "conflict" })
            : guardProviderlessCanonicalCreate(
                durable,
                startInput.context,
                startInput,
                quote.pricingRevision,
              );
        }
        const plan = projectAuthoritativeCheckoutPlan(quote.plan);
        if (plan === null) return Object.freeze({ status: "conflict" });
        if (!plan.decision.permitted) {
          const prepared = await input.checkoutService.prepare(
            quote.plan,
            null,
          );
          if (prepared.status === "facts_changed_retry") continue;
          if (prepared.status === "idempotency_conflict") {
            return Object.freeze({ status: "idempotency_conflict" });
          }
          if (prepared.status === "review_required") {
            return Object.freeze({ status: "review_required", orderId: prepared.orderId });
          }
          if (prepared.status === "review_rejected") {
            return Object.freeze({ status: "failed", orderId: prepared.orderId });
          }
          return Object.freeze({ status: "conflict" });
        }
        if (
          !context.checkoutCreationAvailable ||
          context.provider === null ||
          context.expectedLivemode === null ||
          context.providerScope === null ||
          context.trustedOrigin === null
        ) {
          return Object.freeze({ status: "unavailable" });
        }
        const expiry = preparationExpiry(plan.authoritativeAt);
        if (expiry === null) return Object.freeze({ status: "conflict" });
        const exact = requestFromPlan(plan, {
          provider: context.provider,
          providerCustomerEmail: context.providerCustomerEmail,
          providerOrigin: context.trustedOrigin,
          providerExpiresAt: expiry,
        });
        if (exact === null) return Object.freeze({ status: "conflict" });
        const schemaVersion = plan.kind === "canonical_variant" ? 2 : 1;
        if (
          schemaVersion === 2 &&
          !(await verifyBindings(context.provider, exact.providerBindingSnapshot))
        ) {
          return Object.freeze({ status: "unavailable" });
        }
        const requestHash = await hashProviderCheckoutRequest(
          {
            provider: context.provider,
            providerRequestSchemaVersion: schemaVersion,
            request: exact.request,
            ...(schemaVersion === 2
              ? { providerBindingSnapshot: exact.providerBindingSnapshot! }
              : {}),
          },
          input.sha256,
        );
        const preparationBase = {
          authority: "server_prepared_provider_request",
          provider: context.provider,
          providerIdempotencyKey: `checkout_attempt:${plan.identity.attemptId}`,
          providerRequestHash: requestHash,
          providerExpiresAt: expiry,
          providerCustomerEmail: context.providerCustomerEmail,
          providerOrigin: context.trustedOrigin,
          providerLivemode: context.expectedLivemode,
          providerScope: context.providerScope,
        } as const;
        const preparation: ProviderPreparation = schemaVersion === 1
          ? Object.freeze({
              ...preparationBase,
              providerRequestSchemaVersion: 1 as const,
            })
          : Object.freeze({
              ...preparationBase,
              providerRequestSchemaVersion: 2 as const,
              providerBindingSnapshot: exact.providerBindingSnapshot!,
            });
        const prepared = await input.checkoutService.prepare(
          quote.plan,
          preparation,
        );
        if (prepared.status === "facts_changed_retry") continue;
        if (prepared.status === "idempotency_conflict") {
          return Object.freeze({ status: "idempotency_conflict" });
        }
        if (prepared.status !== "prepared" && prepared.status !== "loaded") {
          return Object.freeze({ status: "conflict" });
        }
        const durable = await input.providerSessionRepository.load({
          buyerUserId: context.buyerUserId,
          idempotencyKey: startInput.idempotencyKey,
        });
        return durable === null
          ? Object.freeze({ status: "provider_unknown" })
          : guardProviderlessCanonicalCreate(
              durable,
              startInput.context,
              startInput,
              quote.status === "quoted" ? quote.pricingRevision : null,
            );
      }
      return Object.freeze({ status: "facts_changed_retry" });
    },
  });
}
