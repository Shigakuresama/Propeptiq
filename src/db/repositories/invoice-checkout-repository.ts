import "server-only";

import type {
  InvoiceCheckoutClaimV1,
  InvoiceCheckoutPortV1,
} from "@/commerce/invoice-checkout-orchestration";
import type { StripeInvoiceRequestV1 } from "@/commerce/stripe-invoice-provider";

/**
 * PostgreSQL driver for the net-terms invoice flow.
 *
 * The claim is what makes the flow safe. It reads the order's own authoritative
 * totals and builds the provider request from them, so the amount invoiced is
 * the amount the server already computed - the browser and the caller never
 * supply money. It also writes the durable binding row, which is what later
 * lets an inbound invoice event be resolved to an order from our record rather
 * than from provider metadata.
 *
 * Merchandise, shipping and tax travel as explicit lines, mirroring
 * buildStripeCheckoutRequestV1, so an invoice reconciles against an order the
 * same way a Checkout Session does.
 */
export type InvoiceCheckoutSqlClient = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

type OrderRow = Readonly<{
  state: string;
  currency: string;
  taxMinor: number | string;
  shippingMinor: number | string;
  totalMinor: number | string;
}>;

type ItemRow = Readonly<{
  productId: string;
  productName: string;
  packageForm: string;
  quantity: number | string;
  totalMinor: number | string;
}>;

type InvoiceRow = Readonly<{
  status: string;
  providerInvoiceId: string | null;
  hostedInvoiceUrl: string | null;
}>;

/** An order may be invoiced only while it is still awaiting payment. */
const INVOICEABLE_STATES = new Set(["checkout_pending"]);

function integer(value: number | string): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function boundedLabel(name: string, packageForm: string, quantity: number): string {
  return `${name}, ${packageForm}, quantity ${quantity}`;
}

export function createPostgresInvoiceCheckoutPort(dependencies: Readonly<{
  client: InvoiceCheckoutSqlClient;
}>): InvoiceCheckoutPortV1 {
  const { client } = dependencies;

  return Object.freeze({
    async claimInvoiceAttempt(input): Promise<InvoiceCheckoutClaimV1> {
      const existing = await client.query<InvoiceRow>(
        `SELECT status,
                provider_invoice_id AS "providerInvoiceId",
                hosted_invoice_url AS "hostedInvoiceUrl"
           FROM order_invoices WHERE order_id = $1::uuid`,
        [input.orderId],
      );
      const priorRow = existing.rows[0];
      if (
        priorRow !== undefined &&
        priorRow.status === "open" &&
        priorRow.providerInvoiceId !== null &&
        priorRow.hostedInvoiceUrl !== null
      ) {
        // At most one invoice per order. A repeat request returns the existing
        // hosted page rather than billing a procurement department twice.
        return Object.freeze({
          status: "already_open" as const,
          providerInvoiceId: priorRow.providerInvoiceId,
          hostedInvoiceUrl: priorRow.hostedInvoiceUrl,
        });
      }

      const orders = await client.query<OrderRow>(
        `SELECT state, currency,
                tax_minor AS "taxMinor",
                shipping_minor AS "shippingMinor",
                total_minor AS "totalMinor"
           FROM orders WHERE id = $1::uuid`,
        [input.orderId],
      );
      const order = orders.rows[0];
      if (order === undefined) {
        return Object.freeze({
          status: "ineligible" as const,
          reason: "order_not_found",
        });
      }
      if (!INVOICEABLE_STATES.has(order.state) || order.currency !== "USD") {
        return Object.freeze({
          status: "ineligible" as const,
          reason: "order_not_invoiceable",
        });
      }

      const items = await client.query<ItemRow>(
        `SELECT product_id::text AS "productId",
                product_name_snapshot AS "productName",
                package_form_snapshot AS "packageForm",
                quantity, total_minor AS "totalMinor"
           FROM order_items WHERE order_id = $1::uuid ORDER BY product_id`,
        [input.orderId],
      );
      if (items.rows.length === 0) {
        return Object.freeze({
          status: "ineligible" as const,
          reason: "order_not_invoiceable",
        });
      }

      const lines: Array<StripeInvoiceRequestV1["lines"][number]> = [];
      for (const item of items.rows) {
        const amountMinor = integer(item.totalMinor);
        const quantity = integer(item.quantity);
        if (amountMinor === null || quantity === null) {
          return Object.freeze({
            status: "ineligible" as const,
            reason: "order_not_invoiceable",
          });
        }
        lines.push(Object.freeze({
          productId: item.productId,
          description: boundedLabel(item.productName, item.packageForm, quantity),
          amountMinor,
        }));
      }

      const shippingMinor = integer(order.shippingMinor);
      const taxMinor = integer(order.taxMinor);
      const totalMinor = integer(order.totalMinor);
      if (shippingMinor === null || taxMinor === null || totalMinor === null) {
        return Object.freeze({
          status: "ineligible" as const,
          reason: "order_not_invoiceable",
        });
      }
      if (shippingMinor > 0) {
        lines.push(Object.freeze({
          productId: input.orderId,
          description: "Shipping",
          amountMinor: shippingMinor,
        }));
      }
      if (taxMinor > 0) {
        lines.push(Object.freeze({
          productId: input.orderId,
          description: "Sales tax",
          amountMinor: taxMinor,
        }));
      }

      // The invoice must reconcile to the order the server already priced.
      // Refusing here is what stops a partial or drifted order being billed.
      const sum = lines.reduce((running, line) => running + line.amountMinor, 0);
      if (sum !== totalMinor) {
        return Object.freeze({
          status: "ineligible" as const,
          reason: "order_total_mismatch",
        });
      }

      await client.query(
        `INSERT INTO order_invoices (order_id, provider, status)
         VALUES ($1::uuid, 'stripe', 'pending')
         ON CONFLICT (order_id) DO UPDATE
           SET status = 'pending', evidence_code = NULL,
               hosted_invoice_url = NULL, amount_due_minor = NULL,
               updated_at = now()`,
        [input.orderId],
      );

      return Object.freeze({
        status: "claimed" as const,
        request: Object.freeze({
          orderId: input.orderId,
          customerId: input.customerId,
          daysUntilDue: input.daysUntilDue,
          currency: "USD" as const,
          lines: Object.freeze(lines),
          metadata: Object.freeze({ orderId: input.orderId }),
        }),
      });
    },

    async recordInvoiceOpen(input) {
      await client.query(
        `UPDATE order_invoices
            SET status = 'open', provider_invoice_id = $2,
                hosted_invoice_url = $3, amount_due_minor = $4,
                evidence_code = NULL, updated_at = now()
          WHERE order_id = $1::uuid`,
        [
          input.orderId,
          input.providerInvoiceId,
          input.hostedInvoiceUrl,
          input.amountDueMinor,
        ],
      );
    },

    async recordInvoiceUnavailable(input) {
      // A known invoice id means the provider may have created one, so the
      // outcome is "unknown" and reconcilable. Without one it is a definite
      // rejection and nothing was billed.
      const status = input.knownProviderInvoiceId === null ? "unavailable" : "unknown";
      await client.query(
        `UPDATE order_invoices
            SET status = $2, evidence_code = $3, provider_invoice_id = $4,
                hosted_invoice_url = NULL, amount_due_minor = NULL,
                updated_at = now()
          WHERE order_id = $1::uuid`,
        [input.orderId, status, input.evidenceCode, input.knownProviderInvoiceId],
      );
    },
  });
}
