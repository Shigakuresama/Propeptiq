# Payments Architecture

## Provider boundary

Stripe-hosted Checkout is the first adapter, not a claim of business acceptance. Stripe's [official FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs) says research peptides require preventive measures against nonresearch purchasers and that account-activation review determines support. Live provider enablement remains an unresolved external launch input and maps to the `payment_provider` checkout gate.

## Checkout creation

The browser sends product IDs, quantities, destination, and promotion identifiers. The server:

1. authenticates the buyer and loads the current attestation;
2. reloads active products, versioned prices, promotions, destination rules, and inventory;
3. evaluates the six `CheckoutGate` values;
4. separately verifies tax configuration and shipping-service availability;
5. calculates integer-minor-unit totals and reserves inventory idempotently; and
6. creates hosted Checkout with an idempotency key and internal order reference.

Any missing or changed fact denies creation. Browser totals, provider redirect parameters, and cached catalog data are ignored.

## Tax and shipping quotes

Tax and shipping are quoted server-side and travel to the provider as ordinary line items. `buildStripeCheckoutRequestV1` appends a `Shipping` and a `Sales tax` line and proves `lines + shipping + tax === totalMinor` before building the request, so `amount_total` remains the exact sum of amounts the server computed.

Stripe Checkout `automatic_tax` is **rejected**, not merely unused. Enabling it would make Stripe compute `amount_total` from an address collected on the hosted page, which surrenders pricing authority to the provider and breaks both the server-recalculates-every-total rule and the session response validator. The buyer must also be shown an accurate tax figure before leaving the site, which `automatic_tax` cannot provide.

- `TaxQuotePort` is implemented against `POST /v1/tax/calculations` (`src/commerce/stripe-tax-provider.ts`). The calculation is made from the validated ship-to address with `address_source: "shipping"`; the server already holds that address, so no address collection is added to the Session and no billing address can decide the rate.
- `ShippingQuotePort` is implemented against a single owner-configured Stripe `ShippingRate` (`src/commerce/stripe-shipping-provider.ts`). The adapter retrieves exactly one configured `shr_` id and never lists rates and chooses between them: a selection heuristic would make an order total depend on dashboard ordering. An inactive, mispriced, non-fixed-amount, or wrong-livemode rate yields `unavailable` and blocks checkout rather than guessing a price.
- Both ports fail closed. `configuration_unavailable` marks an owner configuration fault, `unsupported_destination` an out-of-scope address, and `temporarily_unavailable` a transport or response-integrity fault.
- Stripe Tax calculates nothing in jurisdictions without an active registration; it returns zero tax silently. A zero figure from an unregistered account is not evidence the integration works.

`STRIPE_TAX_CODE` and `STRIPE_SHIPPING_RATE_ID` are optional in `env-schema.ts` and are deliberately absent from `requireFields`, because the synthetic local harness runs `TAX_MODE`/`SHIPPING_MODE` at `test` with no Stripe configuration. Enforcement lives at composition instead: `isPostgresBuyerCheckoutReady` refuses to build a buyer runtime unless every adapter is configured.

## Tax transaction recording

Because tax reaches the provider only as a line item, Stripe never sees the sale as taxed and it does not appear in Stripe Tax reporting. Tax is therefore collected correctly but unfilable unless a transaction is recorded.

- The verified-payment transaction enqueues a `stripe_tax_transaction` downstream effect alongside `payment_verified`, carrying the order id and the calculation id stored on the paying attempt's `tax_quote_reference`. The reference is read from the attempt the event names, not the order's newest attempt, so the calculation always matches the amount charged.
- A worker drains the effect and calls `POST /v1/tax/transactions/create_from_calculation`, keyed on the order id, which Stripe requires to be unique across all transactions and reversals.
- Disposition follows the effect repository's convention, in which `claimEffect` re-claims anything not `processed`, so only completion is terminal. A recorded or already-recorded transaction completes. A transient fault asks for a retry. A permanently unrecordable calculation -- an expired one, for instance -- also **completes**, because failing it would loop forever on something that can never succeed; it is journaled for manual reconciliation instead.
- Calculations expire 90 days after creation.

## Webhooks and journal

