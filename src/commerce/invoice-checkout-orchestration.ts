import "server-only";

import type {
  InvoiceProviderResultV1,
  StripeInvoiceRequestV1,
} from "@/commerce/stripe-invoice-provider";

/**
 * Issues a net-terms invoice for an already-authoritative order.
 *
 * This is deliberately a parallel flow to hosted Checkout rather than a mode of
 * it. The Checkout orchestrator is built end to end around Checkout Sessions —
 * session ids, session recovery, session-shaped durable state — and threading a
 * second instrument through it would couple two payment models that fail in
 * different ways. `docs/architecture/payments.md` already specifies invoicing as
 * a separate flow; this follows that.
 *
 * The server stays the authority on money. This orchestrator never computes a
 * total: it transports a request the durable claim already fixed, then refuses
 * anything the provider echoes back that does not match the order it claimed.
 *
 * Ambiguity is never failure. A provider outcome that could have created an
 * invoice returns "unknown" and is journaled with whatever identifier is known,
 * so a later reconciliation can resolve it rather than a retry double-billing.
 */
export type InvoiceCheckoutClaimV1 =
  | Readonly<{ status: "claimed"; request: StripeInvoiceRequestV1 }>
  | Readonly<{
      status: "already_open";
      providerInvoiceId: string;
      hostedInvoiceUrl: string;
    }>
  | Readonly<{ status: "ineligible"; reason: string }>;

export type InvoiceCheckoutPortV1 = Readonly<{
  claimInvoiceAttempt: (input: Readonly<{ orderId: string }>) => Promise<InvoiceCheckoutClaimV1>;
  recordInvoiceOpen: (input: Readonly<{
    orderId: string;
    providerInvoiceId: string;
    hostedInvoiceUrl: string;
    amountDueMinor: number;
  }>) => Promise<void>;
  recordInvoiceUnavailable: (input: Readonly<{
    orderId: string;
    evidenceCode: string;
    knownProviderInvoiceId: string | null;
  }>) => Promise<void>;
}>;

export type InvoiceCheckoutResultV1 =
  | Readonly<{ status: "open"; orderId: string; hostedInvoiceUrl: string }>
  | Readonly<{ status: "ineligible"; reason: string }>
  | Readonly<{ status: "unavailable"; reason: string }>
  /** Could have been created. Never retried blindly; never reported as failed. */
  | Readonly<{ status: "unknown"; reason: string }>;

export type InvoiceProviderPortV1 = Readonly<{
  createInvoice: (
    request: StripeInvoiceRequestV1,
  ) => Promise<InvoiceProviderResultV1>;
}>;

export function createInvoiceCheckoutOrchestratorV1(dependencies: Readonly<{
  invoiceProvider: InvoiceProviderPortV1;
  port: InvoiceCheckoutPortV1;
}>): Readonly<{
  startInvoice: (
    input: Readonly<{ orderId: string }>,
  ) => Promise<InvoiceCheckoutResultV1>;
}> {
  return Object.freeze({
    async startInvoice(input) {
      const claim = await dependencies.port.claimInvoiceAttempt({
        orderId: input.orderId,
      });

      if (claim.status === "ineligible") {
        return Object.freeze({
          status: "ineligible" as const,
          reason: claim.reason,
        });
      }
      if (claim.status === "already_open") {
        // Idempotent by construction: an order carries at most one open invoice,
        // so a repeat request returns the existing hosted page rather than
        // billing the buyer twice.
        return Object.freeze({
          status: "open" as const,
          orderId: input.orderId,
          hostedInvoiceUrl: claim.hostedInvoiceUrl,
        });
      }
      if (claim.request.orderId !== input.orderId) {
        return Object.freeze({
          status: "unavailable" as const,
          reason: "order_binding_mismatch",
        });
      }

      const result = await dependencies.invoiceProvider.createInvoice(
        claim.request,
      );

      if (result.status === "open") {
        if (result.invoice.orderId !== input.orderId) {
          // The provider echoed another order. Record nothing and claim nothing.
          return Object.freeze({
            status: "unavailable" as const,
            reason: "order_binding_mismatch",
          });
        }
        await dependencies.port.recordInvoiceOpen({
          orderId: input.orderId,
          providerInvoiceId: result.invoice.providerInvoiceId,
          hostedInvoiceUrl: result.invoice.hostedInvoiceUrl,
          amountDueMinor: result.invoice.amountDueMinor,
        });
        return Object.freeze({
          status: "open" as const,
          orderId: input.orderId,
          hostedInvoiceUrl: result.invoice.hostedInvoiceUrl,
        });
      }

      if (result.status === "definite_rejection") {
        await dependencies.port.recordInvoiceUnavailable({
          orderId: input.orderId,
          evidenceCode: result.evidenceCode,
          knownProviderInvoiceId: null,
        });
        return Object.freeze({
          status: "unavailable" as const,
          reason: "provider_rejected",
        });
      }

      await dependencies.port.recordInvoiceUnavailable({
        orderId: input.orderId,
        evidenceCode: result.evidenceCode,
        knownProviderInvoiceId: result.knownProviderInvoiceId,
      });
      return Object.freeze({
        status: "unknown" as const,
        reason: result.evidenceCode,
      });
    },
  });
}
