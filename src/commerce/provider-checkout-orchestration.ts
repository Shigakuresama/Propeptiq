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
import type { Sha256Hasher } from "@/commerce/checkout-identity";
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

  async function processDurable(
    durable: DurableCheckoutRequest,
    contextValue: ProviderExecutionContextV1,
    bindingsAlreadyVerified = false,
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
    const exact = requestFromDurable(durable);
    const rebuiltHash = exact === null
      ? null
      : await hashProviderCheckoutRequest(
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
    const adapter = context.adapter;
    if (
      exact === null ||
      rebuiltHash !== durable.providerRequestHash ||
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
      !bindingsAlreadyVerified &&
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
            : processDurable(durable, startInput.context);
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
          : processDurable(durable, startInput.context, schemaVersion === 2);
      }
      return Object.freeze({ status: "facts_changed_retry" });
    },
  });
}