- Verify the provider signature against the raw request body before parsing business fields.
- Store each provider event ID once with its payload hash, attempt count, lease data, and one of six durable statuses: `pending`, `processing`, `processed`, `failed`, `deferred`, or `conflict`. `pending` awaits a claim; `processing` owns an expiring lease; `processed` is the only terminal idempotent-success state; `failed` is retryable; `deferred` awaits a prerequisite and can be explicitly woken/reclaimed; and `conflict` is a terminal incident, never success.
- A same-ID/same-hash replay returns idempotent success only when status is `processed`. `pending`, `failed`, and `deferred` are reclaimable, as is `processing` after lease expiry. An unexpired `processing` replay remains busy and must not receive terminal success. A changed hash for the same provider event ID becomes `conflict`.
- In one transaction, append payment state changes to `payment_events`, apply required internal state transitions, durably enqueue downstream effects, and mark the provider event `processed`. A failure leaves or marks the event retryable; never mutate payment state from the success page.
- Downstream effects use their own idempotency keys. This checkpoint implements durable effect records and a lease-aware worker factory with injected-sink tests. It does not implement a runtime scheduler/wake-up, a production sink or Resend delivery, bounded backoff/dead-letter operations, alerts, a structured telemetry pipeline, external firewall configuration, or webhook rate limiting. Those absent operational controls are launch blockers, not implied by the repository or worker tests.
- Preserve unknown event types safely for reconciliation without treating them as payment success.

## Refunds

An authorized MFA-authenticated staff user may request a full or partial refund with a reason and idempotency key. The server verifies remaining refundable balance, records the request, calls the provider, and confirms state only from authoritative provider response/event evidence. Concurrent or duplicate requests cannot over-refund.

## Invoicing

Institutional buyers on net terms are served by a separate flow, not a variation of hosted Checkout. `src/commerce/stripe-invoice-provider.ts` creates invoice items, drafts the invoice, and finalizes it, returning the hosted invoice page.

- `collection_method` is `send_invoice` and `auto_advance` is `false`. Nothing in this path may auto-charge a stored payment method.
- Every idempotency key derives from the order id, at all three steps. A duplicate invoice to an institutional buyer is a procurement incident.
- The finalized invoice is re-validated before it is trusted: amount due against the server total, exact `invoice.stripe.com` host on the hosted page, livemode, `send_invoice` collection, and metadata naming this order.
- Line item descriptions are customer-facing surface and must pass the content policy scanner before reaching the adapter. Metadata carries PO number and internal identifiers; metadata does not render on the customer PDF.
- With `automatic_tax` on an invoice, tax is calculated and locked at **finalization**, not at payment, and the Stripe Tax fee is charged at finalization whether or not the invoice is ever paid.

The event-side portion of the accepted Option B settlement policy is implemented. A verified `invoice.paid` event can move a durably bound order to `paid_pending_settlement`, but only after the locked `order_invoices` row, locked order total, event amount due, event amount paid, currency, `send_invoice` collection method, and exact provider/order identity agree and all monetary values are positive. A contradictory paid event becomes a durable conflict and cannot create payment evidence or move the order. `invoice.finalized` remains journal-only.

A verified `invoice.payment_failed` can reverse only an order still in `paid_pending_settlement`. It must describe the same locked positive amount due, zero paid amount, `open` status, and `send_invoice` collection method; unknown, restrictive, auto-charge, or mismatched facts conflict without moving the order. `credit_note.created` records a bound downstream ledger effect. Other unsupported provider events, including customer cash-balance events, remain safely ignored.

When `INVOICE_SETTLEMENT_WINDOW_DAYS` is configured, the webhook runtime passes it into the provider-event repository and a paid invoice schedules a durable `settlement_window_elapsed` effect. An absent window schedules no release, so the order remains held. Production use is still gated: the repository has no public institutional-order entry point, the settlement effect has no production scheduler/sink that authorizes release, customer cash-balance `funding_reversed` events are not processed, and live provider approval and operations are external launch requirements. The implemented repository and integration tests are not evidence that invoicing is enabled in production.

The event dispatch in `provider-event-repository.ts` ends in an exhaustiveness fence. A new normalized kind added without an explicit branch is a compile error rather than a silent fall-through into the dispute processor.

## Success and reconciliation

The return page reads internal order state and may say pending until a verified webhook arrives. Signed refund-reconciliation provider events can reconcile matching internal payment/refund state idempotently. There is no scheduled settlement fetch, authenticated reconciliation command, or period-closure system at this checkpoint. It never invents a paid state to match a redirect or dashboard appearance.

## Fulfillment separation

Payment does not authorize shipment by itself. Release rechecks verified payment, active holds, inventory, buyer status, product status, and current destination allowance, then consumes the release/shipment record once.
